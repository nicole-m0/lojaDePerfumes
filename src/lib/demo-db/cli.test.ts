import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { run, type CliDeps } from './cli'
import { DEMO_SUPABASE_PROJECT_REF } from './connection'
import type { ProcessEnvLike } from './env-file'
import { BUSINESS_TABLES, DEMO_PROJECT, LEGACY_SYSTEM_IDENTIFIERS, MARKER_KEY, buildMarker } from './guard'
import { seedDemo } from './seed'

// O seed em si é testado em seed.test.ts; aqui interessa o que `run()` entrega a ele.
vi.mock('./seed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./seed')>()
  return {
    ...actual,
    seedDemo: vi.fn(
      async (): Promise<import('./seed').SeedSummary> => ({
        admin: { email: 'x', created: false },
        categories: { created: 0, existing: 0 },
        brands: { created: 0, existing: 0 },
        products: { created: 0, existing: 0 },
        stockInitialized: 0,
      }),
    ),
  }
})

const REF = DEMO_SUPABASE_PROJECT_REF
const HOST = 'aws-0-sa-east-1.pooler.supabase.com'
const PWD = 'SENHA-SENTINELA'
const DATABASE_URL = `postgresql://postgres.${REF}:${PWD}@${HOST}:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require`
const DIRECT_URL = `postgresql://postgres.${REF}:${PWD}@${HOST}:5432/postgres?sslmode=require`
const LEGACY_URL = 'postgresql://postgres:LEGADO-SENTINELA@altaria.proxy.rlwy.net:12345/railway'
const ADMIN = { ADMIN_EMAIL: 'demo@bella.example', ADMIN_PASSWORD: 'senha-forte-123' }
const VALID_FILE = { DATABASE_URL, DIRECT_URL }
const SYSID = '1111111111111111111'
const MIGRATIONS = ['20260101000000_a', '20260102000000_b']

// ---------------------------------------------------------------------------
// Banco falso: responde às consultas de `readDatabaseState` a partir de um estado.

interface FakeDb {
  sysid: string
  tables: string[]
  migrations: string[]
  counts: Record<string, number>
  marker: unknown | null
}

const emptyDb = (over: Partial<FakeDb> = {}): FakeDb => ({ sysid: SYSID, tables: [], migrations: [], counts: {}, marker: null, ...over })
/** Schema completo, migrations em dia, tabelas de negócio vazias, sem marcador. */
const migratedDb = (over: Partial<FakeDb> = {}): FakeDb =>
  emptyDb({ tables: ['_prisma_migrations', ...BUSINESS_TABLES], migrations: MIGRATIONS, ...over })

function answer(db: FakeDb, sql: string): unknown[] {
  if (sql.includes('transaction_read_only')) return [{ ro: 'on' }]
  if (sql.includes('current_database')) return [{ name: 'postgres' }]
  if (sql.includes('has_function_privilege')) return [{ ok: true }]
  if (sql.includes('pg_control_system')) return [{ id: db.sysid }]
  if (sql.includes('information_schema.tables')) return db.tables.map((name) => ({ name }))
  if (sql.includes('_prisma_migrations')) return db.migrations.map((name) => ({ name, done: true, rolledBack: false }))
  const count = sql.match(/FROM "(\w+)"$/)
  if (sql.includes('count(*)') && count) return [{ n: db.counts[count[1]] ?? 0 }]
  if (sql.includes('FROM "Setting"')) return db.marker ? [{ value: db.marker }] : []
  throw new Error(`consulta inesperada no fake: ${sql}`)
}

/** Proxy estrito: qualquer acesso a método/model não previsto é registrado e lança. */
function strict<T extends object>(target: T, calls: string[]): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'symbol' || prop === 'then' || prop in t) return Reflect.get(t, prop, receiver)
      calls.push(`UNEXPECTED:${String(prop)}`)
      throw new Error(`acesso inesperado ao client: ${String(prop)}`)
    },
  })
}

function fakePrisma(db: FakeDb, { allowWrites }: { allowWrites: boolean }) {
  const calls: string[] = []
  const queryRawUnsafe = vi.fn(async (sql: string) => {
    calls.push(`query:${sql}`)
    return answer(db, sql)
  })
  const executeRawUnsafe = vi.fn(async (sql: string) => {
    calls.push(`execute:${sql}`)
    return 0
  })
  const settingCreate = vi.fn(async (args: { data: unknown }) => {
    calls.push('setting.create')
    return args.data
  })
  const txTarget = allowWrites
    ? { $queryRawUnsafe: queryRawUnsafe, $executeRawUnsafe: executeRawUnsafe, setting: { create: settingCreate } }
    : { $queryRawUnsafe: queryRawUnsafe, $executeRawUnsafe: executeRawUnsafe }
  const tx = strict(txTarget, calls)
  /** Chamado antes do callback de cada transação (permite simular corrida). */
  const onTransaction = vi.fn<(options: unknown) => void>()
  const transaction = vi.fn(async (fn: (t: typeof tx) => unknown, options?: unknown) => {
    calls.push(`transaction:${JSON.stringify(options ?? {})}`)
    onTransaction(options)
    return fn(tx)
  })
  const client = strict(
    { $transaction: transaction, $queryRawUnsafe: queryRawUnsafe, $disconnect: vi.fn(async () => undefined) },
    calls,
  )
  return { client, calls, queryRawUnsafe, executeRawUnsafe, settingCreate, transaction, onTransaction }
}

function makeDeps(
  file: Record<string, string>,
  env: ProcessEnvLike = { ...file },
  fake = fakePrisma(emptyDb(), { allowWrites: true }),
) {
  const logs: string[] = []
  const deps = {
    readEnvLocal: vi.fn(() => file),
    env,
    createClient: vi.fn<(url: string) => Promise<PrismaClient>>(async () => fake.client as unknown as PrismaClient),
    runPrismaCli: vi.fn<(args: readonly string[], env: ProcessEnvLike) => number>(() => 0),
    expectedMigrations: () => [...MIGRATIONS],
    log: (l: string) => logs.push(l),
    error: (l: string) => logs.push(l),
  } satisfies CliDeps
  return { deps, logs, fake }
}

async function errorOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
  return ''
}

beforeEach(() => vi.mocked(seedDemo).mockClear())

// ---------------------------------------------------------------------------

const COMMANDS: string[][] = [
  ['status'],
  ['migrate', '--target=development'],
  ['init', '--target=development'],
  ['seed', '--target=development'],
  ['studio'],
]

describe('run — destino inválido nunca conecta', () => {
  const scenarios: [string, Record<string, string>, ProcessEnvLike | null, RegExp][] = [
    [
      'DATABASE_URL ausente no .env.local (o .env antigo preencheu o processo)',
      { DIRECT_URL, ...ADMIN },
      { DIRECT_URL, DATABASE_URL: LEGACY_URL, ...ADMIN },
      /DATABASE_URL não está definida no \.env\.local/,
    ],
    [
      'DIRECT_URL ausente (sem fallback para a DATABASE_URL)',
      { DATABASE_URL, ...ADMIN },
      null,
      /DIRECT_URL não está definida no \.env\.local/,
    ],
    ['nenhuma das duas no .env.local', { ...ADMIN }, { DATABASE_URL: LEGACY_URL, ...ADMIN }, /não está definida/],
    [
      'variável do sistema diferente do arquivo',
      { ...VALID_FILE, ...ADMIN },
      { ...VALID_FILE, ...ADMIN, DIRECT_URL: LEGACY_URL },
      /DIRECT_URL no ambiente do processo difere/,
    ],
    [
      'URLs de outro projeto Supabase',
      { DATABASE_URL: DATABASE_URL.replace(REF, 'zyxwvutsrqponmlkjihg'), DIRECT_URL: DIRECT_URL.replace(REF, 'zyxwvutsrqponmlkjihg'), ...ADMIN },
      null,
      /usuário não corresponde/,
    ],
    ['URLs do Railway no .env.local', { DATABASE_URL: LEGACY_URL, DIRECT_URL: LEGACY_URL, ...ADMIN }, null, /Railway/],
    [
      'host= desviando a DIRECT_URL',
      { DATABASE_URL, DIRECT_URL: `${DIRECT_URL}&host=evil.example.com`, ...ADMIN },
      null,
      /parâmetro "host" não é permitido/,
    ],
    ['schema= na DIRECT_URL', { DATABASE_URL, DIRECT_URL: `${DIRECT_URL}&schema=outro`, ...ADMIN }, null, /parâmetro "schema"/],
    [
      'sem sslmode=require',
      { DATABASE_URL, DIRECT_URL: DIRECT_URL.replace('?sslmode=require', ''), ...ADMIN },
      null,
      /sslmode=require é obrigatório/,
    ],
  ]

  for (const [label, file, env, expected] of scenarios) {
    for (const argv of COMMANDS) {
      it(`${argv[0]}: ${label}`, async () => {
        const { deps } = makeDeps(file, env ?? { ...file })
        const message = await errorOf(run(argv, deps))
        expect(message).toMatch(expected)
        expect(message).not.toMatch(/SENTINELA|evil\.example\.com/)
        expect(deps.createClient).not.toHaveBeenCalled()
        expect(deps.runPrismaCli).not.toHaveBeenCalled()
      })
    }
  }

  it('seed: ADMIN_* ausente no .env.local é recusado mesmo que o .env antigo as tenha preenchido', async () => {
    const { deps } = makeDeps({ ...VALID_FILE }, { ...VALID_FILE, ...ADMIN })
    const message = await errorOf(run(['seed', '--target=development'], deps))
    expect(message).toMatch(/ADMIN_EMAIL não está definida[\s\S]*ADMIN_PASSWORD não está definida/)
    expect(deps.createClient).not.toHaveBeenCalled()
    expect(seedDemo).not.toHaveBeenCalled()
  })

  it('seed: ADMIN_PASSWORD diferente no processo é recusado (nunca usa o valor do ambiente)', async () => {
    const file = { ...VALID_FILE, ...ADMIN }
    const { deps } = makeDeps(file, { ...file, ADMIN_PASSWORD: 'senha-ANTIGA-SENTINELA' })
    const message = await errorOf(run(['seed', '--target=development'], deps))
    expect(message).toMatch(/ADMIN_PASSWORD no ambiente do processo difere/)
    expect(message).not.toMatch(/SENTINELA|senha-forte/)
    expect(deps.createClient).not.toHaveBeenCalled()
    expect(seedDemo).not.toHaveBeenCalled()
  })

  it('production sem --yes-production: recusa antes até de ler o .env.local', async () => {
    const { deps } = makeDeps({ ...VALID_FILE })
    expect(await run(['migrate', '--target=production'], deps)).toBe(1)
    expect(deps.readEnvLocal).not.toHaveBeenCalled()
    expect(deps.createClient).not.toHaveBeenCalled()
  })

  it('comando desconhecido: uso, sem ler nada', async () => {
    const { deps } = makeDeps({ ...VALID_FILE })
    expect(await run(['push'], deps)).toBe(1)
    expect(deps.readEnvLocal).not.toHaveBeenCalled()
  })
})

describe('run — status é somente leitura', () => {
  it('uma conexão pela DIRECT_URL com sessão somente leitura; transação READ ONLY conferida; só SELECTs', async () => {
    const fake = fakePrisma(migratedDb({ counts: { Product: 3 } }), { allowWrites: false })
    const { deps, logs } = makeDeps({ ...VALID_FILE }, undefined, fake)
    expect(await run(['status'], deps)).toBe(0)

    // Conexão: uma só, Session pooler, sessão somente leitura.
    expect(deps.createClient).toHaveBeenCalledTimes(1)
    const url = new URL(deps.createClient.mock.calls[0][0])
    expect(url.port).toBe('5432')
    expect(url.hostname).toBe(HOST)
    expect(url.searchParams.get('options')).toBe('-c default_transaction_read_only=on')

    // Transação: o ÚNICO comando não-SELECT é `SET TRANSACTION READ ONLY`, e ele é o
    // primeiro; logo depois, a conferência de transaction_read_only.
    expect(fake.transaction).toHaveBeenCalledTimes(1)
    expect(fake.executeRawUnsafe.mock.calls.map((c) => c[0])).toEqual(['SET TRANSACTION READ ONLY'])
    const inTx = fake.calls.slice(fake.calls.findIndex((c) => c.startsWith('transaction:')) + 1)
    expect(inTx[0]).toBe('execute:SET TRANSACTION READ ONLY')
    expect(inTx[1]).toMatch(/^query:SELECT current_setting\('transaction_read_only'\)/)
    for (const c of fake.calls.filter((c) => c.startsWith('query:'))) expect(c).toMatch(/^query:SELECT /)

    // Nenhuma escrita, nenhum acesso inesperado (o tx nem tem models), nenhum CLI.
    expect(fake.calls.filter((c) => c.startsWith('UNEXPECTED'))).toEqual([])
    expect(deps.runPrismaCli).not.toHaveBeenCalled()
    expect(fake.client.$disconnect).toHaveBeenCalled()
    expect(logs.join('\n')).toMatch(/linhas:\s+.*Product=3/)
    expect(logs.join('\n')).not.toMatch(/SENTINELA/)
  })

  it('se a transação não estiver em READ ONLY, aborta antes de ler o estado', async () => {
    const fake = fakePrisma(migratedDb(), { allowWrites: false })
    fake.queryRawUnsafe.mockImplementationOnce(async () => [{ ro: 'off' }])
    const { deps } = makeDeps({ ...VALID_FILE }, undefined, fake)
    expect(await errorOf(run(['status'], deps))).toMatch(/não está em modo somente leitura/)
    expect(fake.calls.filter((c) => c.includes('information_schema'))).toEqual([])
  })
})

describe('run — migrate', () => {
  it('o Prisma CLI recebe só `migrate deploy` e um ambiente MÍNIMO com as URLs validadas', async () => {
    const env = {
      ...VALID_FILE,
      PATH: 'C:\\bin',
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\tmp',
      ADMIN_PASSWORD: 'nao-deve-ir',
      MERCADOPAGO_ACCESS_TOKEN: 'nao-deve-ir',
      NEXT_PUBLIC_STORE_NAME: 'nao-deve-ir',
      AUTH_SECRET: 'nao-deve-ir',
    }
    const { deps } = makeDeps({ ...VALID_FILE }, env)
    expect(await run(['migrate', '--target=development'], deps)).toBe(0)
    expect(deps.runPrismaCli).toHaveBeenCalledTimes(1)
    const [args, childEnv] = deps.runPrismaCli.mock.calls[0]
    expect(args).toEqual(['migrate', 'deploy'])
    expect(childEnv).toEqual({
      PATH: 'C:\\bin',
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\tmp',
      DATABASE_URL,
      DIRECT_URL,
      CHECKPOINT_DISABLE: '1',
    })
  })

  it('banco legado (fingerprint) é recusado mesmo com destino válido', async () => {
    const fake = fakePrisma(emptyDb({ sysid: LEGACY_SYSTEM_IDENTIFIERS[0] }), { allowWrites: true })
    const { deps } = makeDeps({ ...VALID_FILE }, undefined, fake)
    expect(await run(['migrate', '--target=development'], deps)).toBe(1)
    expect(deps.runPrismaCli).not.toHaveBeenCalled()
  })

  it('banco com tabelas e sem marcador (ex.: legado restaurado) é recusado', async () => {
    const fake = fakePrisma(migratedDb({ counts: { Product: 24 } }), { allowWrites: true })
    const { deps } = makeDeps({ ...VALID_FILE }, undefined, fake)
    expect(await run(['migrate', '--target=development'], deps)).toBe(1)
    expect(deps.runPrismaCli).not.toHaveBeenCalled()
  })
})

describe('run — init', () => {
  it('grava o marcador numa transação Serializable, depois de revalidar o estado dentro dela', async () => {
    const fake = fakePrisma(migratedDb(), { allowWrites: true })
    const { deps } = makeDeps({ ...VALID_FILE }, undefined, fake)
    expect(await run(['init', '--target=development'], deps)).toBe(0)

    // 1ª conexão: leitura somente leitura; 2ª: escrita pela DIRECT_URL, sem `options`.
    expect(deps.createClient).toHaveBeenCalledTimes(2)
    expect(new URL(deps.createClient.mock.calls[0][0]).searchParams.get('options')).toBe('-c default_transaction_read_only=on')
    expect(deps.createClient.mock.calls[1][0]).toBe(DIRECT_URL)

    const serializableIdx = fake.calls.findIndex((c) => c.startsWith('transaction:') && c.includes('"isolationLevel":"Serializable"'))
    const createIdx = fake.calls.indexOf('setting.create')
    expect(serializableIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeGreaterThan(serializableIdx)
    // Revalidação dentro da transação: identidade e marcador relidos antes do create.
    const between = fake.calls.slice(serializableIdx, createIdx)
    expect(between.some((c) => c.includes('pg_control_system'))).toBe(true)
    expect(between.some((c) => c.includes('FROM "Setting"'))).toBe(true)

    expect(fake.settingCreate).toHaveBeenCalledTimes(1)
    expect(fake.settingCreate.mock.calls[0][0]).toEqual({
      data: {
        key: MARKER_KEY,
        value: { project: DEMO_PROJECT, environment: 'development', systemIdentifier: SYSID, initializedAt: expect.any(String) },
      },
    })
    expect(fake.calls.filter((c) => c.startsWith('UNEXPECTED'))).toEqual([])
  })

  it('recusado na revalidação: se o banco mudou entre a leitura e a transação, não grava', async () => {
    const db = migratedDb()
    const fake = fakePrisma(db, { allowWrites: true })
    fake.onTransaction.mockImplementation((options) => {
      // Na transação de escrita, outro processo já gravou um marcador.
      if (JSON.stringify(options ?? {}).includes('Serializable')) db.marker = buildMarker('development', SYSID)
    })
    const { deps } = makeDeps({ ...VALID_FILE }, undefined, fake)
    expect(await errorOf(run(['init', '--target=development'], deps))).toMatch(/recusado na revalidação/)
    expect(fake.settingCreate).not.toHaveBeenCalled()
  })

  it('tabelas de negócio com dados: recusado, sem abrir conexão de escrita', async () => {
    const fake = fakePrisma(migratedDb({ counts: { Product: 1 } }), { allowWrites: true })
    const { deps } = makeDeps({ ...VALID_FILE }, undefined, fake)
    expect(await run(['init', '--target=development'], deps)).toBe(1)
    expect(deps.createClient).toHaveBeenCalledTimes(1)
    expect(fake.settingCreate).not.toHaveBeenCalled()
  })
})

describe('run — seed', () => {
  const markedDb = () => migratedDb({ marker: buildMarker('development', SYSID) })

  it('roda com o admin do .env.local; ADMIN_NAME ausente no arquivo ignora o valor do processo', async () => {
    const fake = fakePrisma(markedDb(), { allowWrites: true })
    const file = { ...VALID_FILE, ...ADMIN }
    const env = { ...file, ADMIN_NAME: 'Admin do Painel Antigo' }
    const { deps } = makeDeps(file, env, fake)
    expect(await run(['seed', '--target=development'], deps)).toBe(0)

    expect(seedDemo).toHaveBeenCalledTimes(1)
    const [client, admin] = vi.mocked(seedDemo).mock.calls[0]
    expect(client).toBe(fake.client)
    expect(admin).toEqual({ email: ADMIN.ADMIN_EMAIL, password: ADMIN.ADMIN_PASSWORD, name: 'Administração' })
    expect(deps.createClient.mock.calls[1][0]).toBe(DIRECT_URL)
  })

  it('usa ADMIN_NAME do arquivo quando definido', async () => {
    const fake = fakePrisma(markedDb(), { allowWrites: true })
    const file = { ...VALID_FILE, ...ADMIN, ADMIN_NAME: 'Bella Demo' }
    const { deps } = makeDeps(file, { ...file }, fake)
    expect(await run(['seed', '--target=development'], deps)).toBe(0)
    expect(vi.mocked(seedDemo).mock.calls[0][1]).toMatchObject({ name: 'Bella Demo' })
  })

  it('sem marcador, ou marcador de outro alvo: recusado e o seed não roda', async () => {
    for (const db of [migratedDb(), migratedDb({ marker: buildMarker('production', SYSID) })]) {
      const fake = fakePrisma(db, { allowWrites: true })
      const file = { ...VALID_FILE, ...ADMIN }
      const { deps } = makeDeps(file, { ...file }, fake)
      expect(await run(['seed', '--target=development'], deps)).toBe(1)
    }
    expect(seedDemo).not.toHaveBeenCalled()
  })
})

describe('run — studio', () => {
  it('roda o Prisma Studio local com as URLs validadas, sem abrir conexão própria', async () => {
    const { deps } = makeDeps({ ...VALID_FILE })
    expect(await run(['studio'], deps)).toBe(0)
    const [args, env] = deps.runPrismaCli.mock.calls[0]
    expect(args).toEqual(['studio'])
    expect(env.DATABASE_URL).toBe(DATABASE_URL)
    expect(env.DIRECT_URL).toBe(DIRECT_URL)
    expect(deps.createClient).not.toHaveBeenCalled()
  })
})
