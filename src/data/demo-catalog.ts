// Catálogo FICTÍCIO da Bella&Cheirosa (loja demonstrativa — projeto de portfólio).
//
// Usado APENAS pelo seed do banco de demonstração (`src/lib/demo-db/seed.ts`, via
// `scripts/demo-db.ts seed`). A loja e o painel leem do banco.
//
// Regras deste arquivo (verificadas em `demo-catalog.test.ts`):
// - marcas, produtos e nomes comerciais inventados — nenhuma marca real nem
//   alusão a produto real ("inspirado em…");
// - sem avaliações, depoimentos ou quantidades vendidas;
// - dinheiro sempre em centavos (inteiro);
// - preço "de" (compareAtPriceCents) só em promoções declaradas; nos kits é a
//   soma dos itens avulsos que o compõem (`kitOf`);
// - estoque inicial lançado como movimentação de entrada (livro-razão).

export interface DemoSpec {
  label: string
  value: string
}

export interface DemoProductImage {
  url: string
  publicId?: string
  alt: string
}

export interface DemoProduct {
  slug: string
  name: string
  brand: string
  category: string
  description: string
  priceCents: number
  compareAtPriceCents?: number
  costCents: number
  initialStock: number
  featured?: boolean
  weightGrams: number
  heightCm: number
  widthCm: number
  lengthCm: number
  specs: DemoSpec[]
  /** Kits: slugs dos produtos avulsos que compõem o kit. */
  kitOf?: string[]
  /** Fotos individuais — preenchidas quando as imagens forem produzidas. */
  images?: DemoProductImage[]
}

export const DEMO_CATEGORIES = [
  { name: 'Perfumes Femininos', slug: 'perfumes-femininos' },
  { name: 'Perfumes Masculinos', slug: 'perfumes-masculinos' },
  { name: 'Perfumes Unissex', slug: 'perfumes-unissex' },
  { name: 'Corpo e Banho', slug: 'corpo-e-banho' },
  { name: 'Hidratantes', slug: 'hidratantes' },
  { name: 'Kits e Presentes', slug: 'kits-e-presentes' },
] as const

export const DEMO_BRANDS = [
  { name: 'Ateliê Bella&Cheirosa', slug: 'atelie-bella-cheirosa' },
  { name: 'Rosalume', slug: 'rosalume' },
  { name: 'Cais Norte', slug: 'cais-norte' },
  { name: 'Ambarê', slug: 'ambare' },
  { name: 'Ervaria', slug: 'ervaria' },
  { name: 'Orvalha', slug: 'orvalha' },
] as const

type CategoryName = (typeof DEMO_CATEGORIES)[number]['name']
type BrandName = (typeof DEMO_BRANDS)[number]['name']

interface PerfumeNotes {
  volume: string
  concentration: string
  gender: 'Feminino' | 'Masculino' | 'Unissex'
  family: string
  top: string
  heart: string
  base: string
}

function perfumeSpecs(n: PerfumeNotes): DemoSpec[] {
  return [
    { label: 'Volume', value: n.volume },
    { label: 'Concentração', value: n.concentration },
    { label: 'Gênero', value: n.gender },
    { label: 'Família olfativa', value: n.family },
    { label: 'Notas de saída', value: n.top },
    { label: 'Notas de coração', value: n.heart },
    { label: 'Notas de fundo', value: n.base },
  ]
}

interface CareInfo {
  content: string
  indication: string
  fragrance: string
  highlights: string
  usage: string
}

function careSpecs(c: CareInfo): DemoSpec[] {
  return [
    { label: 'Conteúdo', value: c.content },
    { label: 'Indicação', value: c.indication },
    { label: 'Fragrância', value: c.fragrance },
    { label: 'Destaques da fórmula', value: c.highlights },
    { label: 'Modo de uso', value: c.usage },
  ]
}

function kitSpecs(contents: string, packaging: string, occasion: string): DemoSpec[] {
  return [
    { label: 'Conteúdo do kit', value: contents },
    { label: 'Embalagem', value: packaging },
    { label: 'Indicação', value: occasion },
  ]
}

// Dimensões padrão (cm / g) por formato de embalagem.
const BOX_100ML = { weightGrams: 420, heightCm: 6, widthCm: 9, lengthCm: 16 }
const BOX_75ML = { weightGrams: 340, heightCm: 6, widthCm: 8, lengthCm: 15 }
const BOX_50ML = { weightGrams: 260, heightCm: 5, widthCm: 7, lengthCm: 13 }
const BOX_30ML = { weightGrams: 190, heightCm: 5, widthCm: 6, lengthCm: 11 }
const BOX_200ML = { weightGrams: 520, heightCm: 7, widthCm: 9, lengthCm: 20 }
const KIT_BOX = { weightGrams: 1100, heightCm: 10, widthCm: 22, lengthCm: 26 }
const KIT_BOX_SMALL = { weightGrams: 450, heightCm: 6, widthCm: 16, lengthCm: 20 }

type ProductInput = Omit<DemoProduct, 'brand' | 'category'> & {
  brand: BrandName
  category: CategoryName
}

const product = (p: ProductInput): DemoProduct => p

export const DEMO_PRODUCTS: DemoProduct[] = [
  // --- Perfumes Femininos -------------------------------------------------
  product({
    slug: 'flor-de-ameixa-eau-de-parfum-100ml',
    name: 'Flor de Ameixa Eau de Parfum 100 ml',
    brand: 'Rosalume',
    category: 'Perfumes Femininos',
    description:
      'Um floral frutado luminoso, em que a ameixa madura encontra pétalas de peônia sobre um fundo macio de almíscar. Delicado na saída e aconchegante ao longo do dia, combina com rotinas de trabalho e encontros ao fim da tarde.',
    priceCents: 24990,
    costCents: 9800,
    initialStock: 18,
    featured: true,
    ...BOX_100ML,
    specs: perfumeSpecs({
      volume: '100 ml',
      concentration: 'Eau de Parfum',
      gender: 'Feminino',
      family: 'Floral frutado',
      top: 'Ameixa, pera e bergamota',
      heart: 'Peônia, rosa e flor de pessegueiro',
      base: 'Almíscar, madeira clara e baunilha',
    }),
  }),
  product({
    slug: 'veu-de-iris-eau-de-parfum-50ml',
    name: 'Véu de Íris Eau de Parfum 50 ml',
    brand: 'Rosalume',
    category: 'Perfumes Femininos',
    description:
      'Íris e violeta em leitura atalcada e serena, com um toque de baunilha que deixa a pele com sensação de tecido macio. Uma fragrância discreta, pensada para quem prefere perfumes próximos à pele.',
    priceCents: 18990,
    costCents: 7400,
    initialStock: 14,
    ...BOX_50ML,
    specs: perfumeSpecs({
      volume: '50 ml',
      concentration: 'Eau de Parfum',
      gender: 'Feminino',
      family: 'Floral atalcado',
      top: 'Tangerina e semente de cenoura',
      heart: 'Íris, violeta e heliotrópio',
      base: 'Baunilha, almíscar e sândalo',
    }),
  }),
  product({
    slug: 'rosa-ambar-parfum-30ml',
    name: 'Rosa Âmbar Parfum 30 ml',
    brand: 'Rosalume',
    category: 'Perfumes Femininos',
    description:
      'Concentração de parfum para uma rosa profunda, aquecida por açafrão e âmbar. Encorpado e envolvente, rende poucas borrifadas e é indicado para a noite e para os dias mais frios.',
    priceCents: 27990,
    costCents: 11200,
    initialStock: 6,
    ...BOX_30ML,
    specs: perfumeSpecs({
      volume: '30 ml',
      concentration: 'Parfum',
      gender: 'Feminino',
      family: 'Oriental floral',
      top: 'Açafrão e framboesa',
      heart: 'Rosa e gerânio',
      base: 'Âmbar, patchouli e benjoim',
    }),
  }),
  product({
    slug: 'noite-de-figo-eau-de-parfum-100ml',
    name: 'Noite de Figo Eau de Parfum 100 ml',
    brand: 'Ateliê Bella&Cheirosa',
    category: 'Perfumes Femininos',
    description:
      'Assinatura da casa: figo verde e folhas de figueira sobre um chipre suave de patchouli e rosa. Tem o frescor da fruta na saída e um fundo elegante, levemente terroso, que acompanha a noite inteira.',
    priceCents: 22990,
    compareAtPriceCents: 25990,
    costCents: 8900,
    initialStock: 10,
    featured: true,
    ...BOX_100ML,
    specs: perfumeSpecs({
      volume: '100 ml',
      concentration: 'Eau de Parfum',
      gender: 'Feminino',
      family: 'Chipre frutado',
      top: 'Figo verde e cassis',
      heart: 'Rosa, folha de figueira e jasmim',
      base: 'Patchouli, musgo e almíscar',
    }),
  }),
  product({
    slug: 'petala-clara-colonia-100ml',
    name: 'Pétala Clara Colônia 100 ml',
    brand: 'Ateliê Bella&Cheirosa',
    category: 'Perfumes Femininos',
    description:
      'Uma colônia leve de flor de laranjeira e bergamota, feita para reaplicar ao longo do dia. Limpa e solar, funciona bem depois do banho e em dias quentes.',
    priceCents: 12990,
    costCents: 4800,
    initialStock: 25,
    ...BOX_100ML,
    specs: perfumeSpecs({
      volume: '100 ml',
      concentration: 'Colônia',
      gender: 'Feminino',
      family: 'Floral cítrico',
      top: 'Bergamota e limão',
      heart: 'Flor de laranjeira e neroli',
      base: 'Almíscar branco',
    }),
  }),
  product({
    slug: 'jasmim-ao-entardecer-eau-de-toilette-75ml',
    name: 'Jasmim ao Entardecer Eau de Toilette 75 ml',
    brand: 'Ateliê Bella&Cheirosa',
    category: 'Perfumes Femininos',
    description:
      'Jasmim e tuberosa em versão arejada, com um fio de mel e madeiras claras no fundo. Um floral branco versátil, presente sem ser intenso.',
    priceCents: 15990,
    costCents: 6100,
    initialStock: 12,
    ...BOX_75ML,
    specs: perfumeSpecs({
      volume: '75 ml',
      concentration: 'Eau de Toilette',
      gender: 'Feminino',
      family: 'Floral branco',
      top: 'Mandarina e folhas verdes',
      heart: 'Jasmim, tuberosa e ylang-ylang',
      base: 'Mel, cedro e almíscar',
    }),
  }),

  // --- Perfumes Masculinos ------------------------------------------------
  product({
    slug: 'cais-norte-original-eau-de-toilette-100ml',
    name: 'Cais Norte Original Eau de Toilette 100 ml',
    brand: 'Cais Norte',
    category: 'Perfumes Masculinos',
    description:
      'A fragrância que dá nome à marca: brisa salgada, alecrim e vetiver, como uma manhã no porto. Fresco e aromático, é uma escolha fácil para o dia a dia.',
    priceCents: 19990,
    costCents: 7700,
    initialStock: 16,
    featured: true,
    ...BOX_100ML,
    specs: perfumeSpecs({
      volume: '100 ml',
      concentration: 'Eau de Toilette',
      gender: 'Masculino',
      family: 'Aromático aquático',
      top: 'Notas marinhas, limão e pimenta-rosa',
      heart: 'Alecrim, sálvia e lavanda',
      base: 'Vetiver, cedro e âmbar cinza',
    }),
  }),
  product({
    slug: 'madeira-bruta-eau-de-parfum-100ml',
    name: 'Madeira Bruta Eau de Parfum 100 ml',
    brand: 'Cais Norte',
    category: 'Perfumes Masculinos',
    description:
      'Cedro, pimenta-preta e um acorde de couro macio formam um amadeirado seco e marcante. Mais denso que os demais da linha, indicado para a noite e para climas amenos.',
    priceCents: 23990,
    costCents: 9300,
    initialStock: 9,
    ...BOX_100ML,
    specs: perfumeSpecs({
      volume: '100 ml',
      concentration: 'Eau de Parfum',
      gender: 'Masculino',
      family: 'Amadeirado especiado',
      top: 'Pimenta-preta e cardamomo',
      heart: 'Cedro, cipreste e noz-moscada',
      base: 'Couro, vetiver e fava tonka',
    }),
  }),
  product({
    slug: 'vento-leste-colonia-100ml',
    name: 'Vento Leste Colônia 100 ml',
    brand: 'Cais Norte',
    category: 'Perfumes Masculinos',
    description:
      'Limão-siciliano e lavanda em uma colônia cítrica, direta e refrescante. Ideal para depois do banho, para a academia ou para os dias mais quentes do ano.',
    priceCents: 13990,
    compareAtPriceCents: 15990,
    costCents: 5200,
    initialStock: 20,
    ...BOX_100ML,
    specs: perfumeSpecs({
      volume: '100 ml',
      concentration: 'Colônia',
      gender: 'Masculino',
      family: 'Cítrico aromático',
      top: 'Limão-siciliano e grapefruit',
      heart: 'Lavanda e hortelã',
      base: 'Almíscar e madeira de bétula',
    }),
  }),
  product({
    slug: 'tabaco-e-mel-eau-de-parfum-100ml',
    name: 'Tabaco & Mel Eau de Parfum 100 ml',
    brand: 'Ambarê',
    category: 'Perfumes Masculinos',
    description:
      'Folhas de tabaco curadas, mel e especiarias quentes em um oriental aconchegante. Encorpado e adocicado na medida, combina com noites frias e ocasiões especiais.',
    priceCents: 26990,
    costCents: 10600,
    initialStock: 7,
    ...BOX_100ML,
    specs: perfumeSpecs({
      volume: '100 ml',
      concentration: 'Eau de Parfum',
      gender: 'Masculino',
      family: 'Oriental especiado',
      top: 'Canela e cravo',
      heart: 'Folha de tabaco e mel',
      base: 'Fava tonka, baunilha e madeiras secas',
    }),
  }),
  product({
    slug: 'cedro-azul-eau-de-toilette-50ml',
    name: 'Cedro Azul Eau de Toilette 50 ml',
    brand: 'Ateliê Bella&Cheirosa',
    category: 'Perfumes Masculinos',
    description:
      'Cedro e zimbro com um toque de bergamota: um amadeirado fresco, de presença tranquila. O frasco de 50 ml é uma boa porta de entrada para a linha da casa.',
    priceCents: 14990,
    costCents: 5600,
    initialStock: 15,
    ...BOX_50ML,
    specs: perfumeSpecs({
      volume: '50 ml',
      concentration: 'Eau de Toilette',
      gender: 'Masculino',
      family: 'Amadeirado fresco',
      top: 'Bergamota e zimbro',
      heart: 'Gerânio e folhas de violeta',
      base: 'Cedro, almíscar e musgo',
    }),
  }),

  // --- Perfumes Unissex ---------------------------------------------------
  product({
    slug: 'ambare-no-1-eau-de-parfum-100ml',
    name: 'Ambarê Nº 1 Eau de Parfum 100 ml',
    brand: 'Ambarê',
    category: 'Perfumes Unissex',
    description:
      'O primeiro perfume da marca é um âmbar resinoso, quente e luminoso, com cardamomo na saída e benjoim no fundo. Fica muito próximo da pele, com um rastro suave e duradouro.',
    priceCents: 28990,
    costCents: 11400,
    initialStock: 8,
    featured: true,
    ...BOX_100ML,
    specs: perfumeSpecs({
      volume: '100 ml',
      concentration: 'Eau de Parfum',
      gender: 'Unissex',
      family: 'Ambarado',
      top: 'Cardamomo e laranja amarga',
      heart: 'Labdanum e flor de cacau',
      base: 'Benjoim, âmbar e baunilha',
    }),
  }),
  product({
    slug: 'cha-branco-eau-de-parfum-50ml',
    name: 'Chá Branco Eau de Parfum 50 ml',
    brand: 'Ambarê',
    category: 'Perfumes Unissex',
    description:
      'Uma composição verde e calma de chá branco, bergamota e almíscar. Transparente e elegante, é o tipo de perfume que combina com qualquer ocasião.',
    priceCents: 17990,
    costCents: 6900,
    initialStock: 12,
    ...BOX_50ML,
    specs: perfumeSpecs({
      volume: '50 ml',
      concentration: 'Eau de Parfum',
      gender: 'Unissex',
      family: 'Verde aromático',
      top: 'Bergamota e gengibre',
      heart: 'Chá branco e folhas de mate',
      base: 'Almíscar e madeira de cashmere',
    }),
  }),
  product({
    slug: 'terra-molhada-eau-de-parfum-100ml',
    name: 'Terra Molhada Eau de Parfum 100 ml',
    brand: 'Ambarê',
    category: 'Perfumes Unissex',
    description:
      'Evoca o cheiro da chuva sobre a terra e combina vetiver, raízes e um toque mineral. Um perfume terroso e diferente, para quem gosta de fragrâncias com personalidade.',
    priceCents: 25990,
    costCents: 10100,
    initialStock: 6,
    ...BOX_100ML,
    specs: perfumeSpecs({
      volume: '100 ml',
      concentration: 'Eau de Parfum',
      gender: 'Unissex',
      family: 'Terroso amadeirado',
      top: 'Acorde mineral e pimenta-rosa',
      heart: 'Raiz de íris e folhas úmidas',
      base: 'Vetiver, patchouli e cedro',
    }),
  }),
  product({
    slug: 'fumaca-de-incenso-extrait-de-parfum-30ml',
    name: 'Fumaça de Incenso Extrait de Parfum 30 ml',
    brand: 'Ambarê',
    category: 'Perfumes Unissex',
    description:
      'Olíbano, mirra e madeiras defumadas em concentração de extrait. Seco, contemplativo e muito concentrado: uma ou duas borrifadas bastam.',
    priceCents: 31990,
    costCents: 12800,
    // Esgotado de propósito: demonstra o estado "esgotado" na loja e no painel.
    initialStock: 0,
    ...BOX_30ML,
    specs: perfumeSpecs({
      volume: '30 ml',
      concentration: 'Extrait de Parfum',
      gender: 'Unissex',
      family: 'Resinoso',
      top: 'Pimenta-preta e elemi',
      heart: 'Olíbano e mirra',
      base: 'Madeiras defumadas e ládano',
    }),
  }),
  product({
    slug: 'linho-limpo-colonia-200ml',
    name: 'Linho Limpo Colônia 200 ml',
    brand: 'Ateliê Bella&Cheirosa',
    category: 'Perfumes Unissex',
    description:
      'Cheiro de roupa recém-lavada, com almíscar branco, flor de algodão e um toque cítrico. Uma colônia em frasco grande, feita para usar sem economizar.',
    priceCents: 11990,
    costCents: 4300,
    initialStock: 22,
    ...BOX_200ML,
    specs: perfumeSpecs({
      volume: '200 ml',
      concentration: 'Colônia',
      gender: 'Unissex',
      family: 'Almiscarado',
      top: 'Limão e aldeídos',
      heart: 'Flor de algodão e lírio-do-vale',
      base: 'Almíscar branco e âmbar claro',
    }),
  }),

  // --- Corpo e Banho ------------------------------------------------------
  product({
    slug: 'sabonete-liquido-erva-doce-250ml',
    name: 'Sabonete Líquido Erva-Doce 250 ml',
    brand: 'Ervaria',
    category: 'Corpo e Banho',
    description:
      'Sabonete líquido de espuma cremosa com aroma suave de erva-doce. Limpa sem deixar sensação de pele repuxada e pode ser usado diariamente por toda a família.',
    priceCents: 4290,
    costCents: 1500,
    initialStock: 30,
    weightGrams: 320,
    heightCm: 6,
    widthCm: 7,
    lengthCm: 19,
    specs: careSpecs({
      content: '250 ml',
      indication: 'Banho diário, todos os tipos de pele',
      fragrance: 'Erva-doce',
      highlights: 'Glicerina vegetal e extrato de erva-doce',
      usage: 'Aplique sobre a pele molhada, massageie e enxágue.',
    }),
  }),
  product({
    slug: 'oleo-de-banho-camomila-e-aveia-120ml',
    name: 'Óleo de Banho Camomila e Aveia 120 ml',
    brand: 'Ervaria',
    category: 'Corpo e Banho',
    description:
      'Óleo que se transforma em emulsão leve em contato com a água, deixando a pele macia logo após o banho. O aroma de camomila deixa o ritual mais tranquilo.',
    priceCents: 6990,
    costCents: 2600,
    initialStock: 15,
    weightGrams: 190,
    heightCm: 4,
    widthCm: 5,
    lengthCm: 15,
    specs: careSpecs({
      content: '120 ml',
      indication: 'Pele seca ou sensível ao ressecamento',
      fragrance: 'Camomila',
      highlights: 'Óleo de semente de girassol e extrato de aveia',
      usage: 'Aplique na pele molhada durante o banho e enxágue levemente.',
    }),
  }),
  product({
    slug: 'esfoliante-corporal-acucar-e-laranja-200g',
    name: 'Esfoliante Corporal Açúcar e Laranja 200 g',
    brand: 'Ervaria',
    category: 'Corpo e Banho',
    description:
      'Esfoliante de cristais de açúcar com óleo de laranja doce, para renovar a pele de corpo, cotovelos e pés. Os cristais se dissolvem com a água e deixam um toque sedoso.',
    priceCents: 5990,
    costCents: 2200,
    initialStock: 18,
    weightGrams: 280,
    heightCm: 7,
    widthCm: 9,
    lengthCm: 9,
    specs: careSpecs({
      content: '200 g',
      indication: 'Esfoliação corporal, uma a duas vezes por semana',
      fragrance: 'Laranja doce',
      highlights: 'Açúcar cristal, óleo de laranja doce e manteiga de karité',
      usage: 'Massageie sobre a pele úmida em movimentos circulares e enxágue.',
    }),
  }),
  product({
    slug: 'sais-de-banho-lavanda-300g',
    name: 'Sais de Banho Lavanda 300 g',
    brand: 'Ervaria',
    category: 'Corpo e Banho',
    description:
      'Sais grossos perfumados com lavanda, para banhos de imersão ou escalda-pés. Um jeito simples de transformar o fim do dia em pausa.',
    priceCents: 4990,
    compareAtPriceCents: 5990,
    costCents: 1700,
    initialStock: 12,
    weightGrams: 360,
    heightCm: 8,
    widthCm: 10,
    lengthCm: 10,
    specs: careSpecs({
      content: '300 g',
      indication: 'Banho de imersão e escalda-pés',
      fragrance: 'Lavanda',
      highlights: 'Sal grosso marinho e óleo essencial de lavanda',
      usage: 'Dissolva duas colheres de sopa em água morna.',
    }),
  }),
  product({
    slug: 'sabonete-em-barra-argila-rosa-3x90g',
    name: 'Sabonete em Barra Argila Rosa 3 × 90 g',
    brand: 'Ervaria',
    category: 'Corpo e Banho',
    description:
      'Trio de sabonetes em barra com argila rosa e aroma floral suave. Espuma delicada para o rosto e o corpo, em embalagem de papel sem plástico.',
    priceCents: 3990,
    costCents: 1400,
    initialStock: 26,
    weightGrams: 310,
    heightCm: 5,
    widthCm: 7,
    lengthCm: 17,
    specs: careSpecs({
      content: '3 barras de 90 g',
      indication: 'Rosto e corpo',
      fragrance: 'Floral suave',
      highlights: 'Argila rosa e base vegetal',
      usage: 'Faça espuma com água, aplique e enxágue.',
    }),
  }),
  product({
    slug: 'body-splash-flor-de-ameixa-200ml',
    name: 'Body Splash Flor de Ameixa 200 ml',
    brand: 'Rosalume',
    category: 'Corpo e Banho',
    description:
      'Versão leve e refrescante do perfume Flor de Ameixa, para borrifar no corpo e nos cabelos depois do banho. Pode ser usado sozinho ou em camadas com o Eau de Parfum.',
    priceCents: 7990,
    costCents: 2900,
    initialStock: 24,
    weightGrams: 280,
    heightCm: 5,
    widthCm: 7,
    lengthCm: 20,
    specs: careSpecs({
      content: '200 ml',
      indication: 'Corpo e cabelos',
      fragrance: 'Floral frutado (ameixa e peônia)',
      highlights: 'Fórmula leve, sem óleo',
      usage: 'Borrife sobre o corpo a cerca de 15 cm de distância.',
    }),
  }),

  // --- Hidratantes --------------------------------------------------------
  product({
    slug: 'locao-corporal-leite-de-aveia-250ml',
    name: 'Loção Corporal Leite de Aveia 250 ml',
    brand: 'Orvalha',
    category: 'Hidratantes',
    description:
      'Loção de textura fluida que absorve rápido e não deixa a pele pegajosa. O leite de aveia traz conforto para o uso diário, inclusive logo após o banho.',
    priceCents: 5490,
    costCents: 2000,
    initialStock: 28,
    weightGrams: 310,
    heightCm: 5,
    widthCm: 7,
    lengthCm: 19,
    specs: careSpecs({
      content: '250 ml',
      indication: 'Hidratação diária do corpo',
      fragrance: 'Suave de aveia',
      highlights: 'Extrato de aveia e glicerina',
      usage: 'Aplique sobre a pele limpa e seca, massageando até absorver.',
    }),
  }),
  product({
    slug: 'manteiga-corporal-karite-e-baunilha-200g',
    name: 'Manteiga Corporal Karité e Baunilha 200 g',
    brand: 'Orvalha',
    category: 'Hidratantes',
    description:
      'Textura rica e derretida, para as áreas mais ressecadas como joelhos, cotovelos e pés. O aroma de baunilha é aconchegante e discreto.',
    priceCents: 7990,
    costCents: 3000,
    initialStock: 14,
    featured: true,
    weightGrams: 270,
    heightCm: 6,
    widthCm: 9,
    lengthCm: 9,
    specs: careSpecs({
      content: '200 g',
      indication: 'Pele seca a muito seca',
      fragrance: 'Baunilha',
      highlights: 'Manteiga de karité e óleo de amêndoas',
      usage: 'Aplique uma pequena quantidade e massageie até absorver.',
    }),
  }),
  product({
    slug: 'creme-para-maos-amendoas-75g',
    name: 'Creme para Mãos Amêndoas 75 g',
    brand: 'Orvalha',
    category: 'Hidratantes',
    description:
      'Creme para mãos de toque seco, que hidrata sem deixar resíduo nos dedos. Bisnaga de bolsa, para reaplicar ao longo do dia.',
    priceCents: 3490,
    costCents: 1200,
    initialStock: 35,
    weightGrams: 100,
    heightCm: 3,
    widthCm: 5,
    lengthCm: 15,
    specs: careSpecs({
      content: '75 g',
      indication: 'Mãos e cutículas',
      fragrance: 'Amêndoas',
      highlights: 'Óleo de amêndoas doces e manteiga de cacau',
      usage: 'Aplique nas mãos sempre que sentir necessidade.',
    }),
  }),
  product({
    slug: 'creme-restaurador-para-os-pes-90g',
    name: 'Creme Restaurador para os Pés 90 g',
    brand: 'Orvalha',
    category: 'Hidratantes',
    description:
      'Creme concentrado para calcanhares e solas ressecados, com ureia e sensação refrescante de hortelã. Indicado para uso noturno, com meias de algodão.',
    priceCents: 3990,
    costCents: 1400,
    initialStock: 16,
    weightGrams: 120,
    heightCm: 3,
    widthCm: 5,
    lengthCm: 16,
    specs: careSpecs({
      content: '90 g',
      indication: 'Pés ressecados',
      fragrance: 'Hortelã',
      highlights: 'Ureia 10% e óleo de hortelã',
      usage: 'Aplique nos pés limpos e secos, de preferência à noite.',
    }),
  }),
  product({
    slug: 'hidratante-perfumado-noite-de-figo-200ml',
    name: 'Hidratante Perfumado Noite de Figo 200 ml',
    brand: 'Ateliê Bella&Cheirosa',
    category: 'Hidratantes',
    description:
      'Loção corporal com a fragrância Noite de Figo, para hidratar e perfumar ao mesmo tempo. Usada antes do perfume, ajuda a prolongar a presença da fragrância na pele.',
    priceCents: 8990,
    costCents: 3300,
    initialStock: 10,
    weightGrams: 260,
    heightCm: 5,
    widthCm: 6,
    lengthCm: 18,
    specs: careSpecs({
      content: '200 ml',
      indication: 'Hidratação diária com perfume',
      fragrance: 'Noite de Figo (chipre frutado)',
      highlights: 'Manteiga de karité e glicerina',
      usage: 'Aplique após o banho, antes do perfume.',
    }),
  }),

  // --- Kits e Presentes ---------------------------------------------------
  product({
    slug: 'kit-ritual-de-banho',
    name: 'Kit Ritual de Banho',
    brand: 'Ervaria',
    category: 'Kits e Presentes',
    description:
      'Três passos para um banho sem pressa: sabonete líquido de erva-doce, óleo de banho de camomila e sais de lavanda. Chega em caixa rígida pronta para presentear.',
    priceCents: 14990,
    compareAtPriceCents: 16270,
    costCents: 6200,
    initialStock: 8,
    ...KIT_BOX,
    kitOf: [
      'sabonete-liquido-erva-doce-250ml',
      'oleo-de-banho-camomila-e-aveia-120ml',
      'sais-de-banho-lavanda-300g',
    ],
    specs: kitSpecs(
      'Sabonete Líquido Erva-Doce 250 ml, Óleo de Banho Camomila e Aveia 120 ml, Sais de Banho Lavanda 300 g',
      'Caixa rígida com berço de papel',
      'Presente de aniversário, autocuidado',
    ),
  }),
  product({
    slug: 'kit-flor-de-ameixa',
    name: 'Kit Flor de Ameixa',
    brand: 'Rosalume',
    category: 'Kits e Presentes',
    description:
      'O Eau de Parfum Flor de Ameixa acompanhado do body splash da mesma fragrância, para usar em camadas. Um presente completo em caixa com laço de cetim.',
    priceCents: 29990,
    compareAtPriceCents: 32980,
    costCents: 13200,
    initialStock: 6,
    featured: true,
    ...KIT_BOX,
    kitOf: ['flor-de-ameixa-eau-de-parfum-100ml', 'body-splash-flor-de-ameixa-200ml'],
    specs: kitSpecs(
      'Flor de Ameixa Eau de Parfum 100 ml, Body Splash Flor de Ameixa 200 ml',
      'Caixa rígida com laço de cetim',
      'Datas especiais, presente feminino',
    ),
  }),
  product({
    slug: 'dupla-cais-norte',
    name: 'Dupla Cais Norte',
    brand: 'Cais Norte',
    category: 'Kits e Presentes',
    description:
      'Os dois frescos da marca juntos: Cais Norte Original para o dia a dia e Vento Leste para depois do banho. Caixa sóbria, pronta para presentear.',
    priceCents: 29990,
    compareAtPriceCents: 33980,
    costCents: 13400,
    initialStock: 9,
    ...KIT_BOX,
    kitOf: ['cais-norte-original-eau-de-toilette-100ml', 'vento-leste-colonia-100ml'],
    specs: kitSpecs(
      'Cais Norte Original Eau de Toilette 100 ml, Vento Leste Colônia 100 ml',
      'Caixa rígida cinza-chumbo',
      'Datas especiais, presente masculino',
    ),
  }),
  product({
    slug: 'caixa-presente-maos-e-pes',
    name: 'Caixa Presente Mãos e Pés',
    brand: 'Orvalha',
    category: 'Kits e Presentes',
    description:
      'Creme para mãos de amêndoas e creme restaurador para os pés em uma caixa compacta. Um mimo prático para quem passa o dia em movimento.',
    priceCents: 6990,
    compareAtPriceCents: 7480,
    costCents: 2900,
    initialStock: 15,
    ...KIT_BOX_SMALL,
    kitOf: ['creme-para-maos-amendoas-75g', 'creme-restaurador-para-os-pes-90g'],
    specs: kitSpecs(
      'Creme para Mãos Amêndoas 75 g, Creme Restaurador para os Pés 90 g',
      'Caixa de papel cartão',
      'Lembrança, amigo secreto',
    ),
  }),
  product({
    slug: 'colecao-descoberta-ambare-4x10ml',
    name: 'Coleção Descoberta Ambarê 4 × 10 ml',
    brand: 'Ambarê',
    category: 'Kits e Presentes',
    description:
      'Quatro miniaturas de 10 ml para conhecer a marca antes de escolher um frasco grande: Ambarê Nº 1, Chá Branco, Terra Molhada e Tabaco & Mel. Exclusiva desta caixa.',
    priceCents: 19990,
    costCents: 7200,
    initialStock: 10,
    ...KIT_BOX_SMALL,
    specs: kitSpecs(
      'Miniaturas de 10 ml: Ambarê Nº 1, Chá Branco, Terra Molhada e Tabaco & Mel (Eau de Parfum)',
      'Estojo de papel cartão com berço',
      'Presente unissex, descoberta de fragrâncias',
    ),
  }),
]
