// Telefone brasileiro — normalização para E.164 (WhatsApp Cloud API).
// Puro e isomórfico (sem `server-only`): mesmo espírito de src/lib/shipping/cep.ts.
// Reutilizável pelo futuro serviço de envio (Fase 7) sem depender dele.

// DDD (2 dígitos, nenhum começa em 0) + celular (9 dígitos, começa em 9) OU
// fixo (8 dígitos, começa em 2-5). Não cobre o celular de 8 dígitos sem o 9º
// dígito (formato descontinuado no Brasil desde 2016).
const NATIONAL_PHONE_RE = /^[1-9]{2}(?:9\d{8}|[2-5]\d{7})$/

/**
 * Normaliza um telefone brasileiro — com ou sem máscara, com ou sem "+55" —
 * para E.164 ("+55DDDNNNNNNNNN"). Devolve `null` quando a entrada não é um
 * celular ou fixo brasileiro válido; nunca lança.
 *
 * Resolve a ambiguidade do DDD 55 (RS) por comprimento de dígitos: 10/11
 * dígitos = número nacional (sem código do país); 12/13 dígitos = já inclui
 * o "55" do código do país. Um nacional de 11 dígitos começando em "55"
 * (ex.: DDD 55 + celular) nunca é confundido com código do país, porque só
 * tem 11 dígitos — precisaria de 13 para incluir o "55" do país.
 */
export function normalizePhoneToE164(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (!digits) return null

  let national: string
  if (digits.length === 12 || digits.length === 13) {
    if (!digits.startsWith('55')) return null
    national = digits.slice(2)
  } else if (digits.length === 10 || digits.length === 11) {
    national = digits
  } else {
    return null
  }

  if (!NATIONAL_PHONE_RE.test(national)) return null
  return `+55${national}`
}
