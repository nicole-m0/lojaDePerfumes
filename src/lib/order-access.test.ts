import { describe, expect, it } from 'vitest'
import {
  createOrderAccessToken,
  orderReturnQuery,
  parseOrderNumberParam,
  parseTokenParam,
  verifyOrderAccessToken,
} from './order-access'

const SECRET = 'test-secret-de-pelo-menos-32-caracteres!!'

describe('createOrderAccessToken / verifyOrderAccessToken', () => {
  it('aceita o token gerado para o mesmo pedido', () => {
    const token = createOrderAccessToken('ord_1', SECRET)
    expect(verifyOrderAccessToken('ord_1', token, SECRET)).toBe(true)
  })

  it('gera token base64url de 32 caracteres e determinístico', () => {
    const token = createOrderAccessToken('ord_1', SECRET)
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(createOrderAccessToken('ord_1', SECRET)).toBe(token)
  })

  it('recusa o token de um pedido em outro pedido', () => {
    const token = createOrderAccessToken('ord_1', SECRET)
    expect(verifyOrderAccessToken('ord_2', token, SECRET)).toBe(false)
  })

  it('recusa token assinado com outro segredo', () => {
    const token = createOrderAccessToken('ord_1', 'outro-segredo-qualquer-0000000000000')
    expect(verifyOrderAccessToken('ord_1', token, SECRET)).toBe(false)
  })

  it('recusa token adulterado (1 caractere trocado)', () => {
    const token = createOrderAccessToken('ord_1', SECRET)
    const tampered = (token[0] === 'A' ? 'B' : 'A') + token.slice(1)
    expect(verifyOrderAccessToken('ord_1', tampered, SECRET)).toBe(false)
  })

  it('recusa token ausente, vazio ou malformado sem lançar', () => {
    for (const bad of [null, undefined, '', 'curto', 'x'.repeat(33), '!'.repeat(32), '1']) {
      expect(verifyOrderAccessToken('ord_1', bad, SECRET)).toBe(false)
    }
  })

  it('falha fechada sem segredo: verify = false e create lança', () => {
    const token = createOrderAccessToken('ord_1', SECRET)
    expect(verifyOrderAccessToken('ord_1', token, undefined)).toBe(false)
    expect(verifyOrderAccessToken('ord_1', token, '')).toBe(false)
    expect(() => createOrderAccessToken('ord_1', undefined)).toThrow()
    expect(() => createOrderAccessToken('', SECRET)).toThrow()
  })

  it('o número sequencial do pedido não serve como token', () => {
    expect(verifyOrderAccessToken('ord_1', '1', SECRET)).toBe(false)
  })
})

describe('orderReturnQuery', () => {
  it('monta ?pedido=N&token=T', () => {
    const token = createOrderAccessToken('ord_1', SECRET)
    expect(orderReturnQuery(7, token)).toBe(`?pedido=7&token=${token}`)
  })
})

describe('parseOrderNumberParam (Etapa D3)', () => {
  it('aceita inteiro positivo simples', () => {
    expect(parseOrderNumberParam('1')).toBe(1)
    expect(parseOrderNumberParam('42')).toBe(42)
    expect(parseOrderNumberParam('2147483647')).toBe(2147483647)
  })

  it.each([undefined, null, '', '0', '-1', '+1', '01', '1.0', '1e3', '0x7', ' 7', '7 ', 'abc', '2147483648', '99999999999', ['1'], 7])(
    'recusa %j',
    (value) => {
      expect(parseOrderNumberParam(value)).toBeNull()
    },
  )
})

describe('parseTokenParam (Etapa D3)', () => {
  it('só aceita string não vazia; array (parâmetro repetido) é recusado', () => {
    expect(parseTokenParam('abc')).toBe('abc')
    expect(parseTokenParam('')).toBeNull()
    expect(parseTokenParam(undefined)).toBeNull()
    expect(parseTokenParam(['a', 'b'])).toBeNull()
  })
})

describe('integridade do token (revisão D3)', () => {
  const token = createOrderAccessToken('ord_x', SECRET)

  it('qualquer caractere trocado invalida o token', () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    for (let i = 0; i < token.length; i++) {
      const other = alphabet[(alphabet.indexOf(token[i]) + 1) % alphabet.length]
      const tampered = token.slice(0, i) + other + token.slice(i + 1)
      expect(verifyOrderAccessToken('ord_x', tampered, SECRET)).toBe(false)
    }
  })

  it('token com caractere a mais ou a menos é recusado', () => {
    expect(verifyOrderAccessToken('ord_x', `${token}A`, SECRET)).toBe(false)
    expect(verifyOrderAccessToken('ord_x', token.slice(1), SECRET)).toBe(false)
  })

  it('ids de pedido parecidos geram tokens diferentes', () => {
    expect(verifyOrderAccessToken('ord_x2', token, SECRET)).toBe(false)
    expect(verifyOrderAccessToken('ord_', token, SECRET)).toBe(false)
  })
})
