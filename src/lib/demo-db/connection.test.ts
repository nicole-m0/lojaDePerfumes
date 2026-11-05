import { describe, expect, it } from 'vitest'
import {
  assertSameDatabase,
  describeUrl,
  parseConnectionUrl,
  supabaseProjectRef,
  withReadOnlyOption,
} from './connection'

// Formatos exibidos em Supabase → Connect (refs e senhas fictícios).
const REF = 'abcdefghijklmnopqrst'
const OTHER_REF = 'zyxwvutsrqponmlkjihg'
const PWD = 'S3nha%40com%23especiais' // "S3nha@com#especiais" codificada
const transaction = (ref = REF, host = 'aws-0-sa-east-1') =>
  `postgresql://postgres.${ref}:${PWD}@${host}.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
const session = (ref = REF, host = 'aws-0-sa-east-1') =>
  `postgresql://postgres.${ref}:${PWD}@${host}.pooler.supabase.com:5432/postgres`
const direct = (ref = REF) => `postgresql://postgres:${PWD}@db.${ref}.supabase.co:5432/postgres`

describe('supabaseProjectRef', () => {
  it('extrai o ref dos poolers (aws-0 / aws-1) e da conexão direta', () => {
    expect(supabaseProjectRef(new URL(transaction()))).toBe(REF)
    expect(supabaseProjectRef(new URL(session(REF, 'aws-1-us-east-1')))).toBe(REF)
    expect(supabaseProjectRef(new URL(direct()))).toBe(REF)
  })
  it('não reconhece hosts de outros provedores nem usuários sem ref', () => {
    expect(supabaseProjectRef(new URL('postgresql://postgres:x@altaria.proxy.rlwy.net:12345/railway'))).toBeNull()
    expect(supabaseProjectRef(new URL('postgresql://postgres:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'))).toBeNull()
    expect(supabaseProjectRef(new URL('postgresql://u:x@db.short.supabase.co:5432/postgres'))).toBeNull()
  })
})

describe('assertSameDatabase — Supabase', () => {
  it('aceita Transaction (6543) + Session (5432) do mesmo projeto', () => {
    expect(() => assertSameDatabase(transaction(), session())).not.toThrow()
    expect(() =>
      assertSameDatabase(transaction(REF, 'aws-1-us-east-1'), session(REF, 'aws-1-us-east-1')),
    ).not.toThrow()
  })

  it('aceita Transaction pooler + conexão direta do mesmo projeto', () => {
    expect(() => assertSameDatabase(transaction(), direct())).not.toThrow()
  })

  it('recusa projetos diferentes, em qualquer combinação de formatos', () => {
    expect(() => assertSameDatabase(transaction(), session(OTHER_REF))).toThrow(/projetos Supabase diferentes/)
    expect(() => assertSameDatabase(transaction(), direct(OTHER_REF))).toThrow(/projetos Supabase diferentes/)
  })

  it('recusa misturar Supabase com outro provedor (ex.: banco antigo no Railway)', () => {
    expect(() =>
      assertSameDatabase(transaction(), 'postgresql://postgres:x@altaria.proxy.rlwy.net:12345/railway'),
    ).toThrow(/só uma das URLs/)
    expect(() =>
      assertSameDatabase('postgresql://postgres:x@altaria.proxy.rlwy.net:12345/railway', session()),
    ).toThrow(/só uma das URLs/)
  })

  it('recusa databases diferentes', () => {
    expect(() => assertSameDatabase(transaction(), session().replace(':5432/postgres', ':5432/outro'))).toThrow(/databases/)
  })
})

describe('assertSameDatabase — outros provedores', () => {
  it('exige mesmo host, usuário e database (porta pode mudar)', () => {
    const base = 'postgresql://app:x@db.exemplo.com'
    expect(() => assertSameDatabase(`${base}:6432/loja`, `${base}:5432/loja`)).not.toThrow()
    expect(() => assertSameDatabase(`${base}:5432/loja`, 'postgresql://app:x@outro.com:5432/loja')).toThrow(/hosts/)
    expect(() => assertSameDatabase(`${base}:5432/loja`, 'postgresql://adm:x@db.exemplo.com:5432/loja')).toThrow(
      /usuários/,
    )
  })
})

describe('erros nunca expõem credenciais', () => {
  it('URL inválida: erro cita só o nome da variável', () => {
    const bad = 'postgresql://postgres.ref:senha#crua@host:5432/db'
    let message = ''
    try {
      parseConnectionUrl('DIRECT_URL', 'nao é url SEGREDO123')
    } catch (e) {
      message = String(e) + JSON.stringify(e)
    }
    expect(message).toMatch(/DIRECT_URL inválida/)
    expect(message).not.toContain('SEGREDO123')
    expect(() => parseConnectionUrl('DATABASE_URL', bad)).not.toThrow(/crua/)
  })

  it('recusa protocolos que não são PostgreSQL', () => {
    expect(() => parseConnectionUrl('DATABASE_URL', 'https://abc.supabase.co')).toThrow(/não é uma URL PostgreSQL/)
  })

  it('mensagens de divergência e describeUrl não incluem usuário nem senha', () => {
    let message = ''
    try {
      assertSameDatabase(transaction(), session(OTHER_REF))
    } catch (e) {
      message = String(e)
    }
    expect(message).not.toBe('')
    for (const secret of [PWD, 'S3nha', REF, OTHER_REF]) expect(message).not.toContain(secret)
    const described = describeUrl(session())
    expect(described).toBe('aws-0-sa-east-1.pooler.supabase.com:5432/postgres')
    expect(described).not.toContain('S3nha')
  })
})

describe('withReadOnlyOption', () => {
  it('preserva os parâmetros do pooler e acrescenta a sessão somente leitura', () => {
    const u = new URL(withReadOnlyOption(transaction()))
    expect(u.searchParams.get('pgbouncer')).toBe('true')
    expect(u.searchParams.get('connection_limit')).toBe('1')
    expect(u.searchParams.get('options')).toBe('-c default_transaction_read_only=on')
    expect(decodeURIComponent(u.password)).toBe('S3nha@com#especiais')
  })
})
