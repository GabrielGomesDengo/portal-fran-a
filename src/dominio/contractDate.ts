// =============================================================
// Motor de shelf life × contract date. Função pura, sem dependências,
// espelhada em SQL (migration 001) para que tela e banco calculem igual.
//
// Regra (decisões de 10/11/2026):
//  - Tabela por faixa de shelf life: dias mínimos de validade restante
//    que o produto precisa ter AO CHEGAR na França.
//  - Shelf life fora da tabela: proporcional (interpolação linear entre
//    faixas vizinhas; além das pontas, o mesmo % da ponta). Arredonda
//    para cima.
//  - Data mínima de produção = chegada FR + mínimo − shelf life.
// =============================================================

import { diasEntre, somarDias, type DataLocal } from './calendario'

export type FaixaContractDate = { shelfLifeDias: number; minimoDiasChegada: number }

/** Tabela vigente (aba `contract date` da planilha de pedido). */
export const TABELA_PADRAO: FaixaContractDate[] = [
  { shelfLifeDias: 90, minimoDiasChegada: 63 },
  { shelfLifeDias: 120, minimoDiasChegada: 77 },
  { shelfLifeDias: 150, minimoDiasChegada: 91 },
  { shelfLifeDias: 180, minimoDiasChegada: 105 },
  { shelfLifeDias: 210, minimoDiasChegada: 119 },
  { shelfLifeDias: 365, minimoDiasChegada: 196 },
]

/** Dias mínimos de validade restante na chegada, para um shelf life qualquer. */
export function minimoDiasChegada(shelfLifeDias: number, tabela = TABELA_PADRAO): number | null {
  if (!shelfLifeDias || shelfLifeDias <= 0) return null
  const t = [...tabela].sort((a, b) => a.shelfLifeDias - b.shelfLifeDias)
  const exata = t.find((f) => f.shelfLifeDias === shelfLifeDias)
  if (exata) return exata.minimoDiasChegada
  const primeira = t[0], ultima = t[t.length - 1]
  if (shelfLifeDias < primeira.shelfLifeDias)
    return Math.ceil((shelfLifeDias * primeira.minimoDiasChegada) / primeira.shelfLifeDias)
  if (shelfLifeDias > ultima.shelfLifeDias)
    return Math.ceil((shelfLifeDias * ultima.minimoDiasChegada) / ultima.shelfLifeDias)
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i], b = t[i + 1]
    if (a.shelfLifeDias < shelfLifeDias && shelfLifeDias < b.shelfLifeDias) {
      const frac = (shelfLifeDias - a.shelfLifeDias) / (b.shelfLifeDias - a.shelfLifeDias)
      return Math.ceil(a.minimoDiasChegada + frac * (b.minimoDiasChegada - a.minimoDiasChegada))
    }
  }
  return null
}

/** Data em que o embarque chega na França. */
export function dataChegadaFR(dataEmbarque: DataLocal, transitDias: number): DataLocal {
  return somarDias(dataEmbarque, transitDias)
}

/** Data mínima de produção para atender o contract date (a coluna "PRODUZIR APÓS"). */
export function dataMinimaProducao(
  dataChegada: DataLocal, shelfLifeDias: number, tabela = TABELA_PADRAO,
): DataLocal | null {
  const minimo = minimoDiasChegada(shelfLifeDias, tabela)
  if (minimo === null) return null
  return somarDias(dataChegada, minimo - shelfLifeDias)
}

export function validadeDoLote(dataProducao: DataLocal, shelfLifeDias: number): DataLocal {
  return somarDias(dataProducao, shelfLifeDias)
}

export type AvaliacaoContract = {
  validade: DataLocal
  diasRestantesChegada: number
  minimoDias: number
  atende: boolean
  /** diasRestantes / mínimo (1 = no limite; >1 folga). Igual à coluna "% of contract date compliance". */
  conformidade: number
  semanasRestantes: number
}

/** Avalia um lote (data de produção) contra o contract date para uma chegada na FR. */
export function avaliarLote(
  dataProducao: DataLocal, shelfLifeDias: number, dataChegada: DataLocal, tabela = TABELA_PADRAO,
): AvaliacaoContract | null {
  const minimo = minimoDiasChegada(shelfLifeDias, tabela)
  if (minimo === null) return null
  const validade = validadeDoLote(dataProducao, shelfLifeDias)
  const dias = diasEntre(dataChegada, validade)
  return {
    validade,
    diasRestantesChegada: dias,
    minimoDias: minimo,
    atende: dias >= minimo,
    conformidade: dias / minimo,
    semanasRestantes: dias / 7,
  }
}

/** Mesma avaliação, mas partindo da validade já conhecida (lote de estoque / NF). */
export function avaliarValidade(
  validade: DataLocal, shelfLifeDias: number, dataChegada: DataLocal, tabela = TABELA_PADRAO,
): AvaliacaoContract | null {
  const minimo = minimoDiasChegada(shelfLifeDias, tabela)
  if (minimo === null) return null
  const dias = diasEntre(dataChegada, validade)
  return { validade, diasRestantesChegada: dias, minimoDias: minimo, atende: dias >= minimo, conformidade: dias / minimo, semanasRestantes: dias / 7 }
}

/**
 * Data máxima de produção: o lote desce para o estoque em D+`leadEstoqueDias` e precisa
 * estar disponível `antecedenciaEstoqueDias` antes do embarque (padrão: 1 e 7 → embarque − 8).
 */
export function dataMaximaProducao(dataEmbarque: DataLocal, leadEstoqueDias: number, antecedenciaEstoqueDias: number): DataLocal {
  return somarDias(dataEmbarque, -(leadEstoqueDias + antecedenciaEstoqueDias))
}

export type SituacaoProducao = 'ok' | 'antes_minima' | 'depois_maxima' | 'sem_regra'

/** Classifica uma data de produção contra a janela [mínima, máxima]. */
export function situacaoProducao(dataProducao: DataLocal, minima: DataLocal | null, maxima: DataLocal): SituacaoProducao {
  if (minima === null) return 'sem_regra'
  if (dataProducao < minima) return 'antes_minima'
  if (dataProducao > maxima) return 'depois_maxima'
  return 'ok'
}
