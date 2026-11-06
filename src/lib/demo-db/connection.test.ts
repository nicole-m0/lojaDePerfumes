import { describe, expect, it } from 'vitest'
import {
  DEMO_SUPABASE_PROJECT_REF,
  assertDemoPoolerPair,
  describeUrl,
  parseConnectionUrl,
  withReadOnlyOption,
} from './connection'

// Formatos exibidos em Supabase → Connect (senhas fictícias).
const REF = DEMO_SUPABASE_PROJECT_REF
const OTHER_REF = 'zyxwvutsrqponmlkjihg'
const PWD = 'S3nha%40com%23SENTINELA' // "S3nha@com#SENTINELA" codificada
const HOST = 'aws-0-sa-east-1.pooler.supabase.com'
const TX_QUERY = '?pgbouncer=true&connection_limit=1&sslmode=require'
const SESSION_QUERY = '?sslmode=require'
const transaction = ({ ref = REF, host = HOST, port = '6543', query = TX_QUERY, db = 'postgres', pwd = PWD } = {}) =>
  `postgresql://postgres.${ref}:${pwd}@${host}:${port}/${db}${query}`
const session = ({ ref = REF, host = HOST, port = '5432', query = SESSION_QUERY, db = 'postgres', pwd = PWD } = {}) =>
  `postgresql://postgres.${ref}:${pwd}@${host}:${port}/${db}${query}`

function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    return String(e) + JSON.stringify(e)
  }
  return ''
}

describe('DEMO_SUPABASE_PROJECT_REF', () => {
  it('é o Project Reference fornecido para a demonstração (20 caracteres a-z0-9)', () => {
    expect(DEMO_SUPABASE_PROJECT_REF).toBe('jffzieabslosfkkxtvfy')
    expect(DEMO_SUPABASE_PROJECT_REF).toMatch(/^[a-z0-9]{20}$/)
  })
})

describe('assertDemoPoolerPair — aceita', () => {
  it('Transaction (6543, pgbouncer, connection_limit, sslmode=require) + Session (5432, sslmode=require)', () => {
    expect(() => assertDemoPoolerPair(transaction(), session())).not.toThrow()
  })

  it('parâmetros permitidos em qualquer ordem; connection_limit é opcional', () => {
    expect(() => assertDemoPoolerPair(transaction({ query: '?sslmode=require&pgbouncer=true' }), session())).not.toThrow()
    expect(() =>
      assertDemoPoolerPair(transaction({ query: '?connection_limit=5&sslmode=require&pgbouncer=true' }), session()),
    ).not.toThrow()
  })

  it('outras regiões/clusters do pooler (aws-1-…), desde que o mesmo host nas duas', () => {
    const host = 'aws-1-us-east-1.pooler.supabase.com'
    expect(() => assertDemoPoolerPair(transaction({ host }), session({ host }))).not.toThrow()
  })
})

describe('assertDemoPoolerPair — recusa', () => {
  const cases: [string, string, string, RegExp][] = [
    // projeto / usuário
    ['outro projeto nas duas', transaction({ ref: OTHER_REF }), session({ ref: OTHER_REF }), /usuário não corresponde/],
    ['outro projeto só na DIRECT_URL', transaction(), session({ ref: OTHER_REF }), /DIRECT_URL: usuário não corresponde/],
    ['usuário sem ref', transaction().replace(`postgres.${REF}`, 'postgres'), session(), /DATABASE_URL: usuário/],
    ['senha ausente', transaction({ pwd: '' }), session(), /DATABASE_URL: senha ausente/],
    // porta / database
    ['portas trocadas', transaction({ port: '5432' }), session({ port: '6543' }), /porta deve ser 6543[\s\S]*porta deve ser 5432/],
    ['5432 nas duas', transaction({ port: '5432' }), session(), /DATABASE_URL: porta deve ser 6543/],
    ['database diferente de /postgres', transaction({ db: 'outro' }), session(), /DATABASE_URL: o database deve ser \/postgres/],
    // host
    ['hosts de pooler diferentes', transaction(), session({ host: 'aws-1-us-east-1.pooler.supabase.com' }), /hosts de pooler diferentes/],
    [
      'conexão direta db.<ref>.supabase.co como DIRECT_URL',
      transaction(),
      `postgresql://postgres:${PWD}@db.${REF}.supabase.co:5432/postgres${SESSION_QUERY}`,
      /DIRECT_URL: conexão direta/,
    ],
    [
      'banco antigo no Railway (DATABASE_URL vinda do .env)',
      'postgresql://postgres:x@altaria.proxy.rlwy.net:12345/railway',
      session(),
      /DATABASE_URL: aponta para o Railway/,
    ],
    [
      'outro provedor qualquer',
      transaction(),
      `postgresql://postgres.${REF}:${PWD}@db.exemplo.com:5432/postgres${SESSION_QUERY}`,
      /DIRECT_URL: host não é um pooler do Supabase/,
    ],
    [
      'host parecido, mas não é do Supabase',
      transaction({ host: `${HOST}.evil.io` }),
      session({ host: `${HOST}.evil.io` }),
      /host não é um pooler do Supabase/,
    ],
    // parâmetros que mudam destino, schema ou sessão
    ['host= na DATABASE_URL', transaction({ query: `${TX_QUERY}&host=evil.example.com` }), session(), /DATABASE_URL: parâmetro "host" não é permitido/],
    ['host= na DIRECT_URL', transaction(), session({ query: `${SESSION_QUERY}&host=evil.example.com` }), /DIRECT_URL: parâmetro "host" não é permitido/],
    ['host= codificado (ho%73t)', transaction(), session({ query: `${SESSION_QUERY}&ho%73t=evil.example.com` }), /parâmetro "host" não é permitido/],
    ['schema= na DATABASE_URL', transaction({ query: `${TX_QUERY}&schema=outro` }), session(), /DATABASE_URL: parâmetro "schema" não é permitido/],
    ['schema= na DIRECT_URL', transaction(), session({ query: `${SESSION_QUERY}&schema=outro` }), /DIRECT_URL: parâmetro "schema" não é permitido/],
    ['options=', transaction({ query: `${TX_QUERY}&options=-c%20x%3Dy` }), session(), /parâmetro "options" não é permitido/],
    ['parâmetro desconhecido', transaction({ query: `${TX_QUERY}&application_name=x` }), session(), /parâmetro "application_name" não é permitido/],
    ['nome de parâmetro estranho não é ecoado', transaction(), session({ query: `${SESSION_QUERY}&x%20SENTINELA=1` }), /parâmetro \(nome inválido\) não é permitido/],
    ['pgbouncer na DIRECT_URL', transaction(), session({ query: `${SESSION_QUERY}&pgbouncer=true` }), /DIRECT_URL: parâmetro "pgbouncer" não é permitido/],
    ['connection_limit na DIRECT_URL', transaction(), session({ query: `${SESSION_QUERY}&connection_limit=1` }), /DIRECT_URL: parâmetro "connection_limit" não é permitido/],
    // repetidos
    ['pgbouncer repetido com valores diferentes', transaction({ query: `${TX_QUERY}&pgbouncer=false` }), session(), /parâmetro "pgbouncer" repetido/],
    ['sslmode repetido com o mesmo valor', transaction(), session({ query: '?sslmode=require&sslmode=require' }), /DIRECT_URL: parâmetro "sslmode" repetido/],
    ['sslmode repetido (require, disable)', transaction(), session({ query: '?sslmode=require&sslmode=disable' }), /parâmetro "sslmode" repetido/],
    // fragmento
    ['fragmento #x', transaction(), `${session()}#x`, /DIRECT_URL: fragmento \(#\) não é permitido/],
    ['fragmento # vazio', `${transaction()}#`, session(), /DATABASE_URL: fragmento \(#\) não é permitido/],
    // sslmode
    ['sem sslmode na DATABASE_URL', transaction({ query: '?pgbouncer=true' }), session(), /DATABASE_URL: sslmode=require é obrigatório/],
    ['sem sslmode na DIRECT_URL', transaction(), session({ query: '' }), /DIRECT_URL: sslmode=require é obrigatório/],
    ['sslmode=prefer', transaction(), session({ query: '?sslmode=prefer' }), /DIRECT_URL: sslmode=require é obrigatório/],
    ['sslmode=allow', transaction({ query: '?pgbouncer=true&sslmode=allow' }), session(), /DATABASE_URL: sslmode=require é obrigatório/],
    ['sslmode=disable', transaction(), session({ query: '?sslmode=disable' }), /DIRECT_URL: sslmode=require é obrigatório/],
    ['sslmode com valor anexado (require;host=x)', transaction(), session({ query: '?sslmode=require;host=x' }), /sslmode=require é obrigatório/],
    // pgbouncer / connection_limit
    ['sem pgbouncer na DATABASE_URL', transaction({ query: '?sslmode=require' }), session(), /falta pgbouncer=true/],
    ['pgbouncer=false', transaction({ query: '?pgbouncer=false&sslmode=require' }), session(), /falta pgbouncer=true/],
    ['connection_limit inválido', transaction({ query: '?pgbouncer=true&sslmode=require&connection_limit=0' }), session(), /connection_limit deve ser um inteiro positivo/],
    ['connection_limit não numérico', transaction({ query: '?pgbouncer=true&sslmode=require&connection_limit=1;x' }), session(), /connection_limit deve ser um inteiro positivo/],
  ]

  for (const [label, databaseUrl, directUrl, expected] of cases) {
    it(label, () => {
      const message = messageOf(() => assertDemoPoolerPair(databaseUrl, directUrl))
      expect(message).toMatch(expected)
      // Nenhuma mensagem contém senha, usuário completo, valores de parâmetro ou a URL.
      for (const secret of [
        'SENTINELA',
        'S3nha',
        PWD,
        `postgres.${REF}`,
        `postgres.${OTHER_REF}`,
        'evil.example.com',
        databaseUrl,
        directUrl,
      ]) {
        expect(message).not.toContain(secret)
      }
    })
  }

  it('constante do ref inválida no código → recusa tudo', () => {
    expect(() => assertDemoPoolerPair(transaction(), session(), '')).toThrow(/Project Reference esperado/)
    expect(() => assertDemoPoolerPair(transaction(), session(), 'CURTO')).toThrow(/Project Reference esperado/)
  })
})

describe('erros nunca expõem credenciais', () => {
  it('URL que não pode ser interpretada: erro cita só o nome da variável', () => {
    const message = messageOf(() => assertDemoPoolerPair('nao é url SEGREDO123', session()))
    expect(message).toMatch(/DATABASE_URL inválida/)
    expect(message).not.toContain('SEGREDO123')
    expect(messageOf(() => parseConnectionUrl('DIRECT_URL', 'nao é url SEGREDO123'))).not.toContain('SEGREDO123')
  })

  it('senha com # cru (sem codificar): recusada (URL inválida ou fragmento), sem ecoar a senha', () => {
    // O `#` corta a URL antes do `@`: conforme o caso, o parser falha ou vê um fragmento.
    for (const raw of [
      `postgresql://postgres.${REF}:senha#SENTINELA@${HOST}:6543/postgres${TX_QUERY}`,
      `postgresql://postgres.${REF}:${PWD}@${HOST}:6543/postgres${TX_QUERY}#SENTINELA`,
    ]) {
      const message = messageOf(() => assertDemoPoolerPair(raw, session()))
      expect(message).toMatch(/DATABASE_URL( inválida|: fragmento)/)
      expect(message).not.toContain('SENTINELA')
    }
  })

  it('recusa protocolos que não são PostgreSQL', () => {
    expect(() => parseConnectionUrl('DATABASE_URL', 'https://abc.supabase.co')).toThrow(/não é uma URL PostgreSQL/)
  })

  it('describeUrl mostra só host, porta e database', () => {
    const described = describeUrl(session())
    expect(described).toBe(`${HOST}:5432/postgres`)
    expect(described).not.toContain('S3nha')
    expect(described).not.toContain(REF)
  })
})

describe('withReadOnlyOption', () => {
  it('preserva os parâmetros do pooler e acrescenta a sessão somente leitura', () => {
    const u = new URL(withReadOnlyOption(session()))
    expect(u.searchParams.get('sslmode')).toBe('require')
    expect(u.searchParams.get('options')).toBe('-c default_transaction_read_only=on')
    expect(decodeURIComponent(u.password)).toBe('S3nha@com#SENTINELA')
  })
})
