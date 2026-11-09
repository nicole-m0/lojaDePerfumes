import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Testes ESTRUTURAIS (leem o código): nenhum caminho do painel fica sem proteção.
// Se uma página, Server Action ou rota de API nova surgir sem guarda, falha aqui.

const ROOT = join(process.cwd(), 'src', 'app')
const DASHBOARD = join(ROOT, '(admin)', 'admin', '(dashboard)')

function walk(dir: string, name: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p, name))
    else if (entry === name) out.push(p)
  }
  return out
}
const rel = (p: string) => relative(ROOT, p).split(sep).join('/')
const read = (p: string) => readFileSync(p, 'utf8')
/** Remove comentários (para não contar menções em texto). */
const code = (s: string) =>
  s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Corpo de cada `export async function` do arquivo. */
function exportedFunctions(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  const re = /export async function (\w+)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let i = src.indexOf('(', m.index)
    let depth = 0
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')' && --depth === 0) break
    }
    // o corpo começa na primeira `{` que termina a linha (tipos de retorno como
    // `Promise<{ a: number }>` têm `{` seguida de espaço)
    const open = src.indexOf('{\n', i)
    let j = open
    depth = 0
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}' && --depth === 0) break
    }
    out.push({ name: m[1], body: src.slice(open + 1, j) })
  }
  return out
}

const isFinance = (p: string) => rel(p).includes('/financeiro/')

describe('páginas e layout do painel', () => {
  const pages = walk(DASHBOARD, 'page.tsx')

  it('encontra as 13 páginas do painel', () => {
    expect(pages.length).toBe(13)
  })

  it.each(pages.map((p) => [rel(p), p]))('%s chama requireStaffPage', (_r, p) => {
    const src = code(read(p))
    expect(src).toMatch(/await requireStaffPage\(/)
    if (isFinance(p)) expect(src).toContain("requireStaffPage('finance')")
  })

  it('o layout do painel chama requireStaffPage', () => {
    expect(code(read(join(DASHBOARD, 'layout.tsx')))).toMatch(/await requireStaffPage\(/)
  })
})

describe('Server Actions do painel', () => {
  const files = walk(DASHBOARD, 'actions.ts')

  it('encontra os 5 arquivos de actions', () => {
    expect(files.length).toBe(5)
  })

  const cases = files.flatMap((f) =>
    exportedFunctions(code(read(f))).map((fn) => [`${rel(f)} → ${fn.name}`, fn.body, isFinance(f)] as const),
  )

  it('encontra todas as actions exportadas', () => {
    expect(cases.length).toBeGreaterThanOrEqual(19)
  })

  it.each(cases)('%s começa por requireStaff', (_label, body, finance) => {
    const firstStatement = body.trim().split('\n')[0]
    expect(firstStatement).toMatch(/await requireStaff\(/)
    if (finance) expect(firstStatement).toContain("requireStaff('finance')")
  })
})

describe('rotas de API e handlers', () => {
  // Públicas por natureza — cada uma tem a própria proteção (ou não expõe dados).
  const PUBLIC = new Set([
    'api/auth/[...nextauth]/route.ts', // Auth.js
    'api/health/route.ts', // só "banco no ar/fora"
    'api/webhooks/mercadopago/route.ts', // assinatura do Mercado Pago
  ])
  const routes = walk(ROOT, 'route.ts')

  it.each(routes.map((p) => [rel(p), p]))('%s é pública conhecida ou exige requireStaff', (r, p) => {
    if (PUBLIC.has(r)) return
    expect(code(read(p))).toMatch(/await requireStaff\(/)
  })

  it('nenhuma rota (route.ts) encerra sessão — logout só por POST via Server Action', () => {
    for (const p of routes) {
      if (rel(p) === 'api/auth/[...nextauth]/route.ts') continue // endpoints do próprio Auth.js
      expect(code(read(p))).not.toMatch(/signOut/)
    }
  })
})

describe('logout protegido', () => {
  const SRC = join(process.cwd(), 'src')
  const all = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e)
      return statSync(p).isDirectory() ? all(p) : /\.(ts|tsx)$/.test(e) && !/\.test\./.test(e) ? [p] : []
    })

  it('signOut só é chamado em session-actions.ts (fora do Auth.js)', () => {
    const callers = all(SRC).filter((p) => /\bsignOut\(/.test(code(read(p))))
    expect(callers.map((p) => relative(SRC, p).split(sep).join('/'))).toEqual(['server/session-actions.ts'])
  })

  it('as duas actions de logout conferem a origem antes de tudo', () => {
    const src = code(read(join(SRC, 'server', 'session-actions.ts')))
    expect(src.startsWith("'use server'")).toBe(true)
    for (const fn of exportedFunctions(src)) {
      expect(fn.body.trim().split('\n')[0]).toMatch(/await assertSameOrigin\(\)/)
    }
  })

  it('o cabeçalho do painel usa a action de logout (POST)', () => {
    expect(code(read(join(DASHBOARD, 'layout.tsx')))).toMatch(/<form action=\{signOutAction\}>/)
  })

  it('/admin/sessao-encerrada não aparece em links de navegação', () => {
    for (const p of all(SRC)) {
      expect(code(read(p))).not.toMatch(/href=\{?["'`]\/admin\/sessao-encerrada/)
    }
  })
})

describe('estorno e chargeback', () => {
  it('payments.ts decide pelo papel do banco via can(…, paymentReverse)', () => {
    const src = code(read(join(process.cwd(), 'src', 'server', 'payments.ts')))
    expect(src).toContain("can(staff.role, 'paymentReverse')")
    expect(src).not.toMatch(/role\s*[!=]==\s*'OWNER'/)
  })
})
