// Configuração da loja. Os valores vêm de variáveis de ambiente
// (NEXT_PUBLIC_*, ver `.env.example`) e caem para um default seguro.
// Futuramente estes dados devem migrar para a tabela `Setting` do banco.
export const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Loja Vênus'

// formato: 55 + DDD + número, sem espaços/símbolos
export const STORE_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_STORE_WHATSAPP_NUMBER || '5511999999999'

export const STORE_TAGLINE =
  process.env.NEXT_PUBLIC_STORE_TAGLINE ||
  'Perfumes, cosméticos e presentes que iluminam você'
