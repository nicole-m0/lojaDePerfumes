/**
 * Proteção de isolamento do banco de demonstração (Etapa C).
 *
 * Nenhum script de escrita (migrate / init / seed) roda sem antes passar por
 * `evaluateCommand`. As regras garantem que só um banco NOVO e IDENTIFICADO como
 * demonstração recebe escrita:
 *
 *  - o servidor nunca pode ser o banco legado (fingerprint `system_identifier`);
 *  - o servidor precisa ser identificável (sem fingerprint = recusa);
 *  - `migrate` só roda num banco totalmente vazio (sem tabelas) ou num banco já
 *    marcado como demo do MESMO alvo;
 *  - `init` (grava o marcador) só roda com schema completo, sem marcador e com
 *    todas as tabelas de negócio vazias;
 *  - `seed` exige o marcador do mesmo alvo, gravado neste mesmo servidor, e as
 *    migrations em dia.
 *
 * Este módulo é puro (sem Prisma): a leitura do estado fica em `state.ts`.
 */

export const DEMO_PROJECT = 'bella-cheirosa-demo'

/** Chave do marcador gravado em `Setting` pelo `init`. */
export const MARKER_KEY = 'deployment.environment'

export const DEMO_TARGETS = ['development', 'production'] as const
export type DemoTarget = (typeof DEMO_TARGETS)[number]

/**
 * Fingerprints (`pg_control_system().system_identifier`) de servidores que NUNCA
 * podem receber escrita destes scripts. Não é credencial: identifica o cluster.
 * - 7678803170604773431: banco legado (Railway, projeto "resilient-youth"),
 *   registrado na fotografia C.0 de 2026-11-05.
 */
export const LEGACY_SYSTEM_IDENTIFIERS: readonly string[] = ['7678803170604773431']

/** Tabelas de negócio que precisam estar vazias para o `init`. */
export const BUSINESS_TABLES = [
  'User',
  'Setting',
  'Category',
  'Brand',
  'Product',
  'Customer',
  'Order',
  'Payment',
  'StockMovement',
  'Expense',
] as const

export interface DemoMarker {
  project: string
  environment: DemoTarget
  systemIdentifier: string
  initializedAt: string
}

export interface DatabaseState {
  databaseName: string
  /** `null` quando o servidor não expõe o fingerprint (ex.: sem permissão). */
  systemIdentifier: string | null
  /** Tabelas existentes no schema `public`. */
  publicTables: string[]
  /** Migrations concluídas (`finished_at` preenchido). */
  appliedMigrations: string[]
  /** Migrations iniciadas e não concluídas (falhas). */
  failedMigrations: string[]
  /** Marcador lido de `Setting`: ausente, válido ou malformado. */
  marker: { kind: 'absent' } | { kind: 'valid'; value: DemoMarker } | { kind: 'invalid' }
  /** Contagem de linhas por tabela de negócio (só as que existem). */
  rowCounts: Partial<Record<(typeof BUSINESS_TABLES)[number], number>>
}

export type DemoCommand = 'migrate' | 'init' | 'seed'

export type Evaluation = { ok: true } | { ok: false; reasons: string[] }

export function parseTarget(argv: readonly string[]): DemoTarget {
  const arg = argv.find((a) => a.startsWith('--target='))
  const value = arg?.slice('--target='.length)
  if (!value || !(DEMO_TARGETS as readonly string[]).includes(value)) {
    throw new Error(`Informe o alvo explicitamente: --target=${DEMO_TARGETS.join('|')}`)
  }
  return value as DemoTarget
}

export function parseMarker(value: unknown): DemoMarker | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (
    v.project !== DEMO_PROJECT ||
    typeof v.environment !== 'string' ||
    !(DEMO_TARGETS as readonly string[]).includes(v.environment) ||
    typeof v.systemIdentifier !== 'string' ||
    !v.systemIdentifier ||
    typeof v.initializedAt !== 'string'
  ) {
    return null
  }
  return v as unknown as DemoMarker
}

export function buildMarker(target: DemoTarget, systemIdentifier: string, now = new Date()): DemoMarker {
  return {
    project: DEMO_PROJECT,
    environment: target,
    systemIdentifier,
    initializedAt: now.toISOString(),
  }
}

function migrationProblems(state: DatabaseState, expected: readonly string[]): string[] {
  const problems: string[] = []
  if (state.failedMigrations.length) {
    problems.push(`migrations com falha no banco: ${state.failedMigrations.join(', ')}`)
  }
  const missing = expected.filter((m) => !state.appliedMigrations.includes(m))
  if (missing.length) problems.push(`migrations pendentes: ${missing.join(', ')}`)
  const unknown = state.appliedMigrations.filter((m) => !expected.includes(m))
  if (unknown.length) problems.push(`migrations desconhecidas no banco: ${unknown.join(', ')}`)
  return problems
}

/** Regras comuns a todos os comandos: servidor identificável e não legado. */
function identityProblems(state: DatabaseState): string[] {
  if (!state.systemIdentifier) {
    return ['não foi possível identificar o servidor (pg_control_system indisponível) — recusado por segurança']
  }
  if (LEGACY_SYSTEM_IDENTIFIERS.includes(state.systemIdentifier)) {
    return ['este é o BANCO LEGADO — nenhuma escrita é permitida']
  }
  return []
}

function markerProblems(state: DatabaseState, target: DemoTarget): string[] {
  if (state.marker.kind === 'absent') {
    return ['banco sem marcador de demonstração (rode `init` num banco novo)']
  }
  if (state.marker.kind === 'invalid') return ['marcador de demonstração malformado']
  const m = state.marker.value
  const problems: string[] = []
  if (m.environment !== target) {
    problems.push(`marcador é de "${m.environment}", mas o alvo pedido é "${target}"`)
  }
  if (m.systemIdentifier !== state.systemIdentifier) {
    problems.push('marcador foi gravado em outro servidor (cópia/restore?) — recusado')
  }
  return problems
}

export function evaluateCommand(
  command: DemoCommand,
  state: DatabaseState,
  target: DemoTarget,
  expectedMigrations: readonly string[],
): Evaluation {
  const reasons = [...identityProblems(state)]

  if (reasons.length === 0) {
    switch (command) {
      case 'migrate': {
        const pristine = state.publicTables.length === 0
        if (!pristine) reasons.push(...markerProblems(state, target))
        break
      }
      case 'init': {
        if (state.marker.kind !== 'absent') reasons.push('banco já possui marcador — `init` só roda uma vez')
        reasons.push(...migrationProblems(state, expectedMigrations))
        for (const table of BUSINESS_TABLES) {
          const count = state.rowCounts[table]
          if (count === undefined) reasons.push(`tabela ${table} não existe`)
          else if (count > 0) reasons.push(`tabela ${table} não está vazia (${count} linhas)`)
        }
        break
      }
      case 'seed': {
        reasons.push(...markerProblems(state, target))
        reasons.push(...migrationProblems(state, expectedMigrations))
        break
      }
    }
  }

  return reasons.length ? { ok: false, reasons } : { ok: true }
}
