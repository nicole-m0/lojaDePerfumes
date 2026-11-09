import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { pickFromEnvFile, readEnvFile } from './env-file'

const dir = mkdtempSync(join(tmpdir(), 'env-file-test-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    return String(e)
  }
  return ''
}

describe('readEnvFile', () => {
  it('interpreta o arquivo como o `node --env-file` (aspas, comentários, linhas em branco)', () => {
    const path = join(dir, 'a.env')
    writeFileSync(
      path,
      [
        '# comentário',
        'A="com aspas"',
        "B='simples'",
        'C=sem-aspas # comentário no fim',
        '',
        'D="x?pgbouncer=true&connection_limit=1"',
        'VAZIA=',
      ].join('\n'),
    )
    expect(readEnvFile(path)).toEqual({
      A: 'com aspas',
      B: 'simples',
      C: 'sem-aspas',
      D: 'x?pgbouncer=true&connection_limit=1',
      VAZIA: '',
    })
  })

  it('arquivo inexistente: erro sem caminho absoluto nem conteúdo', () => {
    const message = messageOf(() => readEnvFile(join(dir, 'nao-existe.env')))
    expect(message).toMatch(/não foi possível ler \.env\.local/)
    expect(message).not.toContain(dir)
  })
})

describe('pickFromEnvFile', () => {
  const keys = ['DATABASE_URL', 'DIRECT_URL'] as const

  it('aceita quando as variáveis estão no arquivo e o processo tem o mesmo valor', () => {
    const file = { DATABASE_URL: 'a', DIRECT_URL: 'b' }
    expect(pickFromEnvFile(file, { ...file }, keys)).toEqual(file)
  })

  it('recusa variável ausente no arquivo mesmo que exista no processo (preenchida pelo .env antigo)', () => {
    const message = messageOf(() =>
      pickFromEnvFile({ DIRECT_URL: 'b' }, { DIRECT_URL: 'b', DATABASE_URL: 'postgresql://antigo-SEGREDO' }, keys),
    )
    expect(message).toMatch(/DATABASE_URL não está definida no \.env\.local/)
    expect(message).not.toContain('SEGREDO')
  })

  it('recusa as duas ausentes, listando ambas', () => {
    const message = messageOf(() => pickFromEnvFile({}, {}, keys))
    expect(message).toMatch(/DATABASE_URL não está definida/)
    expect(message).toMatch(/DIRECT_URL não está definida/)
  })

  it('recusa valor vazio ou só com espaços', () => {
    expect(() => pickFromEnvFile({ DATABASE_URL: '', DIRECT_URL: 'b' }, { DATABASE_URL: '', DIRECT_URL: 'b' }, keys)).toThrow(
      /DATABASE_URL está vazia/,
    )
    expect(() =>
      pickFromEnvFile({ DATABASE_URL: 'a', DIRECT_URL: '   ' }, { DATABASE_URL: 'a', DIRECT_URL: '   ' }, keys),
    ).toThrow(/DIRECT_URL está vazia/)
  })

  it('recusa quando o processo tem outro valor (variável do sistema sobrepondo o arquivo) sem mostrar valores', () => {
    const message = messageOf(() =>
      pickFromEnvFile({ DATABASE_URL: 'a-SEGREDO1', DIRECT_URL: 'b' }, { DATABASE_URL: 'x-SEGREDO2', DIRECT_URL: 'b' }, keys),
    )
    expect(message).toMatch(/DATABASE_URL no ambiente do processo difere do \.env\.local/)
    expect(message).not.toMatch(/SEGREDO/)
  })

  it('recusa rodar fora dos scripts npm (arquivo lido, mas processo sem as variáveis)', () => {
    expect(() => pickFromEnvFile({ DATABASE_URL: 'a', DIRECT_URL: 'b' }, {}, keys)).toThrow(/difere do \.env\.local/)
  })
})
