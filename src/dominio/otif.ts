// =============================================================
// OTIF do pedido. Funções puras; base de comparação = plano do PCP
// (o que foi prometido) ou pedido aprovado, à escolha de quem lê.
// =============================================================
import { avaliarValidade, type FaixaContractDate } from './contractDate'
import type { DataLocal } from './calendario'

export type LinhaOtif = {
  sku: string
  qtdBase: number            // planejado (ou aprovado)
  qtdRecebida: number
  validade: DataLocal | null
  shelfLifeDias: number | null
  dataRecebimento: DataLocal | null
}

export type Otif = {
  volume: number | null      // Σ recebido / Σ base (limitado a 1 por SKU)
  sku: number | null         // SKUs com recebido ≥ base / SKUs com base > 0
  shelfLife: number | null   // lotes recebidos que atendem o contract date na chegada / lotes recebidos
  onTime: number | null      // lotes recebidos até a data-limite de estoque / lotes recebidos
  linhas: number
}

export function calcularOtif(linhas: LinhaOtif[], dataChegadaFR: DataLocal, dataLimiteEstoque: DataLocal, tabela: FaixaContractDate[]): Otif {
  const porSku = new Map<string, { base: number; rec: number }>()
  for (const l of linhas) {
    const e = porSku.get(l.sku) ?? { base: 0, rec: 0 }
    e.base += l.qtdBase; e.rec += l.qtdRecebida; porSku.set(l.sku, e)
  }
  const skus = [...porSku.values()].filter((e) => e.base > 0)
  const baseTotal = skus.reduce((s, e) => s + e.base, 0)
  const recTotal = skus.reduce((s, e) => s + Math.min(e.rec, e.base), 0)
  const recebidos = linhas.filter((l) => l.qtdRecebida > 0)
  const comValidade = recebidos.filter((l) => l.validade && l.shelfLifeDias)
  const atendem = comValidade.filter((l) => avaliarValidade(l.validade!, l.shelfLifeDias!, dataChegadaFR, tabela)?.atende).length
  const comData = recebidos.filter((l) => l.dataRecebimento)
  const noPrazo = comData.filter((l) => l.dataRecebimento! <= dataLimiteEstoque).length
  return {
    volume: baseTotal > 0 ? recTotal / baseTotal : null,
    sku: skus.length > 0 ? skus.filter((e) => e.rec >= e.base).length / skus.length : null,
    shelfLife: comValidade.length > 0 ? atendem / comValidade.length : null,
    onTime: comData.length > 0 ? noPrazo / comData.length : null,
    linhas: linhas.length,
  }
}
