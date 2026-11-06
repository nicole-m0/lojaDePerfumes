import { assertDemoPoolerPair } from './connection'
import { pickFromEnvFile, pickVars, type EnvVars, type ProcessEnvLike } from './env-file'

export interface DemoConnection {
  /** Transaction pooler (6543) — o que a app usa. */
  databaseUrl: string
  /** Session pooler (5432) — o que os scripts e o Prisma CLI usam. */
  directUrl: string
}

/**
 * Destino de TODOS os comandos de banco da demonstração (status, migrate, init,
 * seed, studio). As duas URLs são obrigatórias, vêm do `.env.local` (nunca do
 * `.env`), não há fallback de uma para a outra e precisam ser os poolers do projeto
 * Supabase da demonstração. Função pura: roda antes de qualquer conexão.
 */
export function resolveDemoConnection(fileVars: EnvVars, processEnv: ProcessEnvLike): DemoConnection {
  const vars = pickFromEnvFile(fileVars, processEnv, ['DATABASE_URL', 'DIRECT_URL'] as const)
  assertDemoPoolerPair(vars.DATABASE_URL, vars.DIRECT_URL)
  return { databaseUrl: vars.DATABASE_URL, directUrl: vars.DIRECT_URL }
}

/**
 * Variáveis do admin para o seed, com a MESMA regra das URLs: `ADMIN_EMAIL` e
 * `ADMIN_PASSWORD` obrigatórias no `.env.local` e iguais no processo; `ADMIN_NAME`
 * opcional — se ausente do arquivo, o valor do processo (ex.: do `.env` antigo) é
 * ignorado. O formato (e-mail, força da senha) é conferido por `readDemoAdmin`.
 */
export function resolveDemoAdminVars(
  fileVars: EnvVars,
  processEnv: ProcessEnvLike,
): { ADMIN_EMAIL: string; ADMIN_PASSWORD: string; ADMIN_NAME?: string } {
  const { required, optional } = pickVars(
    fileVars,
    processEnv,
    ['ADMIN_EMAIL', 'ADMIN_PASSWORD'] as const,
    ['ADMIN_NAME'] as const,
  )
  return { ...required, ...optional }
}
