import type { Prisma } from '@prisma/client'

/**
 * Trava pessimista da linha do pedido (`SELECT … FOR UPDATE`) dentro da transação
 * do chamador. Sob READ COMMITTED (padrão do PostgreSQL), uma segunda transação que
 * peça a mesma trava espera a primeira terminar e, ao continuar, relê o estado já
 * gravado. Serializa TODA mutação ligada ao pedido: pagamentos, status e estoque.
 *
 * Deve ser a PRIMEIRA operação da transação. Devolve `false` se o pedido não existe.
 *
 * Módulo sem dependências de runtime (só tipos do Prisma): pode ser importado por
 * `payments.ts`, `stock.ts` e `order-transitions.ts` sem risco de ciclo.
 */
/**
 * Tempos das transações que travam o pedido (status, estoque e pagamentos).
 *
 * Com `connection_limit=1`, cada instância do app tem UMA conexão: uma transação
 * espera a conexão ficar livre (`maxWait`) e, já dentro, pode esperar a trava do
 * pedido segurada por outra (`timeout` conta esse tempo).
 * - maxWait 5 s (padrão do Prisma: 2 s): absorve a fila de uma requisição em curso
 *   na mesma instância sem estourar à toa; acima disso, falha com erro claro.
 * - timeout 10 s (padrão: 5 s): pior caso ~6 + 2×(produtos) consultas pelo pooler
 *   (dezenas de ms cada), mais a espera da trava; cabe no limite de duração das
 *   funções da Vercel, para o erro vir da transação e não de um corte da função.
 */
export const ORDER_TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const

export async function lockOrderRow(tx: Prisma.TransactionClient, orderId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
  `
  return rows.length > 0
}
