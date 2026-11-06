// Papéis e permissões do painel — funções puras, usadas pelo servidor (autorização)
// e pela interface (o que mostrar). A autorização vale SEMPRE no servidor; a
// interface só esconde o que o servidor já recusaria.

export type RoleValue = 'OWNER' | 'ADMIN' | 'STAFF' | 'CUSTOMER'

/** Papéis com acesso ao painel administrativo. CUSTOMER nunca entra. */
export const STAFF_ROLES: readonly RoleValue[] = ['OWNER', 'ADMIN', 'STAFF']

/**
 * - `panel`: acesso ao painel e às operações do dia a dia (produtos, estoque,
 *   pedidos, pagamentos, entregas, retornos);
 * - `finance`: financeiro, despesas e números de faturamento;
 * - `productCost`: ver e alterar o custo dos produtos;
 * - `paymentReverse`: estorno e chargeback.
 */
export type Permission = 'panel' | 'finance' | 'productCost' | 'paymentReverse'

const PERMISSIONS: Record<Permission, readonly RoleValue[]> = {
  panel: ['OWNER', 'ADMIN', 'STAFF'],
  finance: ['OWNER', 'ADMIN'],
  productCost: ['OWNER', 'ADMIN'],
  paymentReverse: ['OWNER'],
}

export function isStaffRole(role: unknown): role is RoleValue {
  return typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role)
}

export function can(role: unknown, permission: Permission): boolean {
  return typeof role === 'string' && (PERMISSIONS[permission] as readonly string[]).includes(role)
}
