// Fake do Prisma para testes de `src/server/payments.ts` e `src/server/mercadopago.ts`.
//
// Não bate no PostgreSQL real (o CI não tem DATABASE_URL). Modela o subconjunto
// usado pelos serviços com fidelidade suficiente para exercitar a orquestração:
// transação, rollback em erro, escrita de Payment/OrderEvent e a resincronização
// de Order.paymentStatus.
//
// `SELECT … FOR UPDATE` é modelado como um mutex global por instância: uma segunda
// transação que peça o lock enquanto outra o mantém fica bloqueada até a primeira
// terminar — é isso que impede o overpayment concorrente. Como no PostgreSQL, a
// mesma transação pode pedir a trava de novo sem se bloquear (reentrante).
//
// Etapa D2: modela também itens do pedido, produtos (saldo) e movimentações de
// estoque, o suficiente para a confirmação automática (status condicional, trava
// dos produtos e baixa condicional). `failOnce(op)` faz a próxima chamada de uma
// operação lançar erro — para testar rollback sem confirmação parcial.

export interface Row {
  [k: string]: unknown
}

export function makeFakePrisma() {
  const orders: Row[] = []
  const payments: Row[] = []
  const orderEvents: Row[] = []
  const orderItems: Row[] = []
  const products: Row[] = []
  const stockMovements: Row[] = []
  const failures = new Set<string>()
  const maybeFail = (op: string) => {
    if (failures.delete(op)) throw new Error(`falha simulada em ${op}`)
  }
  let seq = 0
  const nid = (p: string) => `${p}_${++seq}`

  // Mutex global — modela o lock de linha do Order (`FOR UPDATE`).
  let lockHolder: Promise<void> | null = null

  function makeTx() {
    const undo: (() => void)[] = []
    let release: (() => void) | null = null

    async function acquire() {
      if (release) return // esta transação já tem a trava (reentrante)
      while (lockHolder) await lockHolder
      lockHolder = new Promise<void>((resolve) => {
        release = () => {
          lockHolder = null
          release = null
          resolve()
        }
      })
    }

    return {
      async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
        const sql = strings.join('?')
        if (/for update/i.test(sql)) await acquire()
        if (/from "Product"/i.test(sql)) {
          const ids = values[0] as string[]
          return products
            .filter((p) => ids.includes(p.id as string))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
            .map((p) => ({ id: p.id, stockOnHand: p.stockOnHand }))
        }
        const orderId = values[0]
        return orders.some((o) => o.id === orderId) ? [{ id: orderId }] : []
      },
      order: {
        async findUnique({ where, select }: { where: { id: string }; select?: Row }) {
          const o = orders.find((x) => x.id === where.id)
          if (!o) return null
          const r: Row = { ...o }
          if (select?.payments) {
            r.payments = payments.filter((p) => p.orderId === o.id).map((p) => ({ ...p }))
          }
          if (select?.items) {
            r.items = orderItems
              .filter((i) => i.orderId === o.id)
              .map(({ productId, productName, quantity }) => ({ productId, productName, quantity }))
          }
          return r
        },
        async updateMany({ where, data }: { where: { id: string; status: string }; data: Row }) {
          maybeFail('order.updateMany')
          const o = orders.find((x) => x.id === where.id && x.status === where.status)
          if (!o) return { count: 0 }
          const prev = { ...o }
          Object.assign(o, data)
          undo.push(() => Object.assign(o, prev))
          return { count: 1 }
        },
        async update({ where, data }: { where: { id: string }; data: Row }) {
          const o = orders.find((x) => x.id === where.id)
          if (!o) throw new Error('order not found')
          const prev = { ...o }
          Object.assign(o, data)
          undo.push(() => Object.assign(o, prev))
          return { ...o }
        },
      },
      payment: {
        async create({ data }: { data: Row }) {
          const row: Row = { id: nid('pay'), paidAt: null, createdAt: new Date(), notes: null, ...data }
          payments.push(row)
          undo.push(() => {
            const i = payments.indexOf(row)
            if (i >= 0) payments.splice(i, 1)
          })
          return { ...row }
        },
        async update({ where, data }: { where: { id: string }; data: Row }) {
          const p = payments.find((x) => x.id === where.id)
          if (!p) throw new Error('payment not found')
          const prev = { ...p }
          Object.assign(p, data)
          undo.push(() => Object.assign(p, prev))
          return { ...p }
        },
      },
      orderEvent: {
        async create({ data }: { data: Row }) {
          const row: Row = {
            id: nid('evt'),
            createdAt: new Date(),
            fromStatus: null,
            toStatus: null,
            note: null,
            userId: null,
            ...data,
          }
          orderEvents.push(row)
          undo.push(() => {
            const i = orderEvents.indexOf(row)
            if (i >= 0) orderEvents.splice(i, 1)
          })
          return { ...row }
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
          maybeFail('product.updateMany')
          const p = products.find(
            (x) => x.id === where.id && (x.stockOnHand as number) >= where.stockOnHand.gte,
          )
          if (!p) return { count: 0 }
          const qty = data.stockOnHand.decrement
          p.stockOnHand = (p.stockOnHand as number) - qty
          undo.push(() => (p.stockOnHand = (p.stockOnHand as number) + qty))
          return { count: 1 }
        },
      },
      stockMovement: {
        async findMany({ where }: { where: { orderId: string } }) {
          return stockMovements
            .filter(
              (m) =>
                m.orderId === where.orderId &&
                ((m.type === 'OUTBOUND' && m.reason === 'SALE') || m.type === 'RETURN'),
            )
            .map(({ productId, type, reason, quantity }) => ({ productId, type, reason, quantity }))
        },
        async create({ data }: { data: Row }) {
          maybeFail('stockMovement.create')
          const row: Row = { id: nid('mov'), note: null, reason: null, createdAt: new Date(), ...data }
          stockMovements.push(row)
          undo.push(() => {
            const i = stockMovements.indexOf(row)
            if (i >= 0) stockMovements.splice(i, 1)
          })
          return { ...row }
        },
      },
      _rollback() {
        while (undo.length) undo.pop()!()
      },
      _release() {
        if (release) release()
      },
    }
  }

  return {
    _state: { orders, payments, orderEvents, orderItems, products, stockMovements },
    /** A próxima chamada de `op` (ex.: 'stockMovement.create') lança erro. */
    failOnce(op: string) {
      failures.add(op)
    },
    seedOrder(o: Row = {}) {
      const row: Row = {
        id: nid('ord'),
        number: orders.length + 1,
        status: 'PENDING',
        customerPhone: null,
        totalCents: 10000,
        paymentStatus: 'PENDING',
        ...o,
      }
      orders.push(row)
      return row
    },
    seedItem(i: { orderId: string; productId: string; productName?: string; quantity: number }) {
      const row: Row = { id: nid('item'), productName: i.productId, ...i }
      orderItems.push(row)
      return row
    },
    seedProduct(id: string, stockOnHand: number) {
      const row: Row = { id, stockOnHand }
      products.push(row)
      return row
    },
    seedPayment(p: Row) {
      const row: Row = {
        id: nid('pay'),
        status: 'PENDING',
        method: 'PIX',
        paidAt: null,
        createdAt: new Date(),
        notes: null,
        provider: null,
        providerPaymentId: null,
        providerStatus: null,
        ...p,
      }
      payments.push(row)
      return row
    },
    order: {
      async findUnique({ where, select }: { where: { id: string }; select?: Row }) {
        const o = orders.find((x) => x.id === where.id)
        if (!o) return null
        const r: Row = {}
        for (const k of Object.keys(select ?? o)) r[k] = o[k]
        return r
      },
    },
    orderEvent: {
      async create({ data }: { data: Row }) {
        const row: Row = {
          id: nid('evt'),
          createdAt: new Date(),
          fromStatus: null,
          toStatus: null,
          note: null,
          userId: null,
          ...data,
        }
        orderEvents.push(row)
        return { ...row }
      },
    },
    async $transaction<T>(fn: (tx: ReturnType<typeof makeTx>) => Promise<T>): Promise<T> {
      const tx = makeTx()
      try {
        return await fn(tx)
      } catch (err) {
        tx._rollback()
        throw err
      } finally {
        tx._release()
      }
    },
  }
}

export type FakePrisma = ReturnType<typeof makeFakePrisma>
