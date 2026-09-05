// Fake do Prisma para testes de `src/server/payments.ts` e `src/server/mercadopago.ts`.
//
// Não bate no PostgreSQL real (o CI não tem DATABASE_URL). Modela o subconjunto
// usado pelos serviços com fidelidade suficiente para exercitar a orquestração:
// transação, rollback em erro, escrita de Payment/OrderEvent e a resincronização
// de Order.paymentStatus.
//
// `SELECT … FOR UPDATE` é modelado como um mutex global por instância: uma segunda
// transação que peça o lock enquanto outra o mantém fica bloqueada até a primeira
// terminar — é isso que impede o overpayment concorrente.

export interface Row {
  [k: string]: unknown
}

export function makeFakePrisma() {
  const orders: Row[] = []
  const payments: Row[] = []
  const orderEvents: Row[] = []
  let seq = 0
  const nid = (p: string) => `${p}_${++seq}`

  // Mutex global — modela o lock de linha do Order (`FOR UPDATE`).
  let lockHolder: Promise<void> | null = null

  function makeTx() {
    const undo: (() => void)[] = []
    let release: (() => void) | null = null

    return {
      async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
        const sql = strings.join('?')
        if (/for update/i.test(sql)) {
          while (lockHolder) await lockHolder
          lockHolder = new Promise<void>((resolve) => {
            release = () => {
              lockHolder = null
              release = null
              resolve()
            }
          })
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
          return r
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
      _rollback() {
        while (undo.length) undo.pop()!()
      },
      _release() {
        if (release) release()
      },
    }
  }

  return {
    _state: { orders, payments, orderEvents },
    seedOrder(o: Row = {}) {
      const row: Row = { id: nid('ord'), totalCents: 10000, paymentStatus: 'PENDING', ...o }
      orders.push(row)
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
