// Configuração da loja. Os valores vêm de variáveis de ambiente
// (NEXT_PUBLIC_*, ver `.env.example`) e caem para um default seguro.
// Futuramente estes dados devem migrar para a tabela `Setting` do banco.
//
// Atenção: a variável de ambiente tem prioridade sobre o default. Se o ambiente
// ainda tiver um nome antigo, é ele que aparece na loja.
export const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Bella&Cheirosa'

// formato: 55 + DDD + número, sem espaços/símbolos
export const STORE_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_STORE_WHATSAPP_NUMBER || '5511999999999'

export const STORE_TAGLINE =
  process.env.NEXT_PUBLIC_STORE_TAGLINE || 'Fragrâncias e cuidados para todos os seus momentos'

/** Pasta (no Cloudinary) para NOVOS uploads de imagens de produto. */
export const CLOUDINARY_PRODUCTS_FOLDER = 'bella-cheirosa/produtos'
