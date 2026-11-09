import { BUSINESS_TABLES, MARKER_KEY, parseMarker, type DatabaseState } from './guard'

/** Subconjunto do PrismaClient usado aqui (facilita testes com fake). */
export interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

/**
 * Lê o estado do banco necessário para a proteção de isolamento.
 * SOMENTE LEITURA: apenas SELECTs (os scripts ainda abrem esta leitura numa
 * conexão com `default_transaction_read_only=on`).
 */
export async function readDatabaseState(db: RawQueryClient): Promise<DatabaseState> {
  const [info] = await db.$queryRawUnsafe<{ name: string }[]>('SELECT current_database() AS name')

  // Confere a permissão ANTES de chamar pg_control_system(): dentro de uma
  // transação, um erro de permissão abortaria todas as consultas seguintes.
  // Sem permissão → `null`, e a proteção (guard.ts) recusa qualquer escrita.
  let systemIdentifier: string | null = null
  const [priv] = await db.$queryRawUnsafe<{ ok: boolean }[]>(
    "SELECT has_function_privilege('pg_control_system()', 'EXECUTE') AS ok",
  )
  if (priv?.ok === true) {
    const [sys] = await db.$queryRawUnsafe<{ id: string }[]>(
      'SELECT system_identifier::text AS id FROM pg_control_system()',
    )
    systemIdentifier = sys?.id ?? null
  }

  const publicTables = (
    await db.$queryRawUnsafe<{ name: string }[]>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    )
  ).map((t) => t.name)

  let appliedMigrations: string[] = []
  let failedMigrations: string[] = []
  if (publicTables.includes('_prisma_migrations')) {
    const rows = await db.$queryRawUnsafe<{ name: string; done: boolean; rolledBack: boolean }[]>(
      'SELECT migration_name AS name, finished_at IS NOT NULL AS done, rolled_back_at IS NOT NULL AS "rolledBack" FROM _prisma_migrations',
    )
    appliedMigrations = rows.filter((r) => r.done && !r.rolledBack).map((r) => r.name).sort()
    failedMigrations = rows.filter((r) => !r.done && !r.rolledBack).map((r) => r.name).sort()
  }

  const rowCounts: DatabaseState['rowCounts'] = {}
  for (const table of BUSINESS_TABLES) {
    if (!publicTables.includes(table)) continue
    const [row] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${table}"`)
    rowCounts[table] = row.n
  }

  let marker: DatabaseState['marker'] = { kind: 'absent' }
  if (publicTables.includes('Setting')) {
    const rows = await db.$queryRawUnsafe<{ value: unknown }[]>(
      `SELECT value FROM "Setting" WHERE key = '${MARKER_KEY}'`,
    )
    if (rows.length) {
      const parsed = parseMarker(rows[0].value)
      marker = parsed ? { kind: 'valid', value: parsed } : { kind: 'invalid' }
    }
  }

  return {
    databaseName: info.name,
    systemIdentifier,
    publicTables,
    appliedMigrations,
    failedMigrations,
    marker,
    rowCounts,
  }
}
