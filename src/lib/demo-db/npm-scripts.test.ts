import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..', '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
  prisma?: unknown
}
const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8')

describe('scripts npm de banco', () => {
  it('db:* e prisma:studio carregam .env.local explicitamente (o Prisma CLI não o lê sozinho)', () => {
    for (const name of ['db:status', 'db:migrate', 'db:init', 'db:seed', 'prisma:studio']) {
      expect(pkg.scripts[name], name).toContain('--env-file=.env.local')
    }
    for (const name of ['db:status', 'db:migrate', 'db:init', 'db:seed']) {
      expect(pkg.scripts[name], name).toContain('scripts/demo-db.ts')
    }
  })

  it('nenhum script roda comandos destrutivos ou que pulam a proteção', () => {
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      expect(cmd, name).not.toMatch(/migrate\s+(dev|reset)|db\s+push|force-reset|accept-data-loss|prisma\/seed/)
    }
  })

  it('sem seed automático do Prisma (migrate dev/reset não populam o banco)', () => {
    expect(pkg.prisma).toBeUndefined()
  })

  it('demo-db.ts chama o Prisma CLI local (sem npx) e só com `migrate deploy`', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'demo-db.ts'), 'utf8')
    expect(src).not.toMatch(/['"]npx['"]/)
    expect(src).toContain("'node_modules', 'prisma', 'build', 'index.js'")
    expect(src).toContain("'migrate', 'deploy'")
    expect(src).not.toMatch(/'(migrate', '(dev|reset)|db', 'push)'/)
  })
})

describe('schema.prisma', () => {
  it('app usa DATABASE_URL (pooler) e o CLI usa DIRECT_URL (sessão)', () => {
    expect(schema).toMatch(/url\s+=\s+env\("DATABASE_URL"\)/)
    expect(schema).toMatch(/directUrl\s+=\s+env\("DIRECT_URL"\)/)
    // Nenhuma URL literal (credencial) no schema.
    expect(schema).not.toMatch(/postgres(ql)?:\/\//)
  })
})
