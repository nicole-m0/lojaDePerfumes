// ViaCEP — consulta de endereço por CEP para auxiliar o preenchimento no
// checkout. Isomórfico (sem `server-only`): a API é pública, sem auth, e tem
// CORS liberado, então roda direto no cliente. É só conveniência de UX — o
// cliente pode corrigir qualquer campo, e o frete usa o CEP, não estes dados.

import { normalizeZip } from './cep'

export interface ViaCepAddress {
  street: string
  neighborhood: string
  city: string
  state: string
}

interface RawViaCep {
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
  erro?: boolean | string
}

/** Converte a resposta crua do ViaCEP. `null` quando o CEP não existe. */
export function normalizeViaCep(raw: unknown): ViaCepAddress | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as RawViaCep
  if (r.erro) return null
  if (!r.localidade || !r.uf) return null
  return {
    street: r.logradouro ?? '',
    neighborhood: r.bairro ?? '',
    city: r.localidade,
    state: r.uf,
  }
}

/** Busca o endereço de um CEP. `null` se o CEP for inválido, não existir ou a rede falhar. */
export async function lookupZip(rawZip: string): Promise<ViaCepAddress | null> {
  const zip = normalizeZip(rawZip)
  if (zip.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${zip}/json/`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    return normalizeViaCep(await res.json())
  } catch {
    return null
  }
}
