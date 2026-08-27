// Modelo de visualização da loja (derivado das entidades do Prisma pelo
// mapeamento em `src/server/catalog.ts`). Preços em REAIS para a UI;
// o banco é a fonte da verdade em centavos.

export interface ProductSpec {
  label: string
  value: string
}

export interface Product {
  id: string
  slug: string
  name: string
  category: string
  categorySlug: string
  brand: string
  price: number
  originalPrice?: number
  description: string
  imageUrl?: string
  gradient?: string
  icon?: string
  rating: number
  reviews: number
  specs: ProductSpec[]
  featured?: boolean
}

export interface CartItem {
  product: Product
  quantity: number
}
