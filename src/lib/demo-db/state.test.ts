import { describe, expect, it } from 'vitest'
import { buildMarker, MARKER_KEY } from './guard'
import { readDatabaseState, type RawQueryClient } from './state'

/** Cliente fake que responde SQL por padrão; registra tudo o que foi executado. */
function fakeDb(opts: {
  tables: string[]
  systemId?: string | null
  migrations?: { name: string; done: boolean; rolledBack?: boolean }[]
  counts?: Record<string, number>
  marker?: unknown
}) {
  const executed: string[] = []
  const db: RawQueryClient = {
    async $queryRawUnsafe<T>(sql: string): Promise<T> {
      executed.push(sql)
      if (sql.includes('current_database')) return [{ name: 'demo' }] as T
      if (sql.includes('has_function_privilege')) return [{ ok: opts.systemId !== null }] as T
      if (sql.includes('pg_control_system')) {
        // Num Postgres real, este erro abortaria a transação inteira.
        if (opts.systemId === null) throw new Error('permission denied')
        return [{ id: opts.systemId ?? '42' }] as T
      }
      if (sql.includes('information_schema.tables')) return opts.tables.map((name) => ({ name })) as T
      if (sql.includes('_prisma_migrations')) {
        return (opts.migrations ?? []).map((m) => ({ ...m, rolledBack: m.rolledBack ?? false })) as T
      }
      const count = sql.match(/FROM "(\w+)"$/)
      if (sql.startsWith('SELECT count') && count) return [{ n: opts.counts?.[count[1]] ?? 0 }] as T
      if (sql.includes('FROM "Setting"')) return (opts.marker === undefined ? [] : [{ value: opts.marker }]) as T
      throw new Error(`SQL inesperado: ${sql}`)
    },
  }
  return { db, executed }
}

describe('readDatabaseState', () => {
  it('banco vazio: sem tabelas, sem migrations, sem marcador', async () => {
    const { db } = fakeDb({ tables: [] })
    const s = await readDatabaseState(db)
    expect(s).toMatchObject({
      databaseName: 'demo',
      systemIdentifier: '42',
      publicTables: [],
      appliedMigrations: [],
      marker: { kind: 'absent' },
      rowCounts: {},
    })
  })

  it('lê migrations (separando falhas/rollback), contagens e marcador', async () => {
    const marker = buildMarker('development', '42')
    const { db } = fakeDb({
      tables: ['_prisma_migrations', 'Setting', 'Product', 'Order'],
      migrations: [
        { name: 'b', done: true },
        { name: 'a', done: true },
        { name: 'c', done: false },
        { name: 'd', done: false, rolledBack: true },
      ],
      counts: { Product: 32, Setting: 1 },
      marker,
    })
    const s = await readDatabaseState(db)
    expect(s.appliedMigrations).toEqual(['a', 'b'])
    expect(s.failedMigrations).toEqual(['c'])
    expect(s.rowCounts).toEqual({ Setting: 1, Product: 32, Order: 0 })
    expect(s.marker).toEqual({ kind: 'valid', value: marker })
  })

  it('marcador malformado e fingerprint indisponível', async () => {
    const { db } = fakeDb({ tables: ['Setting'], systemId: null, marker: { project: 'x' } })
    const s = await readDatabaseState(db)
    expect(s.systemIdentifier).toBeNull()
    expect(s.marker).toEqual({ kind: 'invalid' })
  })

  it('sem permissão, NÃO chama pg_control_system() (não aborta a transação de leitura)', async () => {
    const { db, executed } = fakeDb({ tables: [], systemId: null })
    const s = await readDatabaseState(db)
    expect(s.systemIdentifier).toBeNull()
    expect(executed.some((sql) => /FROM pg_control_system\(\)/.test(sql))).toBe(false)
  })

  it('só executa SELECTs e consulta a chave do marcador', async () => {
    const { db, executed } = fakeDb({
      tables: ['_prisma_migrations', 'Setting', 'User'],
      migrations: [{ name: 'a', done: true }],
    })
    await readDatabaseState(db)
    expect(executed.every((sql) => /^\s*SELECT\b/i.test(sql))).toBe(true)
    expect(executed.some((sql) => sql.includes(MARKER_KEY))).toBe(true)
  })
})
