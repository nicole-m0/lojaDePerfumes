import type { StaticImageData } from 'next/image'
import hero from '@/assets/campaign/hero.png'
import colecoes from '@/assets/campaign/colecoes.png'
import atelie from '@/assets/campaign/atelie.png'

// Imagens institucionais da campanha (Etapa B.1).
//
// Originais geradas por IA (Canva) a partir da direção de arte da marca: frascos
// sem marca, sem logotipos de terceiros e sem texto nos rótulos. Arquivos locais
// (sem URL externa), importados estaticamente: o Next gera tamanhos responsivos,
// formatos modernos e o placeholder desfocado no build.
//
// Arquivos PNG originais do Canva, mantidos sem conversão (o Canva os entregou
// com extensão .jpg; a extensão foi corrigida para .png, conteúdo byte a byte igual).
//
// `null` = imagem ausente: a seção usa a composição só tipográfica
// (nunca um degradê ou imagem genérica no lugar).

export interface CampaignImage {
  src: StaticImageData
  alt: string
}

export interface Campaign {
  /** Destaque da home — retrato 4:5. */
  hero: CampaignImage | null
  /** Seção de coleções — retrato 4:5. */
  collections: CampaignImage | null
  /** Faixa "O ateliê" — panorâmica 2:1. */
  atelier: CampaignImage | null
}

export const CAMPAIGN: Campaign = {
  hero: {
    src: hero,
    alt: 'Frasco de perfume de vidro rosado, sem rótulo, sobre um bloco de travertino, com cetim bordô ao fundo e luz lateral suave.',
  },
  collections: {
    src: colecoes,
    alt: 'Dois frascos de perfume sem rótulo, um claro e um ameixa, sobre pedra clara, com linho e flores secas.',
  },
  atelier: {
    src: atelie,
    alt: 'Detalhe de um frasco de vidro canelado com perfume âmbar, refletindo a luz.',
  },
}
