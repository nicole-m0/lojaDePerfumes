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
  it('db:* e prisma:studio passam pela validação de destino de scripts/demo-db.ts', () => {
    const expected: Record<string, string> = {
      'db:status': 'status',
      'db:migrate': 'migrate',
      'db:init': 'init',
      'db:seed': 'seed',
      'prisma:studio': 'studio',
    }
    for (const [name, command] of Object.entries(expected)) {
      expect(pkg.scripts[name], name).toBe(`tsx --env-file=.env.local scripts/demo-db.ts ${command}`)
    }
  })

  it('nenhum script chama o Prisma CLI direto contra um banco (só generate, que não conecta)', () => {
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      const prismaCalls = cmd.match(/\bprisma(\/build\/index\.js)?\s+\w+/g) ?? []
      for (const call of prismaCalls) expect(call, name).toMatch(/generate$/)
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

  it('cli.ts chama o Prisma CLI local (sem npx, sem shell) e só com `migrate deploy` / `studio`', () => {
    const src = readFileSync(join(ROOT, 'src', 'lib', 'demo-db', 'cli.ts'), 'utf8')
    expect(src).not.toMatch(/['"]npx['"]/)
    expect(src).not.toMatch(/shell\s*:/)
    expect(src).toContain("'node_modules', 'prisma', 'build', 'index.js'")
    expect(src).toContain("['migrate', 'deploy']")
    expect(src).not.toMatch(/'(migrate', '(dev|reset)|db', 'push)'/)
    const cliArgs = [...src.matchAll(/runPrismaCli\(\[([^\]]*)\]/g)].map((m) => m[1])
    expect(cliArgs.sort()).toEqual(["'migrate', 'deploy'", "'studio'"])
  })

  it('nada no caminho dos scripts importa o @prisma/client antes da validação (só `import type`)', () => {
    // O @prisma/client carrega o .env antigo ao ser importado; um import estático
    // rodaria antes de qualquer validação.
    const files = [
      ['scripts', 'demo-db.ts'],
      ['src', 'lib', 'demo-db', 'cli.ts'],
      ['src', 'lib', 'demo-db', 'connection.ts'],
      ['src', 'lib', 'demo-db', 'env-file.ts'],
      ['src', 'lib', 'demo-db', 'target.ts'],
      ['src', 'lib', 'demo-db', 'guard.ts'],
      ['src', 'lib', 'demo-db', 'state.ts'],
      ['src', 'lib', 'demo-db', 'seed.ts'],
      ['src', 'data', 'demo-catalog.ts'],
    ]
    for (const parts of files) {
      const src = readFileSync(join(ROOT, ...parts), 'utf8')
      const name = parts.join('/')
      // `[^'"]` impede a regex de atravessar o import anterior (o código não usa `;`).
      expect(src, name).not.toMatch(/^import\s+(?!type\b)[^'"]*?\bfrom\s+['"]@prisma\/client['"]/m)
      expect(src, name).not.toMatch(/^import\s+['"]@prisma\/client['"]/m)
      expect(src, name).not.toMatch(/import\(\s*['"]@prisma\/client['"]\s*\)/)
      expect(src, name).not.toMatch(/['"]@\/lib\/prisma['"]/)
    }
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
