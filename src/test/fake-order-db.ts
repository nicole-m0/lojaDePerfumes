// Banco falso para os testes de src/server/order-transitions.ts e do estoque ligado
// a pedido. Não toca em PostgreSQL. Modela o necessário para exercitar concorrência:
//
// - `SELECT … FOR UPDATE` = trava POR PEDIDO, mantida até o fim da transação
//   (commit ou rollback); outra transação que peça a mesma trava espera;
// - `updateMany` com condição (status / saldo) devolve `count`, como o Prisma;
// - rollback desfaz tudo o que a transação gravou;
// - cada operação cede a vez (`setImmediate`), então transações simultâneas se
//   intercalam de verdade entre leituras e escritas.
//
// Limite conhecido: não reproduz o isolamento real do Postgres (MVCC, reavaliação
// do WHERE após espera de lock). Por isso há também testes estruturais do código.

export interface FakeOrder {
  id: string
  status: string
  number: number
  customerPhone: string | null
}
export interface FakeOrderItem {
  orderId: string
  productId: string
  productName: string
  quantity: number
}
export interface FakeProduct {
  id: string
  stockOnHand: number
}
export interface FakeMovement {
  id: string
  productId: string
  type: string
  reason: string | null
  quantity: number
  orderId: string | null
  userId: string | null
  note: string | null
}
export interface FakeEvent {
  id: string
  orderId: string
  type: string
  fromStatus: string | null
  toStatus: string | null
  note: string | null
  userId: string | null
}

const yieldTurn = () => new Promise<void>((resolve) => setImmediate(resolve))

export function makeFakeOrderDb() {
  const orders: FakeOrder[] = []
  const items: FakeOrderItem[] = []
  const products: FakeProduct[] = []
  const movements: FakeMovement[] = []
  const events: FakeEvent[] = []
  const locks = new Map<string, Promise<void>>()
  let seq = 0
  const nid = (p: string) => `${p}_${++seq}`
  /** Quantas vezes `FOR UPDATE` foi pedido (para conferir que a trava é usada). */
  const stats = { forUpdate: 0 }

  function makeTx() {
    const undo: (() => void)[] = []
    const held: (() => void)[] = []

    const tx = {
      async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
        await yieldTurn()
        const sql = strings.join('?')
        const orderId = String(values[0])
        if (/for update/i.test(sql)) {
          stats.forUpdate++
          while (locks.has(orderId)) await locks.get(orderId)
          let release!: () => void
          locks.set(orderId, new Promise<void>((r) => (release = r)))
          held.push(() => {
            locks.delete(orderId)
            release()
          })
        }
        return orders.some((o) => o.id === orderId) ? [{ id: orderId }] : []
      },
      order: {
        async findUnique({ where }: { where: { id: string } }) {
          await yieldTurn()
          const o = orders.find((x) => x.id === where.id)
          if (!o) return null
          return {
            ...o,
            items: items
              .filter((i) => i.orderId === o.id)
              .map(({ productId, productName, quantity }) => ({ productId, productName, quantity })),
          }
        },
        async updateMany({ where, data }: { where: { id: string; status: string }; data: { status: string } }) {
          await yieldTurn()
          const o = orders.find((x) => x.id === where.id && x.status === where.status)
          if (!o) return { count: 0 }
          const prev = o.status
          o.status = data.status
          undo.push(() => (o.status = prev))
          return { count: 1 }
        },
      },
      product: {
        async updateMany({
          where,
          data,
        }: {
          where: { id: string; stockOnHand: { gte: number } }
          data: { stockOnHand: { decrement: number } }
        }) {
          await yieldTurn()
          const p = products.find((x) => x.id === where.id && x.stockOnHand >= where.stockOnHand.gte)
          if (!p) return { count: 0 }
          p.stockOnHand -= data.stockOnHand.decrement
          undo.push(() => (p.stockOnHand += data.stockOnHand.decrement))
          return { count: 1 }
        },
        async update({ where, data }: { where: { id: string }; data: { stockOnHand: { increment: number } } }) {
          await yieldTurn()
          const p = products.find((x) => x.id === where.id)
          if (!p) throw new Error('product not found')
          p.stockOnHand += data.stockOnHand.increment
          undo.push(() => (p.stockOnHand -= data.stockOnHand.increment))
          return { ...p }
        },
      },
      stockMovement: {
        async findMany({ where }: { where: { orderId: string } }) {
          await yieldTurn()
          return movements
            .filter(
              (m) =>
                m.orderId === where.orderId &&
                ((m.type === 'OUTBOUND' && m.reason === 'SALE') || m.type === 'RETURN'),
            )
            .map(({ productId, type, reason, quantity }) => ({ productId, type, reason, quantity }))
        },
        async create({ data }: { data: Omit<FakeMovement, 'id' | 'note' | 'reason'> & Partial<FakeMovement> }) {
          await yieldTurn()
          const row: FakeMovement = { id: nid('mov'), note: null, reason: null, ...data } as FakeMovement
          movements.push(row)
          undo.push(() => movements.splice(movements.indexOf(row), 1))
          return { ...row }
        },
      },
      orderEvent: {
        async create({ data }: { data: Partial<FakeEvent> & { orderId: string; type: string } }) {
          await yieldTurn()
          const row: FakeEvent = { id: nid('evt'), fromStatus: null, toStatus: null, note: null, userId: null, ...data }
          events.push(row)
          undo.push(() => events.splice(events.indexOf(row), 1))
          return { ...row }
        },
      },
    }
    return {
      tx,
      rollback: () => {
        while (undo.length) undo.pop()!()
      },
      release: () => {
        while (held.length) held.pop()!()
      },
    }
  }

  return {
    state: { orders, items, products, movements, events },
    stats,
    seedProduct(id: string, stockOnHand: number) {
      products.push({ id, stockOnHand })
    },
    seedOrder(o: Partial<FakeOrder> & { lines: { productId: string; productName?: string; quantity: number }[] }) {
      const order: FakeOrder = {
        id: o.id ?? nid('ord'),
        status: o.status ?? 'PENDING',
        number: o.number ?? orders.length + 1,
        customerPhone: o.customerPhone ?? null,
      }
      orders.push(order)
      for (const l of o.lines) {
        items.push({ orderId: order.id, productId: l.productId, productName: l.productName ?? l.productId, quantity: l.quantity })
      }
      return order
    },
    stock(productId: string) {
      return products.find((p) => p.id === productId)!.stockOnHand
    },
    order(id: string) {
      return orders.find((o) => o.id === id)!
    },
    async $transaction<T>(fn: (tx: never) => Promise<T>): Promise<T> {
      const { tx, rollback, release } = makeTx()
      try {
        return await fn(tx as never)
      } catch (err) {
        rollback()
        throw err
      } finally {
        release()
      }
    },
  }
}

export type FakeOrderDb = ReturnType<typeof makeFakeOrderDb>
