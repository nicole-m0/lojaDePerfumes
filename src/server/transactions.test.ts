import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Testes ESTRUTURAIS das transações: complementam o banco falso, que não reproduz o
// isolamento real do PostgreSQL. Garantem, lendo o código, que:
// - nenhuma transação interativa usa a conexão global (`prisma.`) por dentro;
// - as transições de pedido travam a linha (FOR UPDATE) ANTES do updateMany
//   condicional, na mesma transação;
// - estoque ligado a pedido só usa o `tx` recebido.

const SRC = join(process.cwd(), 'src')
// Normaliza CRLF (checkout com core.autocrlf) e remove comentários.
const code = (s: string) =>
  s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (...p: string[]) => code(readFileSync(join(SRC, ...p), 'utf8'))

function sources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...sources(p))
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !p.includes(`${sep}test${sep}`)) {
      out.push(p)
    }
  }
  return out
}

/** Argumento de cada `$transaction(...)` interativo (callback, não array). */
function interactiveTransactions(src: string): string[] {
  const out: string[] = []
  const re = /\$transaction\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length
    if (src.slice(start).trimStart().startsWith('[')) continue // forma em lote
    let depth = 1
    let i = start
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') depth--
    }
    out.push(src.slice(start, i - 1))
  }
  return out
}

/** Corpo de uma função (declarada com `function nome(`) do arquivo. */
function fnBody(src: string, name: string): string {
  const at = src.search(new RegExp(`function ${name}\\s*\\(`))
  if (at < 0) throw new Error(`função ${name} não encontrada`)
  let i = src.indexOf('(', at)
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
  return src.slice(open + 1, j)
}

describe('transações interativas', () => {
  const withTx = sources(SRC)
    .map((f) => ({
      file: relative(SRC, f).split(sep).join('/'),
      txs: interactiveTransactions(code(readFileSync(f, 'utf8'))),
    }))
    .filter((x) => x.txs.length > 0)

  it('encontra transações para verificar', () => {
    expect(withTx.length).toBeGreaterThan(5)
  })

  it.each(withTx.map((x) => [x.file, x.txs] as const))(
    '%s: nenhuma usa a conexão global dentro da transação',
    (_f, txs) => {
      for (const body of txs) expect(body).not.toMatch(/\bprisma\./)
    },
  )
})

describe('order-transitions.ts', () => {
  const src = read('server', 'order-transitions.ts')

  it('não importa nem usa o cliente global', () => {
    expect(src).not.toMatch(/@\/lib\/prisma/)
    expect(src).not.toMatch(/\bprisma\./)
  })

  it('lockAndLoad trava a linha (lockOrderRow) antes de ler o pedido', () => {
    const body = fnBody(src, 'lockAndLoad')
    expect(body.indexOf('lockOrderRow(tx')).toBeGreaterThanOrEqual(0)
    expect(body.indexOf('lockOrderRow(tx')).toBeLessThan(body.indexOf('tx.order.findUnique'))
  })

  it('o status é gravado com updateMany condicionado ao status lido', () => {
    const body = fnBody(src, 'setStatusIfUnchanged')
    expect(body).toMatch(/tx\.order\.updateMany\(\{\s*where: \{ id: orderId, status: from \}/)
    expect(body).toMatch(/result\.count !== 1/)
  })

  it.each([
    'changeOrderStatusInTx',
    'cancelOrderInTx',
    'registerOrderReturnInTx',
    'confirmOrderAfterGatewayPaymentInTx',
  ])(
    '%s: primeira operação é lockAndLoad(tx, …); status só depois',
    (name) => {
      const body = fnBody(src, name)
      expect(body.trim()).toMatch(/^const order = await lockAndLoad\(tx, input\.orderId\)/)
      const lock = body.indexOf('lockAndLoad(tx')
      const write = body.indexOf('setStatusIfUnchanged(tx')
      if (write >= 0) expect(lock).toBeLessThan(write)
    },
  )
})

describe('order-lock.ts', () => {
  it('usa SELECT … FOR UPDATE no tx recebido', () => {
    const src = read('server', 'order-lock.ts')
    expect(src).toMatch(/tx\.\$queryRaw[\s\S]*FOR UPDATE/)
    expect(src).not.toMatch(/@\/lib\/prisma/)
  })

  it('payments.ts usa a mesma trava; order-lock só importa tipos (sem ciclo)', () => {
    expect(read('server', 'payments.ts')).toContain("from '@/server/order-lock'")
    const lockImports = read('server', 'order-lock.ts').match(/^import .*$/gm) ?? []
    expect(lockImports.length).toBeGreaterThan(0)
    expect(lockImports.every((l) => l.startsWith('import type') && l.includes("'@prisma/client'"))).toBe(true)
  })
})

describe('estoque ligado a pedido (stock.ts)', () => {
  const src = read('server', 'stock.ts')
  it.each([
    'readOrderStockLedger',
    'decrementStockForOrder',
    'restoreStockForOrder',
    'registerPhysicalReturn',
    'lockProductsAndFindShortages',
  ])(
    '%s só usa o tx recebido',
    (name) => {
      expect(fnBody(src, name)).not.toMatch(/\bprisma\./)
    },
  )
})

describe('tempos das transações que travam o pedido', () => {
  it('as 3 transações de status/estoque das actions de pedido usam ORDER_TX_OPTIONS', () => {
    const src = read('app', '(admin)', 'admin', '(dashboard)', 'pedidos', '[id]', 'actions.ts')
    // Só as que travam o pedido (via *InTx). A de entrega (upsertShipment) não trava
    // o pedido nem mexe em estoque — fica com os tempos padrão.
    const txs = interactiveTransactions(src).filter((t) => /InTx\(tx/.test(t))
    expect(txs).toHaveLength(3)
    for (const t of txs) expect(t).toMatch(/ORDER_TX_OPTIONS\s*,?\s*$/)
  })

  it('as 3 transações do serviço de pagamentos usam ORDER_TX_OPTIONS', () => {
    const txs = interactiveTransactions(read('server', 'payments.ts'))
    expect(txs).toHaveLength(3)
    for (const t of txs) expect(t).toMatch(/ORDER_TX_OPTIONS\s*,?\s*$/)
  })
})

describe('actions de pedido', () => {
  const src = read('app', '(admin)', 'admin', '(dashboard)', 'pedidos', '[id]', 'actions.ts')
  it('não chamam baixa/devolução de estoque diretamente — só via order-transitions', () => {
    expect(src).not.toMatch(/decrementStockForOrder|restoreStockForOrder|registerPhysicalReturn/)
    expect(src).toMatch(/changeOrderStatusInTx\(tx/)
    expect(src).toMatch(/cancelOrderInTx\(tx/)
    expect(src).toMatch(/registerOrderReturnInTx\(tx/)
  })
})

describe('confirmação automática por pagamento do gateway (Etapa D2)', () => {
  const payments = read('server', 'payments.ts')
  const transitions = read('server', 'order-transitions.ts')

  it('só applyGatewayPaymentUpdate dispara a confirmação, dentro da própria transação', () => {
    const gateway = fnBody(payments, 'applyGatewayPaymentUpdate')
    expect(gateway).toMatch(/confirmOrderAfterGatewayPaymentInTx\(tx,/)
    const [tx] = interactiveTransactions(gateway)
    expect(tx).toContain('confirmOrderAfterGatewayPaymentInTx(tx,')
  })

  it.each(['createManualPayment', 'transitionPaymentStatus'])(
    '%s (pagamento manual) nunca confirma o pedido',
    (name) => {
      expect(fnBody(payments, name)).not.toMatch(/confirmOrder|confirmIfNewlyPaid/)
    },
  )

  it('a confirmação só acontece para status traduzido PAID e resultado "applied"', () => {
    const gateway = fnBody(payments, 'applyGatewayPaymentUpdate')
    expect(gateway).toMatch(/input\.mappedStatus !== 'PAID'/)
    expect(gateway).toMatch(/outcome !== 'applied'/)
  })

  it('confere o estoque (travando produtos) ANTES de mudar o status, e baixa depois', () => {
    const body = fnBody(transitions, 'confirmOrderAfterGatewayPaymentInTx')
    const check = body.indexOf('lockProductsAndFindShortages(tx')
    const write = body.indexOf("setStatusIfUnchanged(tx, input.orderId, 'PENDING', 'CONFIRMED')")
    const take = body.indexOf('decrementStockForOrder(tx')
    expect(check).toBeGreaterThan(0)
    expect(check).toBeLessThan(write)
    expect(write).toBeLessThan(take)
  })

  it('a trava dos produtos usa FOR UPDATE em ordem de id', () => {
    const body = fnBody(read('server', 'stock.ts'), 'lockProductsAndFindShortages')
    expect(body).toMatch(/tx\.\$queryRaw[\s\S]*FROM "Product"[\s\S]*ORDER BY id FOR UPDATE/)
    expect(body).toMatch(/\.sort\(\)/)
  })
})
