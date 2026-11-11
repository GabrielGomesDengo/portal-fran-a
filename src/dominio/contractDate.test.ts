import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { avaliarValidade, dataMinimaProducao, minimoDiasChegada } from './contractDate'

describe('minimoDiasChegada', () => {
  it('usa a tabela nas faixas exatas', () => {
    expect(minimoDiasChegada(365)).toBe(196)
    expect(minimoDiasChegada(210)).toBe(119)
    expect(minimoDiasChegada(180)).toBe(105)
    expect(minimoDiasChegada(150)).toBe(91)
    expect(minimoDiasChegada(120)).toBe(77)
    expect(minimoDiasChegada(90)).toBe(63)
  })
  it('interpola proporcionalmente fora da tabela', () => {
    expect(minimoDiasChegada(100)).toBe(68)
    expect(minimoDiasChegada(135)).toBe(84)
    expect(minimoDiasChegada(360)).toBe(194)
    expect(minimoDiasChegada(500)).toBe(269)
    expect(minimoDiasChegada(30)).toBe(21)
    expect(minimoDiasChegada(730)).toBe(392)
  })
  it('sem shelf life não há regra', () => {
    expect(minimoDiasChegada(0)).toBeNull()
  })
})

describe('dataMinimaProducao', () => {
  // Planilha SHIP 2610: embarque 02/11/2026 → "PRODUZIR APÓS" usava D1 − dias para produzir e embarcar.
  // A planilha ignorava o transit; o portal considera a chegada (embarque + 3). Com transit 0 bate com a planilha.
  it('reproduz a coluna PRODUZIR APÓS da planilha (transit 0)', () => {
    expect(dataMinimaProducao('2026-11-02', 365)).toBe('2026-05-17')
    expect(dataMinimaProducao('2026-11-02', 120)).toBe('2026-09-20')
    expect(dataMinimaProducao('2026-11-02', 90)).toBe('2026-10-06')
  })
})

describe('histórico de embarques 2026 (386 linhas reais)', () => {
  const linhas = readFileSync(new URL('../../data/seed/historico_embarques_2026.csv', import.meta.url), 'utf8')
    .trim().split(/\r?\n/).slice(1).map((l) => l.split(','))
  it('reproduz a aderência calculada na análise (97% das linhas)', () => {
    let ok = 0
    for (const l of linhas) {
      // Descrição pode ter vírgula (entre aspas), então lemos pelas pontas.
      const dataNf = l[1]
      const atende = l[l.length - 1], shelf = l[l.length - 5], vencimento = l[l.length - 7]
      const av = avaliarValidade(vencimento, Number(shelf), dataNf)!
      expect(av.atende ? 'SIM' : 'NAO').toBe(atende)
      if (av.atende) ok++
    }
    expect(linhas.length).toBe(386)
    expect(Math.round((ok / linhas.length) * 100)).toBe(97)
  })
})
