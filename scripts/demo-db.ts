/**
 * Operações do banco de DEMONSTRAÇÃO da Bella&Cheirosa (Supabase) — todas protegidas.
 *
 * Use SEMPRE pelos scripts npm, que carregam `.env.local` (`tsx --env-file=.env.local`):
 *
 *   npm run db:status                                            # só leitura
 *   npm run db:migrate -- --target=production --yes-production   # prisma migrate deploy
 *   npm run db:init    -- --target=production --yes-production   # grava o marcador
 *   npm run db:seed    -- --target=production --yes-production   # admin + catálogo
 *   npm run prisma:studio                                        # Prisma Studio
 *
 * Todos os comandos exigem, no PRÓPRIO `.env.local`, `DATABASE_URL` (Transaction
 * pooler, 6543) e `DIRECT_URL` (Session pooler, 5432) do projeto Supabase da
 * demonstração — validadas antes de o Prisma ser carregado. A lógica fica em
 * `src/lib/demo-db/cli.ts`.
 */
import { defaultDeps, run } from '../src/lib/demo-db/cli'

run(process.argv.slice(2), defaultDeps()).then(
  (code) => {
    process.exitCode = code
  },
  (e: unknown) => {
    console.error('[demo-db] erro:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  },
)
