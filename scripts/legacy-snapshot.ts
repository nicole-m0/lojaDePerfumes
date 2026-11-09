/**
 * Fotografia de segurança de um banco (SOMENTE LEITURA).
 *
 * Registra contagens, datas (min/max de createdAt/updatedAt) e hashes SHA-256 do
 * conteúdo de cada tabela — usado para provar que o banco legado permanece
 * intacto durante a Etapa C. Não grava NADA no banco:
 *   1. a conexão é aberta com `default_transaction_read_only=on`;
 *   2. todas as leituras rodam numa transação `SET TRANSACTION READ ONLY`;
 *   3. o script confere `transaction_read_only = on` antes de ler.
 *
 * Uso:
 *   npx tsx scripts/legacy-snapshot.ts                       # grava .snapshots/<data>.json
 *   npx tsx scripts/legacy-snapshot.ts --compare <arquivo>   # compara com uma fotografia
 *
 * A saída não contém host, usuário, senha nem dados pessoais (só hashes/contagens).
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { withReadOnlyOption } from '../src/lib/demo-db/connection'

// Tabelas do schema Prisma (nome físico = nome do model).
const TABLES = [
  'User', 'Account', 'Session', 'VerificationToken', 'Setting',
  'Category', 'Brand', 'Product', 'ProductImage', 'ProductSpec',
  'Customer', 'Order', 'OrderItem', 'OrderAddress', 'Payment', 'Shipment',
  'ShippingQuote', 'Invoice', 'StockMovement', 'OrderEvent', 'Expense', 'WhatsAppMessage',
] as const

interface TableSnapshot {
  count: number
  createdAtMin: string | null
  createdAtMax: string | null
  updatedAtMax: string | null
  sha256: string
}

interface Snapshot {
  takenAt: string
  database: { name: string; serverVersion: string; systemIdentifier: string | null }
  migrations: string[]
  tables: Record<string, TableSnapshot>
}

function stable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
    )
  }
  return value
}

function iso(v: unknown): string | null {
  return v instanceof Date ? v.toISOString() : v == null ? null : String(v)
}

async function takeSnapshot(): Promise<Snapshot> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não definida.')
  const prisma = new PrismaClient({ datasourceUrl: withReadOnlyOption(url) })
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
        const [ro] = await tx.$queryRawUnsafe<{ ro: string }[]>(
          "SELECT current_setting('transaction_read_only') AS ro",
        )
        if (ro.ro !== 'on') throw new Error('Transação não está em modo somente leitura — abortado.')

        const [info] = await tx.$queryRawUnsafe<{ name: string; version: string }[]>(
          "SELECT current_database() AS name, current_setting('server_version') AS version",
        )
        let systemIdentifier: string | null = null
        try {
          const [sys] = await tx.$queryRawUnsafe<{ id: string }[]>(
            'SELECT system_identifier::text AS id FROM pg_control_system()',
          )
          systemIdentifier = sys.id
        } catch {
          systemIdentifier = null
        }

        const migrations = (
          await tx.$queryRawUnsafe<{ name: string }[]>(
            'SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name',
          )
        ).map((m) => m.name)

        const columns = await tx.$queryRawUnsafe<{ table: string; column: string }[]>(
          `SELECT table_name AS "table", column_name AS "column"
             FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name IN ('createdAt', 'updatedAt')`,
        )
        const has = (t: string, c: string) => columns.some((x) => x.table === t && x.column === c)

        const tables: Record<string, TableSnapshot> = {}
        for (const t of TABLES) {
          const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT * FROM "${t}" ORDER BY 1, 2`,
          )
          const canonical = rows.map((r) => JSON.stringify(stable(r))).sort()
          const sha256 = createHash('sha256').update(canonical.join('\n')).digest('hex')
          const dates = rows.reduce<{ cMin: Date | null; cMax: Date | null; uMax: Date | null }>(
            (acc, r) => {
              const c = has(t, 'createdAt') ? (r.createdAt as Date) : null
              const u = has(t, 'updatedAt') ? (r.updatedAt as Date) : null
              if (c && (!acc.cMin || c < acc.cMin)) acc.cMin = c
              if (c && (!acc.cMax || c > acc.cMax)) acc.cMax = c
              if (u && (!acc.uMax || u > acc.uMax)) acc.uMax = u
              return acc
            },
            { cMin: null, cMax: null, uMax: null },
          )
          tables[t] = {
            count: rows.length,
            createdAtMin: iso(dates.cMin),
            createdAtMax: iso(dates.cMax),
            updatedAtMax: iso(dates.uMax),
            sha256,
          }
        }

        return {
          takenAt: new Date().toISOString(),
          database: { name: info.name, serverVersion: info.version, systemIdentifier },
          migrations,
          tables,
        }
      },
      { timeout: 120_000, maxWait: 30_000 },
    )
  } finally {
    await prisma.$disconnect()
  }
}

function compare(before: Snapshot, after: Snapshot): string[] {
  const diffs: string[] = []
  if (before.database.systemIdentifier !== after.database.systemIdentifier) {
    diffs.push('database.systemIdentifier difere (é outro servidor?)')
  }
  if (before.migrations.join() !== after.migrations.join()) diffs.push('migrations diferem')
  for (const t of TABLES) {
    const a = before.tables[t]
    const b = after.tables[t]
    if (!a || !b) {
      diffs.push(`${t}: ausente em uma das fotografias`)
      continue
    }
    for (const k of ['count', 'createdAtMax', 'updatedAtMax', 'sha256'] as const) {
      if (a[k] !== b[k]) diffs.push(`${t}.${k}: ${a[k]} → ${b[k]}`)
    }
  }
  return diffs
}

async function main() {
  const args = process.argv.slice(2)
  const compareIdx = args.indexOf('--compare')
  const snap = await takeSnapshot()

  if (compareIdx >= 0) {
    const file = args[compareIdx + 1]
    if (!file) throw new Error('Informe o arquivo: --compare <arquivo>')
    const before = JSON.parse(readFileSync(file, 'utf8')) as Snapshot
    const diffs = compare(before, snap)
    if (diffs.length) {
      console.error('[snapshot] DIFERENÇAS encontradas:\n  ' + diffs.join('\n  '))
      process.exit(2)
    }
    console.log(`[snapshot] idêntico a ${file} (${Object.keys(snap.tables).length} tabelas conferidas).`)
    return
  }

  const dir = join(process.cwd(), '.snapshots')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `legacy-${snap.takenAt.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify(snap, null, 2) + '\n')
  console.log(`[snapshot] gravado em ${file}`)
  for (const [t, s] of Object.entries(snap.tables)) {
    if (s.count) console.log(`  ${t.padEnd(18)} ${String(s.count).padStart(4)}  ${s.sha256.slice(0, 12)}`)
  }
}

main().catch((e) => {
  console.error('[snapshot] erro:', e instanceof Error ? e.message : e)
  process.exit(1)
})
