/**
 * Helpers de URL de conexão para os scripts de banco (não usados pela loja).
 *
 * Nenhuma mensagem de erro daqui inclui a URL, o usuário ou a senha.
 */

/**
 * Project Reference do projeto Supabase da demonstração Bella&Cheirosa.
 * Não é segredo (aparece no usuário `postgres.<ref>` e na URL do painel); sem a
 * senha, não dá acesso a nada. Fornecido pela dona do projeto em 2026-11-05.
 * Os scripts de banco só aceitam URLs deste projeto.
 */
export const DEMO_SUPABASE_PROJECT_REF = 'jffzieabslosfkkxtvfy'

/** Host do pooler compartilhado (Supavisor), ex.: `aws-0-sa-east-1.pooler.supabase.com`. */
const SUPABASE_POOLER_HOST = /^aws-\d+-[a-z]{2}-[a-z]+-\d+\.pooler\.supabase\.com$/

const TRANSACTION_POOLER_PORT = '6543'
const SESSION_POOLER_PORT = '5432'

/**
 * Lista FECHADA de parâmetros de query por variável. Qualquer outro é recusado —
 * inclusive os que o Prisma usa para mudar o destino (`host=`), o schema
 * (`schema=`) ou a sessão (`options=`).
 */
const ALLOWED_PARAMS = {
  transaction: ['pgbouncer', 'connection_limit', 'sslmode'],
  session: ['sslmode'],
} as const

/** Nome de parâmetro seguro para aparecer numa mensagem (nunca valores). */
function paramLabel(key: string): string {
  return /^[a-z_]{1,32}$/i.test(key) ? `"${key}"` : '(nome inválido)'
}

/**
 * Faz o parse de uma URL de conexão sem vazar credenciais: o `TypeError` nativo
 * do Node carrega a URL inteira (com senha) no campo `input`; aqui ele é trocado
 * por um erro que cita só o NOME da variável.
 */
export function parseConnectionUrl(name: string, value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(
      `${name} inválida (verifique o formato; caracteres especiais na senha precisam estar codificados, ex.: @ → %40).`,
    )
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`${name} não é uma URL PostgreSQL.`)
  }
  return url
}

/**
 * Acrescenta `options=-c default_transaction_read_only=on` à URL do Postgres:
 * toda transação da sessão nasce somente leitura (o servidor rejeita escritas).
 * Usado por ferramentas de inspeção (fotografia, `status`), que além disso
 * leem dentro de uma transação `READ ONLY` conferida.
 */
export function withReadOnlyOption(url: string): string {
  const u = parseConnectionUrl('URL de conexão', url)
  u.searchParams.set('options', '-c default_transaction_read_only=on')
  return u.toString()
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Problemas nos parâmetros de query e no fragmento. */
function queryProblems(name: string, raw: string, url: URL, mode: 'transaction' | 'session'): string[] {
  const problems: string[] = []

  // Na URL de conexão, `#` cru só pode ser fragmento (na senha ele precisa vir
  // codificado como %23). `url.hash` fica vazio para `#` sem conteúdo, então a
  // checagem é feita no texto original.
  if (raw.includes('#')) problems.push(`${name}: fragmento (#) não é permitido`)

  const allowed: readonly string[] = ALLOWED_PARAMS[mode]
  const seen = new Set<string>()
  for (const key of url.searchParams.keys()) {
    if (seen.has(key)) {
      problems.push(`${name}: parâmetro ${paramLabel(key)} repetido`)
      continue
    }
    seen.add(key)
    if (!allowed.includes(key)) problems.push(`${name}: parâmetro ${paramLabel(key)} não é permitido`)
  }

  if (url.searchParams.get('sslmode') !== 'require') {
    problems.push(`${name}: sslmode=require é obrigatório`)
  }
  if (mode === 'transaction') {
    if (url.searchParams.get('pgbouncer') !== 'true') {
      problems.push(`${name}: falta pgbouncer=true (obrigatório no Transaction pooler)`)
    }
    const limit = url.searchParams.get('connection_limit')
    if (limit !== null && !/^[1-9]\d{0,2}$/.test(limit)) {
      problems.push(`${name}: connection_limit deve ser um inteiro positivo`)
    }
  }
  return problems
}

/** Problemas de uma URL de pooler. As mensagens citam só a variável e a regra. */
function poolerProblems(
  name: string,
  raw: string,
  url: URL,
  mode: 'transaction' | 'session',
  expectedRef: string,
): string[] {
  const problems: string[] = []
  const host = url.hostname.toLowerCase()

  if (host.endsWith('.supabase.co')) {
    problems.push(`${name}: conexão direta (db.<ref>.supabase.co) não é aceita — use o pooler do Supabase`)
  } else if (host.endsWith('.rlwy.net') || host.includes('railway')) {
    problems.push(`${name}: aponta para o Railway — recusado`)
  } else if (!SUPABASE_POOLER_HOST.test(host)) {
    problems.push(`${name}: host não é um pooler do Supabase (aws-N-<região>.pooler.supabase.com)`)
  }

  if (safeDecode(url.username) !== `postgres.${expectedRef}`) {
    problems.push(`${name}: usuário não corresponde ao projeto Supabase da demonstração`)
  }
  if (!url.password) problems.push(`${name}: senha ausente`)
  if (url.pathname !== '/postgres') problems.push(`${name}: o database deve ser /postgres`)

  const port = mode === 'transaction' ? TRANSACTION_POOLER_PORT : SESSION_POOLER_PORT
  if (url.port !== port) {
    problems.push(`${name}: porta deve ser ${port} (${mode === 'transaction' ? 'Transaction' : 'Session'} pooler)`)
  }

  problems.push(...queryProblems(name, raw, url, mode))
  return problems
}

/**
 * Exige que `DATABASE_URL` e `DIRECT_URL` sejam os poolers do projeto Supabase da
 * demonstração (`DEMO_SUPABASE_PROJECT_REF`):
 *
 * - `DATABASE_URL`: Transaction pooler — porta 6543, `pgbouncer=true`,
 *   `connection_limit` opcional (inteiro positivo), `sslmode=require`; nenhum outro
 *   parâmetro;
 * - `DIRECT_URL`:   Session pooler — porta 5432, `sslmode=require`; nenhum outro
 *   parâmetro;
 * - as duas: host `aws-N-<região>.pooler.supabase.com` (o mesmo), usuário
 *   `postgres.<ref esperado>`, senha presente, database `/postgres`, sem parâmetros
 *   repetidos e sem fragmento `#`.
 *
 * Conexão direta (`db.<ref>.supabase.co`), Railway e qualquer outro host são
 * recusados. Função pura: não conecta em nada.
 */
export function assertDemoPoolerPair(
  databaseUrl: string,
  directUrl: string,
  expectedRef: string = DEMO_SUPABASE_PROJECT_REF,
): void {
  if (!/^[a-z0-9]{20}$/.test(expectedRef)) {
    throw new Error('Project Reference esperado da demonstração inválido no código — recusado.')
  }
  const a = parseConnectionUrl('DATABASE_URL', databaseUrl)
  const b = parseConnectionUrl('DIRECT_URL', directUrl)

  const problems = [
    ...poolerProblems('DATABASE_URL', databaseUrl, a, 'transaction', expectedRef),
    ...poolerProblems('DIRECT_URL', directUrl, b, 'session', expectedRef),
  ]
  if (a.hostname.toLowerCase() !== b.hostname.toLowerCase()) {
    problems.push('DATABASE_URL e DIRECT_URL usam hosts de pooler diferentes')
  }

  if (problems.length) {
    throw new Error(`Destino do banco recusado:\n  - ${problems.join('\n  - ')}`)
  }
}

/** Host, porta e database da URL, para mensagens (nunca usuário/senha). */
export function describeUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`
  } catch {
    return '(URL inválida)'
  }
}
