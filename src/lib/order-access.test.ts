import { describe, expect, it } from 'vitest'
import { createOrderAccessToken, orderReturnQuery, verifyOrderAccessToken } from './order-access'

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
