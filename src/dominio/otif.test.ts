import { describe, expect, it } from 'vitest'
import { calcularOtif } from './otif'
import { totaisPallet } from './pesos'

describe('OTIF', () => {
  it('volume, sku, shelf life e on-time', () => {
    const o = calcularOtif([
      { sku: 'A', qtdBase: 100, qtdRecebida: 100, validade: '2027-09-01', shelfLifeDias: 365, dataRecebimento: '2027-01-05' },
      { sku: 'B', qtdBase: 50, qtdRecebida: 40, validade: '2027-02-01', shelfLifeDias: 90, dataRecebimento: '2027-01-12' },
      { sku: 'C', qtdBase: 10, qtdRecebida: 20, validade: null, shelfLifeDias: 120, dataRecebimento: null },
    ], '2027-01-21', '2027-01-11', [{ shelfLifeDias: 90, minimoDiasChegada: 63 }, { shelfLifeDias: 365, minimoDiasChegada: 196 }])
    expect(o.volume).toBeCloseTo((100 + 40 + 10) / 160)   // excesso do C não conta
    expect(o.sku).toBeCloseTo(2 / 3)
    expect(o.shelfLife).toBeCloseTo(0.5)                 // B: 11 dias restantes < 63
    expect(o.onTime).toBeCloseTo(0.5)                    // B recebido depois do limite
  })
})

describe('pesos do pallet (pallet 1 do SHIP 2611)', () => {
  it('reproduz 234 kg líquido e 276,7 kg bruto', () => {
    const t = totaisPallet([
      { qtd: 240, caixas: 10, unidade: 'Unit', pesoLiqUnKg: 0.2, pesoBrutoCaixaKg: 5.16 },
      { qtd: 90, caixas: 5, unidade: 'Unit', pesoLiqUnKg: 0.2, pesoBrutoCaixaKg: 4.212 },
      { qtd: 168, caixas: 42, unidade: 'Kg', pesoLiqUnKg: 4, pesoBrutoCaixaKg: 4 },
    ], 21, 15)
    expect(t.liquido).toBeCloseTo(234)
    expect(t.brutoLinhas).toBeCloseTo(240.66)
    expect(t.bruto).toBeCloseTo(276.66)
  })
})
