// Validação de origem para POSTs sensíveis (logout). Função pura e testável.
//
// O Next já recusa Server Actions cujo `Origin` não corresponda ao host; esta é uma
// segunda barreira, explícita, com a mesma regra: o host do `Origin` precisa ser
// igual ao `x-forwarded-host` (atrás de proxy, como na Vercel) ou ao `host`.
// Sem `Origin` → recusa (navegadores sempre o enviam em POST de formulário/fetch).

export function isSameOrigin(
  origin: string | null | undefined,
  forwardedHost: string | null | undefined,
  host: string | null | undefined,
): boolean {
  if (!origin || origin === 'null') return false
  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return false
  }
  // `x-forwarded-host` pode trazer uma lista ("a, b"): vale o primeiro (o do cliente).
  const expected = (forwardedHost?.split(',')[0] ?? host ?? '').trim().toLowerCase()
  return expected !== '' && originHost === expected
}
