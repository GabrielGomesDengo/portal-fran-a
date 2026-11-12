import type { LotePlano } from '../dados/plano'
import type { Pedido, PedidoItem, Produto } from '../tipos/dominio'
import { fmtData, fmtNum } from '../lib/formatos'
import type { DataLocal } from '../dominio/calendario'

/** Texto do convite: o que atendemos, o que está em avaliação, o que não atendemos e pontos importantes. */
export function resumoDoPlano(pedido: Pedido, lotes: LotePlano[], itens: PedidoItem[], produtos: Produto[], minimaDe: (sku: string) => DataLocal | null, maxima: DataLocal): string {
  const nome = (sku: string) => produtos.find((p) => p.sku === sku)?.descricao_br ?? sku
  const grupo = (at: 'sim' | 'avaliar' | 'nao') => {
    const skus = Array.from(new Set(lotes.filter((l) => l.atendimento === at).map((l) => l.sku)))
    return skus.map((sku) => {
      const ls = lotes.filter((l) => l.sku === sku && l.atendimento === at)
      const qtd = ls.reduce((a, l) => a + (l.qtd_planejada ?? 0), 0)
      const datas = ls.map((l) => l.data_producao).filter(Boolean).map((d) => fmtData(d!)).join(', ')
      const motivos = ls.map((l) => l.motivo).filter(Boolean).join('; ')
      return `• ${sku} ${nome(sku)}: ${fmtNum(qtd)}${datas ? ` (produção ${datas})` : ''}${motivos ? ` — ${motivos}` : ''}`
    })
  }
  const fora = lotes.filter((l) => l.data_producao && ((minimaDe(l.sku) && l.data_producao < minimaDe(l.sku)!) || l.data_producao > maxima))
  const pendentes = itens.filter((i) => !lotes.some((l) => l.sku === i.sku && l.atendimento))
  const linhas = [
    `Tema: apresentar o plano de produção do pedido ${pedido.numero} (embarque ${fmtData(pedido.data_embarque)}, chegada na França ${fmtData(pedido.data_chegada_fr)}).`,
    '', `Volumes que vamos atender (${grupo('sim').length} itens):`, ...(grupo('sim').length ? grupo('sim') : ['• nenhum']),
    '', `Em avaliação (${grupo('avaliar').length} itens):`, ...(grupo('avaliar').length ? grupo('avaliar') : ['• nenhum']),
    '', `Não vamos atender (${grupo('nao').length} itens):`, ...(grupo('nao').length ? grupo('nao') : ['• nenhum']),
    '', 'Pontos importantes:',
    ...(fora.length ? fora.map((l) => `• ${l.sku} ${nome(l.sku)}: data de produção ${fmtData(l.data_producao!)} fora da janela (mínima ${fmtData(minimaDe(l.sku))} / máxima ${fmtData(maxima)})`) : []),
    ...(pendentes.length ? [`• ${pendentes.length} item(ns) ainda sem definição de atendimento`] : []),
    `• Produção precisa estar no estoque até ${fmtData(maxima)} (D+1 após produzir, 7 dias antes do embarque).`,
  ]
  return linhas.join('\n')
}

/** Deep link do Teams que abre o formulário de nova reunião já preenchido. O PCP escolhe data e participantes. */
export function linkReuniaoTeams(pedido: Pedido, resumo: string): string {
  const assunto = `Plano de produção para o pedido ${pedido.numero}`
  return `https://teams.microsoft.com/l/meeting/new?subject=${encodeURIComponent(assunto)}&content=${encodeURIComponent(resumo)}`
}
