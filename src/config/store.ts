// Configuração da loja. Os valores vêm de variáveis de ambiente
// (NEXT_PUBLIC_*, ver `.env.example`) e caem para um default seguro.
// Futuramente estes dados devem migrar para a tabela `Setting` do banco.
//
// Atenção: a variável de ambiente tem prioridade sobre o default. Se o ambiente
// ainda tiver um nome antigo, é ele que aparece na loja.
export const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Bella&Cheirosa'

/**
 * Número de WhatsApp da loja no formato internacional brasileiro: só dígitos,
 * `55` + DDD + número (10 ou 11 dígitos depois do código do país).
 */
const STORE_WHATSAPP_PATTERN = /^55\d{10,11}$/

/** Valor da env → número válido, ou `null` (ausente, vazio ou fora do formato). */
export function parseStoreWhatsAppNumber(value: string | undefined): string | null {
  return typeof value === 'string' && STORE_WHATSAPP_PATTERN.test(value) ? value : null
}

// Sem fallback: sem número válido, todos os links de WhatsApp da loja ficam
// ocultos (ver buildWhatsAppUrl em src/lib/whatsapp.ts). Nunca um número fictício.
export const STORE_WHATSAPP_NUMBER: string | null = parseStoreWhatsAppNumber(
  process.env.NEXT_PUBLIC_STORE_WHATSAPP_NUMBER,
)

export const STORE_TAGLINE =
  process.env.NEXT_PUBLIC_STORE_TAGLINE || 'Fragrâncias e cuidados para todos os seus momentos'

/** Pasta (no Cloudinary) para NOVOS uploads de imagens de produto. */
export const CLOUDINARY_PRODUCTS_FOLDER = 'bella-cheirosa/produtos'
