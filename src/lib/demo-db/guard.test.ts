import { describe, expect, it } from 'vitest'
import {
  BUSINESS_TABLES,
  DEMO_PROJECT,
  LEGACY_SYSTEM_IDENTIFIERS,
  buildMarker,
  evaluateCommand,
  parseMarker,
  parseTarget,
  type DatabaseState,
} from './guard'
import { withReadOnlyOption } from './connection'

const MIGRATIONS = ['20260827201727_init', '20260829183935_orders']
const DEMO_ID = '7000000000000000001'
const LEGACY_ID = LEGACY_SYSTEM_IDENTIFIERS[0]

const emptyCounts = Object.fromEntries(BUSINESS_TABLES.map((t) => [t, 0])) as DatabaseState['rowCounts']

/** Banco novo, sem nenhuma tabela. */
function pristine(overrides: Partial<DatabaseState> = {}): DatabaseState {
  return {
    databaseName: 'railway',
    systemIdentifier: DEMO_ID,
    publicTables: [],
    appliedMigrations: [],
    failedMigrations: [],
    marker: { kind: 'absent' },
    rowCounts: {},
    ...overrides,
  }
}

/** Banco novo com schema aplicado, vazio, ainda sem marcador. */
function migrated(overrides: Partial<DatabaseState> = {}): DatabaseState {
  return pristine({
    publicTables: ['_prisma_migrations', ...BUSINESS_TABLES],
    appliedMigrations: [...MIGRATIONS],
    rowCounts: { ...emptyCounts },
    ...overrides,
  })
}

/** Banco de demonstração já marcado. */
function marked(env: 'development' | 'production' = 'development', overrides: Partial<DatabaseState> = {}) {
  return migrated({
    marker: { kind: 'valid', value: buildMarker(env, DEMO_ID, new Date('2026-11-05T00:00:00Z')) },
    rowCounts: { ...emptyCounts, Setting: 1 },
    ...overrides,
  })
}

/** Réplica do estado real do banco legado (fotografia C.0). */
function legacy(): DatabaseState {
  return migrated({
    systemIdentifier: LEGACY_ID,
    rowCounts: { ...emptyCounts, User: 1, Category: 9, Brand: 7, Product: 24, Customer: 1, Order: 1, Payment: 1 },
  })
}

const ok = { ok: true }

describe('parseTarget', () => {
  it('exige --target explícito e válido', () => {
    expect(parseTarget(['--target=development'])).toBe('development')
    expect(parseTarget(['x', '--target=production'])).toBe('production')
    expect(() => parseTarget([])).toThrow(/--target/)
    expect(() => parseTarget(['--target=prod'])).toThrow(/--target/)
    expect(() => parseTarget(['--target='])).toThrow(/--target/)
  })
})

describe('parseMarker', () => {
  it('aceita só o marcador completo do projeto demo', () => {
    const m = buildMarker('production', DEMO_ID)
    expect(parseMarker(m)).toEqual(m)
    expect(parseMarker({ ...m, project: 'outro' })).toBeNull()
    expect(parseMarker({ ...m, environment: 'staging' })).toBeNull()
    expect(parseMarker({ ...m, systemIdentifier: '' })).toBeNull()
    expect(parseMarker('bella-cheirosa-demo')).toBeNull()
    expect(parseMarker(null)).toBeNull()
    expect(m.project).toBe(DEMO_PROJECT)
  })
})

describe('banco legado: tudo recusado', () => {
  for (const cmd of ['migrate', 'init', 'seed'] as const) {
    for (const target of ['development', 'production'] as const) {
      it(`${cmd} / ${target}`, () => {
        const v = evaluateCommand(cmd, legacy(), target, MIGRATIONS)
        expect(v.ok).toBe(false)
        if (!v.ok) expect(v.reasons.join()).toMatch(/LEGADO/)
      })
    }
  }

  it('mesmo com um marcador forjado/copiado, o fingerprint do legado é recusado', () => {
    const forged = legacy()
    forged.marker = { kind: 'valid', value: buildMarker('development', LEGACY_ID) }
    expect(evaluateCommand('seed', forged, 'development', MIGRATIONS).ok).toBe(false)
    expect(evaluateCommand('migrate', forged, 'development', MIGRATIONS).ok).toBe(false)
  })

  it('banco com dados e sem marcador é recusado mesmo que o fingerprint seja desconhecido', () => {
    const unknownWithData = { ...legacy(), systemIdentifier: '123' }
    expect(evaluateCommand('migrate', unknownWithData, 'development', MIGRATIONS).ok).toBe(false)
    expect(evaluateCommand('init', unknownWithData, 'development', MIGRATIONS).ok).toBe(false)
    expect(evaluateCommand('seed', unknownWithData, 'development', MIGRATIONS).ok).toBe(false)
  })
})

describe('servidor não identificável', () => {
  it('recusa tudo por segurança', () => {
    for (const cmd of ['migrate', 'init', 'seed'] as const) {
      expect(evaluateCommand(cmd, pristine({ systemIdentifier: null }), 'development', MIGRATIONS).ok).toBe(false)
    }
  })
})

describe('migrate', () => {
  it('permitido num banco totalmente vazio', () => {
    expect(evaluateCommand('migrate', pristine(), 'development', MIGRATIONS)).toEqual(ok)
  })
  it('permitido num banco demo marcado com o mesmo alvo', () => {
    expect(evaluateCommand('migrate', marked('production'), 'production', MIGRATIONS)).toEqual(ok)
  })
  it('recusado com tabelas e sem marcador (ex.: schema aplicado mas init não rodado)', () => {
    expect(evaluateCommand('migrate', migrated(), 'development', MIGRATIONS).ok).toBe(false)
  })
  it('recusado quando o marcador é de outro alvo', () => {
    expect(evaluateCommand('migrate', marked('production'), 'development', MIGRATIONS).ok).toBe(false)
  })
})

describe('init', () => {
  it('permitido com schema completo, tabelas vazias e sem marcador', () => {
    expect(evaluateCommand('init', migrated(), 'development', MIGRATIONS)).toEqual(ok)
  })
  it('recusado se já existe marcador', () => {
    expect(evaluateCommand('init', marked(), 'development', MIGRATIONS).ok).toBe(false)
  })
  it('recusado se qualquer tabela de negócio tem linhas', () => {
    for (const table of BUSINESS_TABLES) {
      const s = migrated({ rowCounts: { ...emptyCounts, [table]: 1 } })
      const v = evaluateCommand('init', s, 'development', MIGRATIONS)
      expect(v.ok, table).toBe(false)
    }
  })
  it('recusado com migrations pendentes, desconhecidas ou com falha', () => {
    expect(evaluateCommand('init', migrated({ appliedMigrations: [MIGRATIONS[0]] }), 'development', MIGRATIONS).ok).toBe(false)
    expect(
      evaluateCommand('init', migrated({ appliedMigrations: [...MIGRATIONS, 'x_extra'] }), 'development', MIGRATIONS).ok,
    ).toBe(false)
    expect(evaluateCommand('init', migrated({ failedMigrations: ['y'] }), 'development', MIGRATIONS).ok).toBe(false)
  })
  it('recusado num banco sem schema', () => {
    expect(evaluateCommand('init', pristine(), 'development', MIGRATIONS).ok).toBe(false)
  })
})

describe('seed', () => {
  it('permitido no banco demo marcado do mesmo alvo', () => {
    expect(evaluateCommand('seed', marked('development'), 'development', MIGRATIONS)).toEqual(ok)
  })
  it('recusado sem marcador', () => {
    expect(evaluateCommand('seed', migrated(), 'development', MIGRATIONS).ok).toBe(false)
  })
  it('recusado com marcador malformado', () => {
    expect(evaluateCommand('seed', migrated({ marker: { kind: 'invalid' } }), 'development', MIGRATIONS).ok).toBe(false)
  })
  it('recusado quando o alvo difere (dev ≠ prod)', () => {
    expect(evaluateCommand('seed', marked('production'), 'development', MIGRATIONS).ok).toBe(false)
    expect(evaluateCommand('seed', marked('development'), 'production', MIGRATIONS).ok).toBe(false)
  })
  it('recusado quando o marcador veio de outro servidor (dump restaurado)', () => {
    expect(evaluateCommand('seed', marked('development', { systemIdentifier: '999' }), 'development', MIGRATIONS).ok).toBe(
      false,
    )
  })
  it('recusado com migrations pendentes', () => {
    expect(
      evaluateCommand('seed', marked('development', { appliedMigrations: [MIGRATIONS[0]] }), 'development', MIGRATIONS).ok,
    ).toBe(false)
  })
})

describe('withReadOnlyOption', () => {
  it('força transações somente leitura na sessão sem perder parâmetros', () => {
    const url = new URL(withReadOnlyOption('postgresql://u:p@h:5432/db?sslmode=require'))
    expect(url.searchParams.get('options')).toBe('-c default_transaction_read_only=on')
    expect(url.searchParams.get('sslmode')).toBe('require')
    expect(url.pathname).toBe('/db')
  })
})
