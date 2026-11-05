/**
 * Operações do banco de DEMONSTRAÇÃO da Bella&Cheirosa (Supabase) — todas protegidas.
 *
 * Use SEMPRE pelos scripts npm, que carregam `.env.local` explicitamente
 * (`tsx --env-file=.env.local`; o Prisma CLI não lê esse arquivo sozinho):
 *
 *   npm run db:status                                   # só leitura
 *   npm run db:migrate -- --target=production --yes-production   # prisma migrate deploy
 *   npm run db:init    -- --target=production --yes-production   # grava o marcador
 *   npm run db:seed    -- --target=production --yes-production   # admin + catálogo
 *
 * Conexões: `DATABASE_URL` (pooler em modo transação, usado pela app) e
 * `DIRECT_URL` (pooler em modo sessão). Os scripts usam `DIRECT_URL` quando ela
 * existe, e os comandos de escrita a EXIGEM — o `.env` antigo não a define, então
 * rodar fora dos scripts npm (sem `.env.local`) nunca chega a escrever. As duas
 * URLs precisam apontar para o mesmo banco (`assertSameDatabase`).
 *
 * Antes de QUALQUER escrita, o estado do banco é lido numa transação somente
 * leitura e avaliado por `src/lib/demo-db/guard.ts` — o banco legado e bancos sem
 * marcador de demonstração são recusados. Nunca usa `migrate dev`,
 * `migrate reset` nem `db push`.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import {
  assertSameDatabase,
  describeUrl,
  parseConnectionUrl,
  withReadOnlyOption,
} from '../src/lib/demo-db/connection'
import {
  MARKER_KEY,
  buildMarker,
  evaluateCommand,
  parseTarget,
  type DatabaseState,
  type DemoCommand,
  type DemoTarget,
} from '../src/lib/demo-db/guard'
import { readDatabaseState } from '../src/lib/demo-db/state'
import { readDemoAdmin, seedDemo } from '../src/lib/demo-db/seed'

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations')

function expectedMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isDirectory())
    .sort()
}

/**
 * URL usada pelos scripts: `DIRECT_URL` (sessão) quando definida — e então ela
 * precisa apontar para o mesmo banco da `DATABASE_URL` —, senão `DATABASE_URL`.
 * Comandos de escrita exigem `DIRECT_URL` (só existe no `.env.local`).
 */
function scriptUrl(requireDirect = false): string {
  const databaseUrl = process.env.DATABASE_URL
  const directUrl = process.env.DIRECT_URL
  if (!databaseUrl) throw new Error('DATABASE_URL não definida (rode pelos scripts `npm run db:*`).')
  parseConnectionUrl('DATABASE_URL', databaseUrl)
  if (!directUrl) {
    if (requireDirect) {
      throw new Error('DIRECT_URL não definida — rode pelos scripts `npm run db:*`, que carregam `.env.local`.')
    }
    return databaseUrl
  }
  assertSameDatabase(databaseUrl, directUrl)
  return directUrl
}

async function readStateReadOnly(): Promise<DatabaseState> {
  const prisma = new PrismaClient({ datasourceUrl: withReadOnlyOption(scriptUrl()) })
  try {
    // Duas travas: a sessão já nasce somente leitura (`options` na URL) e a
    // leitura roda numa transação `READ ONLY` conferida antes de qualquer SELECT.
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
        const [ro] = await tx.$queryRawUnsafe<{ ro: string }[]>(
          "SELECT current_setting('transaction_read_only') AS ro",
        )
        if (ro?.ro !== 'on') throw new Error('leitura não está em modo somente leitura — abortado.')
        return readDatabaseState(tx)
      },
      { timeout: 60_000, maxWait: 20_000 },
    )
  } finally {
    await prisma.$disconnect()
  }
}

function printState(state: DatabaseState) {
  const marker =
    state.marker.kind === 'valid'
      ? `${state.marker.value.project}/${state.marker.value.environment} (desde ${state.marker.value.initializedAt})`
      : state.marker.kind === 'invalid'
        ? 'MALFORMADO'
        : 'ausente'
  console.log(`  DATABASE_URL:   ${describeUrl(process.env.DATABASE_URL ?? '')}`)
  console.log(`  DIRECT_URL:     ${process.env.DIRECT_URL ? describeUrl(process.env.DIRECT_URL) : 'não definida'}`)
  console.log(`  banco:          ${state.databaseName}`)
  console.log(`  servidor (id):  ${state.systemIdentifier ?? 'não identificado'}`)
  console.log(`  tabelas:        ${state.publicTables.length}`)
  console.log(`  migrations:     ${state.appliedMigrations.length}/${expectedMigrations().length} aplicadas`)
  console.log(`  marcador demo:  ${marker}`)
  const counts = Object.entries(state.rowCounts).map(([t, n]) => `${t}=${n}`).join(' ')
  if (counts) console.log(`  linhas:         ${counts}`)
}

function assertAllowed(command: DemoCommand, state: DatabaseState, target: DemoTarget) {
  const verdict = evaluateCommand(command, state, target, expectedMigrations())
  if (!verdict.ok) {
    console.error(`\n[demo-db] RECUSADO: "${command}" com alvo "${target}":`)
    for (const r of verdict.reasons) console.error(`  - ${r}`)
    process.exit(1)
  }
}

function requireProductionConfirmation(target: DemoTarget, argv: string[]) {
  if (target === 'production' && !argv.includes('--yes-production')) {
    console.error('[demo-db] alvo "production" exige a flag --yes-production.')
    process.exit(1)
  }
}

async function main() {
  const [command, ...argv] = process.argv.slice(2)

  if (command === 'status') {
    const state = await readStateReadOnly()
    console.log('[demo-db] status (somente leitura):')
    printState(state)
    for (const target of ['development', 'production'] as const) {
      for (const cmd of ['migrate', 'init', 'seed'] as const) {
        const v = evaluateCommand(cmd, state, target, expectedMigrations())
        console.log(`  ${target.padEnd(11)} ${cmd.padEnd(7)} ${v.ok ? 'permitido' : 'recusado: ' + v.reasons[0]}`)
      }
    }
    return
  }

  if (command !== 'migrate' && command !== 'init' && command !== 'seed') {
    console.error('Uso: npm run db:<status|migrate|init|seed> -- --target=<development|production>')
    process.exit(1)
  }

  const target = parseTarget(argv)
  requireProductionConfirmation(target, argv)
  // Escrita só com DIRECT_URL (vinda do .env.local) apontando para o mesmo banco.
  const writeUrl = scriptUrl(true)
  // Valida o admin ANTES de qualquer escrita (seed).
  const admin = command === 'seed' ? readDemoAdmin(process.env) : null

  const state = await readStateReadOnly()
  console.log(`[demo-db] ${command} → ${target}`)
  printState(state)
  assertAllowed(command, state, target)

  if (command === 'migrate') {
    // Binário LOCAL do Prisma (sem `npx`, que poderia resolver/baixar pacotes),
    // executado pelo mesmo Node, sem shell. Herda DATABASE_URL/DIRECT_URL já
    // carregadas (o `.env` do Prisma não as sobrescreve) e usa `directUrl` = a
    // mesma DIRECT_URL validada acima.
    const prismaCli = join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js')
    const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      stdio: 'inherit',
      env: process.env,
    })
    if (result.status !== 0) process.exit(result.status ?? 1)
    console.log('[demo-db] migrations aplicadas. Estado atual:')
    printState(await readStateReadOnly())
    return
  }

  const prisma = new PrismaClient({ datasourceUrl: writeUrl })
  try {
    if (command === 'init') {
      await prisma.$transaction(
        async (tx) => {
          // Reavalia dentro da transação (evita corrida entre leitura e escrita).
          const fresh = await readDatabaseState(tx)
          const v = evaluateCommand('init', fresh, target, expectedMigrations())
          if (!v.ok) throw new Error(`recusado na revalidação: ${v.reasons.join('; ')}`)
          await tx.setting.create({
            data: { key: MARKER_KEY, value: { ...buildMarker(target, fresh.systemIdentifier!) } },
          })
        },
        { isolationLevel: 'Serializable', timeout: 60_000, maxWait: 20_000 },
      )
      console.log(`[demo-db] marcador gravado: banco identificado como demonstração (${target}).`)
      return
    }

    // seed
    const fresh = await readDatabaseState(prisma)
    assertAllowed('seed', fresh, target)
    const summary = await seedDemo(prisma, admin!)
    console.log('[demo-db] seed concluído:', JSON.stringify(summary))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('[demo-db] erro:', e instanceof Error ? e.message : e)
  process.exit(1)
})
