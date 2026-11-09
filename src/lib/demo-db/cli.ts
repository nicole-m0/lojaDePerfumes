/**
 * Comandos do banco de DEMONSTRAÇÃO da Bella&Cheirosa (Supabase). Ponto de entrada:
 * `scripts/demo-db.ts`, sempre pelos scripts npm (`tsx --env-file=.env.local …`).
 *
 * Ordem garantida em `run`, para TODOS os comandos (status, migrate, init, seed, studio):
 *  1. comando, alvo e confirmação de produção;
 *  2. destino lido do PRÓPRIO `.env.local` e validado (`resolveDemoConnection`):
 *     poolers do projeto Supabase da demonstração, sem fallback, sem `.env`;
 *  3. (seed) admin lido do `.env.local`, com a mesma regra das URLs;
 *  4. só então o Prisma é carregado e conecta.
 *
 * O `@prisma/client` carrega o `.env` antigo ao ser importado e preenche variáveis
 * ausentes. Por isso este módulo (e tudo o que ele importa) NÃO importa o Prisma
 * estaticamente — `src/lib/demo-db/npm-scripts.test.ts` trava isso — e nenhum valor
 * de conexão ou de admin é lido do `process.env`.
 *
 * Antes de qualquer escrita, o estado do banco é lido numa transação somente leitura
 * e avaliado por `guard.ts`. Nunca usa `migrate dev`, `migrate reset` nem `db push`.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { describeUrl, withReadOnlyOption } from './connection'
import { ENV_LOCAL, readEnvFile, type EnvVars, type ProcessEnvLike } from './env-file'
import {
  MARKER_KEY,
  buildMarker,
  evaluateCommand,
  parseTarget,
  type DatabaseState,
  type DemoCommand,
  type DemoTarget,
} from './guard'
import { readDemoAdmin, seedDemo } from './seed'
import { readDatabaseState } from './state'
import { resolveDemoAdminVars, resolveDemoConnection, type DemoConnection } from './target'

export const CLI_COMMANDS = ['status', 'migrate', 'init', 'seed', 'studio'] as const
export type CliCommand = (typeof CLI_COMMANDS)[number]

/** Dependências com efeito colateral — trocadas por fakes nos testes. */
export interface CliDeps {
  /** Variáveis do `.env.local`, lidas do arquivo. */
  readEnvLocal(): EnvVars
  /** Ambiente do processo (só para conferência contra o arquivo e para os filhos). */
  env: ProcessEnvLike
  /** Cria o Prisma Client — só é chamado depois da validação do destino. */
  createClient(url: string): Promise<PrismaClient>
  /** Executa o Prisma CLI local; devolve o código de saída. */
  runPrismaCli(args: readonly string[], env: ProcessEnvLike): number
  expectedMigrations(): string[]
  log(line: string): void
  error(line: string): void
}

export function defaultDeps(cwd: string = process.cwd()): CliDeps {
  return {
    readEnvLocal: () => readEnvFile(join(cwd, ENV_LOCAL)),
    env: process.env,
    createClient: async (url) => {
      // Carregado SÓ AQUI, depois da validação. `require` (CommonJS) é a forma
      // canônica de carregar o client gerado, sem depender de interop ESM/CJS.
      const require = createRequire(join(cwd, 'package.json'))
      const prisma = require('@prisma/client') as { PrismaClient: typeof PrismaClient }
      return new prisma.PrismaClient({ datasourceUrl: url })
    },
    runPrismaCli: (args, env) => {
      // Binário LOCAL do Prisma (sem `npx`, que poderia resolver/baixar pacotes),
      // executado pelo mesmo Node, sem shell (argumentos em array).
      const prismaCli = join(cwd, 'node_modules', 'prisma', 'build', 'index.js')
      const result = spawnSync(process.execPath, [prismaCli, ...args], {
        stdio: 'inherit',
        env: { ...env } as NodeJS.ProcessEnv,
      })
      return result.status ?? 1
    },
    expectedMigrations: () => {
      const dir = join(cwd, 'prisma', 'migrations')
      return readdirSync(dir)
        .filter((name) => statSync(join(dir, name)).isDirectory())
        .sort()
    },
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  }
}

function isCliCommand(value: string | undefined): value is CliCommand {
  return (CLI_COMMANDS as readonly string[]).includes(value ?? '')
}

/**
 * Ambiente do Prisma Studio: as DUAS URLs são substituídas pelas validadas. O Studio
 * roda antes de o Prisma ser carregado neste processo, então o ambiente herdado tem
 * só o sistema + `.env.local`. O Prisma CLI também carrega o `.env`, mas não
 * sobrescreve variáveis já definidas — então ele só enxerga o destino validado.
 */
function childEnv(env: ProcessEnvLike, conn: DemoConnection): ProcessEnvLike {
  return { ...env, DATABASE_URL: conn.databaseUrl, DIRECT_URL: conn.directUrl }
}

/**
 * Variáveis do sistema que o Node/Prisma CLI precisam para rodar (caminhos,
 * diretório temporário, perfil do usuário, Windows). Nenhuma variável de aplicação.
 */
export const MIGRATE_SYSTEM_ENV_KEYS = [
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'SystemDrive',
  'windir',
  'ComSpec',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'NODE_EXTRA_CA_CERTS',
] as const

/**
 * Ambiente MÍNIMO e explícito do `prisma migrate deploy`. Quando ele roda, o Prisma
 * já foi carregado neste processo (leitura do estado) e completou o `process.env`
 * com o `.env` antigo; por isso nada é herdado em bloco: só as variáveis de sistema
 * acima, as duas URLs validadas e `CHECKPOINT_DISABLE=1` (o Prisma CLI não consulta
 * o servidor de atualizações/telemetria).
 */
export function migrateEnv(env: ProcessEnvLike, conn: DemoConnection): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of MIGRATE_SYSTEM_ENV_KEYS) {
    const value = env[key]
    if (value !== undefined) out[key] = value
  }
  out.DATABASE_URL = conn.databaseUrl
  out.DIRECT_URL = conn.directUrl
  out.CHECKPOINT_DISABLE = '1'
  return out
}

async function readStateReadOnly(deps: CliDeps, conn: DemoConnection): Promise<DatabaseState> {
  const prisma = await deps.createClient(withReadOnlyOption(conn.directUrl))
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

function printState(deps: CliDeps, conn: DemoConnection, state: DatabaseState) {
  const marker =
    state.marker.kind === 'valid'
      ? `${state.marker.value.project}/${state.marker.value.environment} (desde ${state.marker.value.initializedAt})`
      : state.marker.kind === 'invalid'
        ? 'MALFORMADO'
        : 'ausente'
  deps.log(`  DATABASE_URL:   ${describeUrl(conn.databaseUrl)}`)
  deps.log(`  DIRECT_URL:     ${describeUrl(conn.directUrl)}`)
  deps.log(`  banco:          ${state.databaseName}`)
  deps.log(`  servidor (id):  ${state.systemIdentifier ?? 'não identificado'}`)
  deps.log(`  tabelas:        ${state.publicTables.length}`)
  deps.log(`  migrations:     ${state.appliedMigrations.length}/${deps.expectedMigrations().length} aplicadas`)
  deps.log(`  marcador demo:  ${marker}`)
  const counts = Object.entries(state.rowCounts)
    .map(([t, n]) => `${t}=${n}`)
    .join(' ')
  if (counts) deps.log(`  linhas:         ${counts}`)
}

function allowed(deps: CliDeps, command: DemoCommand, state: DatabaseState, target: DemoTarget): boolean {
  const verdict = evaluateCommand(command, state, target, deps.expectedMigrations())
  if (verdict.ok) return true
  deps.error(`\n[demo-db] RECUSADO: "${command}" com alvo "${target}":`)
  for (const r of verdict.reasons) deps.error(`  - ${r}`)
  return false
}

/** Executa um comando. Devolve o código de saída; erros de validação são lançados. */
export async function run(argv: readonly string[], deps: CliDeps): Promise<number> {
  const [command, ...args] = argv
  if (!isCliCommand(command)) {
    deps.error('Uso: npm run db:<status|migrate|init|seed> -- --target=<development|production>  |  npm run prisma:studio')
    return 1
  }

  let target: DemoTarget | null = null
  if (command === 'migrate' || command === 'init' || command === 'seed') {
    target = parseTarget(args)
    if (target === 'production' && !args.includes('--yes-production')) {
      deps.error('[demo-db] alvo "production" exige a flag --yes-production.')
      return 1
    }
  }

  // Destino e admin: do PRÓPRIO .env.local, validados ANTES de carregar o Prisma.
  const fileVars = deps.readEnvLocal()
  const conn = resolveDemoConnection(fileVars, deps.env)
  const admin = command === 'seed' ? readDemoAdmin(resolveDemoAdminVars(fileVars, deps.env)) : null
  deps.log(`[demo-db] destino validado: projeto Supabase da demonstração (${describeUrl(conn.directUrl)})`)

  if (command === 'studio') {
    return deps.runPrismaCli(['studio'], childEnv(deps.env, conn))
  }

  const state = await readStateReadOnly(deps, conn)

  if (command === 'status') {
    deps.log('[demo-db] status (somente leitura):')
    printState(deps, conn, state)
    for (const t of ['development', 'production'] as const) {
      for (const cmd of ['migrate', 'init', 'seed'] as const) {
        const v = evaluateCommand(cmd, state, t, deps.expectedMigrations())
        deps.log(`  ${t.padEnd(11)} ${cmd.padEnd(7)} ${v.ok ? 'permitido' : 'recusado: ' + v.reasons[0]}`)
      }
    }
    return 0
  }

  const writeTarget = target as DemoTarget
  deps.log(`[demo-db] ${command} → ${writeTarget}`)
  printState(deps, conn, state)
  if (!allowed(deps, command, state, writeTarget)) return 1

  if (command === 'migrate') {
    const code = deps.runPrismaCli(['migrate', 'deploy'], migrateEnv(deps.env, conn))
    if (code !== 0) return code
    deps.log('[demo-db] migrations aplicadas. Estado atual:')
    printState(deps, conn, await readStateReadOnly(deps, conn))
    return 0
  }

  const prisma = await deps.createClient(conn.directUrl)
  try {
    if (command === 'init') {
      await prisma.$transaction(
        async (tx) => {
          // Reavalia dentro da transação (evita corrida entre leitura e escrita).
          const fresh = await readDatabaseState(tx)
          const v = evaluateCommand('init', fresh, writeTarget, deps.expectedMigrations())
          if (!v.ok) throw new Error(`recusado na revalidação: ${v.reasons.join('; ')}`)
          await tx.setting.create({
            data: { key: MARKER_KEY, value: { ...buildMarker(writeTarget, fresh.systemIdentifier!) } },
          })
        },
        { isolationLevel: 'Serializable', timeout: 60_000, maxWait: 20_000 },
      )
      deps.log(`[demo-db] marcador gravado: banco identificado como demonstração (${writeTarget}).`)
      return 0
    }

    // seed
    const fresh = await readDatabaseState(prisma)
    if (!allowed(deps, 'seed', fresh, writeTarget)) return 1
    const summary = await seedDemo(prisma, admin!, deps.log)
    deps.log(`[demo-db] seed concluído: ${JSON.stringify(summary)}`)
    return 0
  } finally {
    await prisma.$disconnect()
  }
}
