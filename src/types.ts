export type ProductCategory =
  | 'Perfumes Femininos'
  | 'Perfumes Masculinos'
  | 'Presentes Femininos'
  | 'Presentes Masculinos'
  | 'Makes, batons'
  | 'Skincare, protetor solares'
  | 'Hidratantes'
  | 'Sabonetes e óleos de banho'
  | 'Body splash e body spray'
  | 'Bolsas e carteiras'
  | 'Cuidados masculinos'
  | 'Antitranspirante'
  | 'Produtos de cabelo'
  | 'Produtos infantil'
  | 'Óculos'
  | 'Chocolates'

export type ProductBrand =
  | 'Blossom'
  | 'Avon'
  | 'Avon Casa & Estilo'
  | 'Eudora'
  | 'Hinode'
  | 'Jequiti'
  | 'Mary Kay'
  | 'O Boticário'
  | 'O.U.i'
  | 'Quem Disse, Berenice?'
  | 'Natura'
  | 'Árabes e Importados'
  | 'Presentes'
  | 'Creamy'
  | 'Mawwal'

export interface ProductSpec {
  label: string
  value: string
}

export interface Product {
  id: string
  slug: string
  name: string
  category: ProductCategory
  brand: ProductBrand
  price: number
  originalPrice?: number
  description: string
  gradient: string
  icon: 'perfume' | 'gift' | 'lipstick' | 'lotion' | 'soap' | 'bag' | 'sun' | 'spray'
  rating: number
  reviews: number
  specs: ProductSpec[]
  featured?: boolean
}

export interface CartItem {
  product: Product
  quantity: number
}
