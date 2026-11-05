/**
 * Helpers de URL de conexão para os scripts de banco (não usados pela loja).
 *
 * Nenhuma mensagem de erro daqui inclui a URL, o usuário ou a senha.
 */

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

/** Ref do projeto Supabase (20 caracteres a-z) a partir de uma URL, ou `null`. */
export function supabaseProjectRef(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  const user = decodeURIComponent(url.username)
  // Pooler compartilhado (Supavisor): usuário `postgres.<ref>`, host `*.pooler.supabase.com`.
  if (host.endsWith('.pooler.supabase.com')) {
    const m = user.match(/^[^.]+\.([a-z0-9]{20})$/)
    return m ? m[1] : null
  }
  // Conexão direta / pooler dedicado: host `db.<ref>.supabase.co`.
  const m = host.match(/^db\.([a-z0-9]{20})\.supabase\.co$/)
  return m ? m[1] : null
}

/**
 * Garante que `DATABASE_URL` e `DIRECT_URL` apontam para o MESMO banco, para que
 * o schema nunca seja aplicado num banco e os dados lidos/gravados em outro.
 *
 * - Supabase: mesmo project ref (aceita os formatos reais do painel — Transaction
 *   pooler 6543, Session pooler 5432 e conexão direta `db.<ref>.supabase.co`) e
 *   mesmo database.
 * - Outros provedores: mesmo host, mesmo usuário e mesmo database (só a porta
 *   pode mudar).
 */
export function assertSameDatabase(databaseUrl: string, directUrl: string): void {
  const a = parseConnectionUrl('DATABASE_URL', databaseUrl)
  const b = parseConnectionUrl('DIRECT_URL', directUrl)
  const problems: string[] = []

  const refA = supabaseProjectRef(a)
  const refB = supabaseProjectRef(b)
  if (refA || refB) {
    if (!refA || !refB) problems.push('só uma das URLs é de um projeto Supabase reconhecível')
    else if (refA !== refB) problems.push('projetos Supabase diferentes')
  } else {
    if (a.hostname.toLowerCase() !== b.hostname.toLowerCase()) problems.push('hosts diferentes')
    if (decodeURIComponent(a.username) !== decodeURIComponent(b.username)) problems.push('usuários diferentes')
  }
  if (a.pathname !== b.pathname) problems.push('databases diferentes')

  if (problems.length) {
    throw new Error(`DATABASE_URL e DIRECT_URL não apontam para o mesmo banco (${problems.join(', ')}).`)
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
