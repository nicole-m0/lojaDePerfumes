const COMBINING_MARKS = /[̀-ͯ]/g
const NON_ALNUM = /[^a-z0-9]+/g
const EDGE_HYPHENS = /^-+|-+$/g
const REPEATED_HYPHENS = /-{2,}/g

/**
 * Gera um slug URL-safe a partir de um texto em português
 * (remove acentos, troca espaços/símbolos por hífen).
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim()
    .replace(NON_ALNUM, '-')
    .replace(REPEATED_HYPHENS, '-')
    .replace(EDGE_HYPHENS, '')
}
