import { afterEach, describe, expect, it, vi } from 'vitest'
import { lookupZip, normalizeViaCep } from './viacep'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('normalizeViaCep', () => {
  it('mapeia os campos do ViaCEP', () => {
    expect(
      normalizeViaCep({
        logradouro: 'Praça da Sé',
        bairro: 'Sé',
        localidade: 'São Paulo',
        uf: 'SP',
      }),
    ).toEqual({ street: 'Praça da Sé', neighborhood: 'Sé', city: 'São Paulo', state: 'SP' })
  })

  it('devolve null quando o ViaCEP marca erro', () => {
    expect(normalizeViaCep({ erro: true })).toBeNull()
    expect(normalizeViaCep({ erro: 'true' })).toBeNull()
  })

  it('devolve null sem cidade/UF ou com payload inválido', () => {
    expect(normalizeViaCep({ logradouro: 'X' })).toBeNull()
    expect(normalizeViaCep(null)).toBeNull()
    expect(normalizeViaCep('nope')).toBeNull()
  })

  it('logradouro/bairro ausentes viram string vazia (CEP geral de cidade)', () => {
    expect(normalizeViaCep({ localidade: 'Manaus', uf: 'AM' })).toEqual({
      street: '',
      neighborhood: '',
      city: 'Manaus',
      state: 'AM',
    })
  })
})

describe('lookupZip', () => {
  it('não chama a rede para CEP com menos de 8 dígitos', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await lookupZip('123')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('consulta o ViaCEP e normaliza', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ localidade: 'Rio de Janeiro', uf: 'RJ' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(await lookupZip('20010-000')).toEqual({
      street: '',
      neighborhood: '',
      city: 'Rio de Janeiro',
      state: 'RJ',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://viacep.com.br/ws/20010000/json/',
      expect.anything(),
    )
  })

  it('devolve null quando a rede falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await lookupZip('20010000')).toBeNull()
  })
})
