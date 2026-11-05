/**
 * Leitura do `.env.local` como FONTE DA VERDADE dos scripts de banco.
 *
 * Por que não basta `process.env`: o `@prisma/client`, ao ser importado, carrega o
 * `.env` da raiz (o do banco antigo) e preenche as variáveis que faltarem. Uma
 * variável ausente no `.env.local` apareceria em `process.env` com o valor antigo.
 * Por isso os valores de conexão e do admin são lidos do próprio arquivo e só são
 * aceitos se estiverem nele — e, se o processo tiver outro valor (ex.: variável do
 * sistema sobrepondo o arquivo), a execução é recusada.
 *
 * `util.parseEnv` é o mesmo parser usado pelo `node --env-file`.
 */
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

export const ENV_LOCAL = '.env.local'

export type EnvVars = Readonly<Record<string, string>>

/** Ambiente do processo (ou um fake nos testes). */
export type ProcessEnvLike = Readonly<Record<string, string | undefined>>

/** Lê e interpreta um arquivo de variáveis. O erro nunca inclui o conteúdo. */
export function readEnvFile(path: string, label: string = ENV_LOCAL): EnvVars {
  let content: string
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`não foi possível ler ${label} na raiz do projeto.`)
  }
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(parseEnv(content))) {
    if (typeof value === 'string') vars[key] = value
  }
  return vars
}

/**
 * Devolve as variáveis pedidas, exigindo que cada uma esteja DEFINIDA e NÃO VAZIA
 * no arquivo e que o processo tenha exatamente o mesmo valor. Nunca usa um valor
 * que só exista em `process.env`. As mensagens citam só os nomes, nunca valores.
 */
export function pickFromEnvFile<K extends string>(
  fileVars: EnvVars,
  processEnv: ProcessEnvLike,
  keys: readonly K[],
  label: string = ENV_LOCAL,
): Record<K, string> {
  return pickVars(fileVars, processEnv, keys, [], label).required
}

/**
 * Como `pickFromEnvFile`, com chaves opcionais: se a opcional estiver no arquivo,
 * valem as mesmas regras (não vazia, igual ao processo); se NÃO estiver, o valor
 * que o processo tiver (ex.: vindo do `.env` antigo) é IGNORADO — nunca usado.
 */
export function pickVars<R extends string, O extends string>(
  fileVars: EnvVars,
  processEnv: ProcessEnvLike,
  requiredKeys: readonly R[],
  optionalKeys: readonly O[],
  label: string = ENV_LOCAL,
): { required: Record<R, string>; optional: Partial<Record<O, string>> } {
  const problems: string[] = []
  const required = {} as Record<R, string>
  const optional: Partial<Record<O, string>> = {}

  const check = (key: string, value: string): boolean => {
    if (!value.trim()) {
      problems.push(`${key} está vazia no ${label}`)
      return false
    }
    if (processEnv[key] !== value) {
      problems.push(
        `${key} no ambiente do processo difere do ${label} (rode pelos scripts npm; há variável do sistema sobrepondo o arquivo?)`,
      )
      return false
    }
    return true
  }

  for (const key of requiredKeys) {
    const value = fileVars[key]
    if (value === undefined) {
      problems.push(`${key} não está definida no ${label} (valores vindos do .env não são aceitos)`)
    } else if (check(key, value)) {
      required[key] = value
    }
  }
  for (const key of optionalKeys) {
    const value = fileVars[key]
    if (value !== undefined && check(key, value)) optional[key] = value
  }

  if (problems.length) throw new Error(`Configuração recusada:\n  - ${problems.join('\n  - ')}`)
  return { required, optional }
}
