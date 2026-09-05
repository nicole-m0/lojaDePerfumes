// CEP — normalização e validação. Puro e isomórfico (sem `server-only`):
// usado no cliente (formulário / ViaCEP) e no servidor (Melhor Envio).

/** Mantém só dígitos. "01001-000" / "01001 000" -> "01001000". */
export function normalizeZip(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '')
}

/** CEP brasileiro válido = exatamente 8 dígitos. */
export function isValidZip(raw: string | null | undefined): boolean {
  return /^\d{8}$/.test(normalizeZip(raw))
}

/** "01001000" -> "01001-000". Devolve a entrada normalizada se não tiver 8 dígitos. */
export function formatZip(raw: string | null | undefined): string {
  const digits = normalizeZip(raw)
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}
