import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// Remoção de produto pelo painel.
//
// `OrderItem` e `StockMovement` referenciam `Product` com FK RESTRICT: apagar um
// produto que já foi vendido ou movimentado quebraria (erro 500) e, se fosse
// possível, apagaria histórico. Regra:
// - produto com pedidos OU movimentações de estoque → ARQUIVADO (some da loja,
//   continua no admin e nos pedidos; pode ser reativado mudando o status);
// - produto sem nenhum vínculo → excluído de fato (imagens/specs em cascata).

export type ProductRemovalOutcome = 'deleted' | 'archived' | 'not_found'

/** P2003 = violação de FK — um vínculo surgiu entre a checagem e o DELETE. */
function isForeignKeyViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003'
}

async function archive(productId: string): Promise<ProductRemovalOutcome> {
  await prisma.product.update({
    where: { id: productId },
    data: { status: 'ARCHIVED', featured: false },
  })
  return 'archived'
}

export async function removeProduct(productId: string): Promise<ProductRemovalOutcome> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, _count: { select: { orderItems: true, stockMovements: true } } },
  })
  if (!product) return 'not_found'

  if (product._count.orderItems > 0 || product._count.stockMovements > 0) {
    return archive(productId)
  }

  try {
    await prisma.product.delete({ where: { id: productId } })
    return 'deleted'
  } catch (err) {
    // Corrida: um pedido/movimentação foi criado depois da contagem. A FK barrou
    // o DELETE (nada foi apagado) — arquiva em vez de estourar erro 500.
    if (isForeignKeyViolation(err)) return archive(productId)
    throw err
  }
}
