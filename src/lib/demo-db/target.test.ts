import { describe, expect, it } from 'vitest'
import { DEMO_SUPABASE_PROJECT_REF } from './connection'
import { resolveDemoAdminVars, resolveDemoConnection } from './target'

const REF = DEMO_SUPABASE_PROJECT_REF
const HOST = 'aws-0-sa-east-1.pooler.supabase.com'
const DATABASE_URL = `postgresql://postgres.${REF}:pw@${HOST}:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require`
const DIRECT_URL = `postgresql://postgres.${REF}:pw@${HOST}:5432/postgres?sslmode=require`
const LEGACY = 'postgresql://postgres:pw@altaria.proxy.rlwy.net:12345/railway'

describe('resolveDemoConnection', () => {
  it('devolve as duas URLs do .env.local quando válidas', () => {
    const file = { DATABASE_URL, DIRECT_URL }
    expect(resolveDemoConnection(file, { ...file })).toEqual({ databaseUrl: DATABASE_URL, directUrl: DIRECT_URL })
  })

  it('sem DIRECT_URL: recusa (não há fallback para a DATABASE_URL)', () => {
    expect(() => resolveDemoConnection({ DATABASE_URL }, { DATABASE_URL })).toThrow(/DIRECT_URL não está definida/)
  })

  it('sem DATABASE_URL no arquivo: recusa mesmo com a URL antiga preenchida pelo .env', () => {
    expect(() => resolveDemoConnection({ DIRECT_URL }, { DIRECT_URL, DATABASE_URL: LEGACY })).toThrow(
      /DATABASE_URL não está definida/,
    )
  })

  it('URLs do arquivo apontando para o Railway: recusa', () => {
    const file = { DATABASE_URL: LEGACY, DIRECT_URL: LEGACY }
    expect(() => resolveDemoConnection(file, { ...file })).toThrow(/Railway/)
  })

  it('pares trocados (Session na DATABASE_URL, Transaction na DIRECT_URL): recusa', () => {
    const file = { DATABASE_URL: DIRECT_URL, DIRECT_URL: DATABASE_URL }
    expect(() => resolveDemoConnection(file, { ...file })).toThrow(/porta deve ser 6543/)
  })
})

describe('resolveDemoAdminVars (mesma regra das URLs)', () => {
  const ADMIN = { ADMIN_EMAIL: 'demo@bella.example', ADMIN_PASSWORD: 'senha-forte-123' }

  it('usa os valores do .env.local', () => {
    const file = { ...ADMIN, ADMIN_NAME: 'Demo' }
    expect(resolveDemoAdminVars(file, { ...file })).toEqual(file)
  })

  it('ADMIN_NAME ausente no arquivo: o valor do processo (.env antigo) é ignorado', () => {
    expect(resolveDemoAdminVars(ADMIN, { ...ADMIN, ADMIN_NAME: 'Admin Antigo' })).toEqual(ADMIN)
  })

  it('obrigatórias ausentes no arquivo: recusa mesmo com valores no processo (.env antigo)', () => {
    expect(() => resolveDemoAdminVars({}, { ...ADMIN })).toThrow(/ADMIN_EMAIL não está definida[\s\S]*ADMIN_PASSWORD não está definida/)
  })

  it('valor do processo diferente do arquivo: recusa, sem mostrar valores', () => {
    let message = ''
    try {
      resolveDemoAdminVars({ ...ADMIN }, { ...ADMIN, ADMIN_PASSWORD: 'senha-ANTIGA-SENTINELA' })
    } catch (e) {
      message = String(e)
    }
    expect(message).toMatch(/ADMIN_PASSWORD no ambiente do processo difere/)
    expect(message).not.toMatch(/SENTINELA|senha-forte/)
  })

  it('ADMIN_NAME presente no arquivo segue a regra (vazio ou divergente → recusa)', () => {
    expect(() => resolveDemoAdminVars({ ...ADMIN, ADMIN_NAME: ' ' }, { ...ADMIN, ADMIN_NAME: ' ' })).toThrow(/ADMIN_NAME está vazia/)
    expect(() => resolveDemoAdminVars({ ...ADMIN, ADMIN_NAME: 'A' }, { ...ADMIN, ADMIN_NAME: 'B' })).toThrow(/ADMIN_NAME no ambiente/)
  })
})
