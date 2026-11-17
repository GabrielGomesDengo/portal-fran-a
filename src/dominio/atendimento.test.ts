import { describe, expect, it } from 'vitest'
import { consolidar, linhasAtendimento, resumirAtendimento } from './atendimento'

const base = {
  itens: [
    { sku: 'A', qtd_solicitada: 100, qtd_aprovada: 90, preco_eur: 2 },
    { sku: 'B', qtd_solicitada: 50, qtd_aprovada: 50, preco_eur: 10 },
    { sku: 'C', qtd_solicitada: 20, qtd_aprovada: 20, preco_eur: 1 },
  ],
  plano: [{ sku: 'A', atendimento: 'sim', qtd_planejada: 90 }, { sku: 'B', atendimento: 'sim', qtd_planejada: 50 }, { sku: 'C', atendimento: 'nao', qtd_planejada: 20 }],
  recebimentos: [{ sku: 'A', qtd_recebida: 90 }, { sku: 'B', qtd_recebida: 60 }],
}

describe('pedido × atendido em nota', () => {
  it('usa a nota quando existe e classifica cada linha', () => {
    const l = linhasAtendimento({ ...base, faturado: [{ sku: 'A', qtd: 90, preco_eur: 2 }, { sku: 'B', qtd: 50, preco_eur: 10 }, { sku: 'D', qtd: 5, preco_eur: 3 }] })
    const por = Object.fromEntries(l.map((x) => [x.sku, x]))
    expect(por.A.situacao).toBe('parcial'); expect(por.A.pct).toBeCloseTo(0.9); expect(por.A.planejado).toBe(90)
    expect(por.B.situacao).toBe('total'); expect(por.B.recebido).toBe(60)
    expect(por.C.situacao).toBe('nao_atendido'); expect(por.C.planejado).toBe(0)
    expect(por.D.situacao).toBe('incluido')
    const r = resumirAtendimento(l)
    expect(r.fillRateVolume).toBeCloseTo(140 / 170)
    expect(r.fillRateSku).toBeCloseTo(1 / 3)
    expect(r.fillRateValor).toBeCloseTo((180 + 500) / (200 + 500 + 20))
    expect(r.skusIncluidos).toBe(1)
  })
  it('sem nota usa o estoque como prévia; sem nada fica pendente', () => {
    const prev = linhasAtendimento({ ...base, faturado: null })
    expect(prev[0].fonte).toBe('estoque')
    expect(prev.find((l) => l.sku === 'C')!.situacao).toBe('andamento')
    const p = resumirAtendimento(linhasAtendimento({ ...base, recebimentos: [], faturado: null }))
    expect(p.fonte).toBe('pendente'); expect(p.fillRateVolume).toBeNull()
  })
  it('consolida ponderando por volume', () => {
    const r1 = resumirAtendimento(linhasAtendimento({ ...base, faturado: [{ sku: 'A', qtd: 100, preco_eur: 2 }, { sku: 'B', qtd: 50, preco_eur: 10 }, { sku: 'C', qtd: 20, preco_eur: 1 }] }))
    const r2 = resumirAtendimento(linhasAtendimento({ itens: [{ sku: 'X', qtd_solicitada: 30, qtd_aprovada: null, preco_eur: 1 }], plano: [], recebimentos: [], faturado: [] }))
    const c = consolidar([r1, r2])
    expect(c.fillRateVolume).toBeCloseTo(170 / 200)
  })
})
