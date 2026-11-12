import { useMemo, useState } from 'react'
import { mudarStatus, registrarEvento } from '../../dados/pedidos'
import { salvarRecebimentos, type Recebimento } from '../../dados/operacoes'
import type { LotePlano } from '../../dados/plano'
import { calcularOtif } from '../../dominio/otif'
import { avaliarValidade, dataMaximaProducao, validadeDoLote, type FaixaContractDate } from '../../dominio/contractDate'
import { somarDias } from '../../dominio/calendario'
import { fmtData, fmtNum, hoje } from '../../lib/formatos'
import { Erro } from '../../components/Carregando'
import type { Pedido, PedidoItem, Produto } from '../../tipos/dominio'

export function PainelRecebimento({ pedido, itens, produtos, plano, recebimentos, contract, leadEstoque, antecedenciaEstoque, userId, editavel, aoConcluir }: {
  pedido: Pedido; itens: PedidoItem[]; produtos: Produto[]; plano: LotePlano[]; recebimentos: Recebimento[]; contract: FaixaContractDate[]
  leadEstoque: number; antecedenciaEstoque: number; userId: string; editavel: boolean; aoConcluir: () => void
}) {
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const inicial = useMemo<Recebimento[]>(() => recebimentos.length > 0 ? recebimentos : plano.filter((l) => l.atendimento !== 'nao').map((l) => ({
    pedido_id: pedido.id, plano_id: l.id ?? null, sku: l.sku, lote: null, qtd_planejada: l.qtd_planejada, qtd_recebida: 0,
    data_fabricacao: l.data_producao, validade: l.data_producao && prod(l.sku)?.shelf_life_dias ? validadeDoLote(l.data_producao, prod(l.sku)!.shelf_life_dias!) : null,
    data_recebimento: hoje(), confirmado: false,
  })), [recebimentos, plano, pedido.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [linhas, setLinhas] = useState<Recebimento[]>(inicial)
  const [base, setBase] = useState<'plano' | 'pedido'>('plano')
  const [erro, setErro] = useState<unknown>(null); const [ocupado, setOcupado] = useState(false); const [salvo, setSalvo] = useState(false)
  const limiteEstoque = somarDias(pedido.data_embarque, -antecedenciaEstoque)
  const maxima = dataMaximaProducao(pedido.data_embarque, leadEstoque, antecedenciaEstoque)

  function set(idx: number, campos: Partial<Recebimento>) {
    setLinhas((ls) => ls.map((l, i) => {
      if (i !== idx) return l
      const n = { ...l, ...campos }
      if (campos.data_fabricacao !== undefined) { const sl = prod(l.sku)?.shelf_life_dias; n.validade = campos.data_fabricacao && sl ? validadeDoLote(campos.data_fabricacao, sl) : null }
      return n
    })); setSalvo(false)
  }
  function adicionar(sku: string) { setLinhas((ls) => [...ls, { pedido_id: pedido.id, plano_id: null, sku, lote: null, qtd_planejada: 0, qtd_recebida: 0, data_fabricacao: null, validade: null, data_recebimento: hoje(), confirmado: false }]) }
  function remover(idx: number) { setLinhas((ls) => ls.filter((_, i) => i !== idx)) }

  const otif = useMemo(() => {
    const aprov = new Map(itens.map((i) => [i.sku, i.qtd_aprovada ?? i.qtd_solicitada]))
    const porSkuPlano = new Map<string, number>(); for (const l of linhas) porSkuPlano.set(l.sku, (porSkuPlano.get(l.sku) ?? 0) + (l.qtd_planejada ?? 0))
    const li = linhas.map((l, i) => ({
      sku: l.sku,
      // base por SKU distribuída na primeira linha do SKU para não duplicar
      qtdBase: base === 'plano' ? (l.qtd_planejada ?? 0) : (linhas.findIndex((x) => x.sku === l.sku) === i ? (aprov.get(l.sku) ?? 0) : 0),
      qtdRecebida: l.qtd_recebida, validade: l.validade, shelfLifeDias: prod(l.sku)?.shelf_life_dias ?? null, dataRecebimento: l.qtd_recebida > 0 ? l.data_recebimento : null,
    }))
    return calcularOtif(li, pedido.data_chegada_fr, limiteEstoque, contract)
  }, [linhas, itens, base, pedido.data_chegada_fr, limiteEstoque, contract]) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar(concluirRecebimento = false) {
    setErro(null); setOcupado(true)
    try {
      if (concluirRecebimento && linhas.every((l) => l.qtd_recebida <= 0)) throw new Error('Informe pelo menos um lote recebido antes de concluir.')
      await salvarRecebimentos(pedido.id, linhas, userId)
      let atual = pedido
      if (atual.status === 'plano_concluido') { await mudarStatus(atual, 'em_recebimento', userId, null); atual = { ...atual, status: 'em_recebimento' } }
      else await registrarEvento(pedido.id, pedido.status, pedido.status, userId, 'Recebimento atualizado')
      if (concluirRecebimento && atual.status === 'em_recebimento') await mudarStatus(atual, 'packing_list', userId, 'Recebimento concluído')
      setSalvo(true); aoConcluir()
    } catch (e) { setErro(e) } finally { setOcupado(false) }
  }
  const nadaRecebido = linhas.every((l) => l.qtd_recebida <= 0)
  const pct = (v: number | null) => (v === null || nadaRecebido ? '—' : `${Math.round(v * 100)}%`)
  const cor = (v: number | null) => (v === null || nadaRecebido ? '' : v >= 0.95 ? 'text-ok' : v >= 0.8 ? 'text-alerta' : 'text-erro')
  const naoConfirmadas = linhas.filter((l) => l.qtd_recebida > 0 && !l.confirmado).length

  return (
    <section className="cartao space-y-4 border-marca">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Recebimento (Operações)</h2>
        <p className="text-sm text-tinta-2">Itens precisam estar no estoque até <b>{fmtData(limiteEstoque)}</b> (produção até {fmtData(maxima)})</p>
      </div>
      <p className="text-xs text-tinta-3">Confira cada lote que desceu da produção: <b>lote, data de fabricação e quantidade</b> vêm do plano do PCP, mas precisam ser confirmados ou corrigidos pela Operação. Produção não registrada no plano entra com "+ lote extra".</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['OTIF volume', otif.volume], ['OTIF SKU', otif.sku], ['OTIF shelf life', otif.shelfLife], ['On-time (no estoque até o limite)', otif.onTime]].map(([r, v]) => (
          <div key={r as string} className="rounded-lg bg-fundo p-3"><div className="rotulo">{r as string}</div><div className={`text-2xl font-semibold ${cor(v as number | null)}`}>{pct(v as number | null)}</div></div>
        ))}
      </div>
      <label className="text-xs text-tinta-3">Base de comparação: <select className="!py-0.5 text-xs" value={base} onChange={(e) => setBase(e.target.value as 'plano' | 'pedido')}><option value="plano">plano do PCP</option><option value="pedido">pedido aprovado</option></select></label>
      <div className="overflow-x-auto">
        <table className="grade">
          <thead><tr><th>SKU</th><th>Produto</th><th>Planejado</th><th>Lote</th><th>Fabricação</th><th>Validade</th><th>Contract date</th><th>Qtd recebida</th><th>Data receb.</th><th>Confirmado</th><th></th></tr></thead>
          <tbody>
            {linhas.map((l, idx) => {
              const p = prod(l.sku); const av = l.validade && p?.shelf_life_dias ? avaliarValidade(l.validade, p.shelf_life_dias, pedido.data_chegada_fr, contract) : null
              const dif = (l.qtd_planejada ?? 0) !== l.qtd_recebida && l.qtd_recebida > 0
              return (
                <tr key={idx} className={l.confirmado ? '' : 'bg-marca/5'}>
                  <td className="font-mono">{l.sku}{!l.plano_id && <span className="pill ml-1 bg-alerta/15 text-alerta">extra</span>}</td>
                  <td>{p?.descricao_br}</td>
                  <td>{fmtNum(l.qtd_planejada)}</td>
                  <td>{editavel ? <input className="w-24 !py-1" value={l.lote ?? ''} onChange={(e) => set(idx, { lote: e.target.value || null })} placeholder="lote" /> : l.lote}</td>
                  <td>{editavel ? <input type="date" className="!py-1" value={l.data_fabricacao ?? ''} onChange={(e) => set(idx, { data_fabricacao: e.target.value || null })} /> : fmtData(l.data_fabricacao)}</td>
                  <td>{fmtData(l.validade)}</td>
                  <td>{av ? <span className={`pill ${av.atende ? 'bg-ok/15 text-ok' : 'bg-erro/15 text-erro'}`}>{av.atende ? 'atende' : `não atende (${Math.round(av.conformidade * 100)}%)`}</span> : '—'}</td>
                  <td>{editavel ? <input type="number" className={`w-24 !py-1 ${dif ? 'border-alerta' : ''}`} min={0} value={l.qtd_recebida} onChange={(e) => set(idx, { qtd_recebida: Number(e.target.value) })} /> : fmtNum(l.qtd_recebida)}{dif && <div className="text-xs text-alerta">≠ plano</div>}</td>
                  <td>{editavel ? <input type="date" className="!py-1" value={l.data_recebimento} onChange={(e) => set(idx, { data_recebimento: e.target.value })} /> : fmtData(l.data_recebimento)}</td>
                  <td className="text-center">{editavel ? <input type="checkbox" checked={l.confirmado} disabled={!l.lote || !l.data_fabricacao} title={!l.lote || !l.data_fabricacao ? 'Preencha lote e fabricação' : ''} onChange={(e) => set(idx, { confirmado: e.target.checked })} /> : (l.confirmado ? '✓' : '')}</td>
                  <td>{editavel && !l.plano_id && <button className="text-xs text-erro underline" onClick={() => remover(idx)}>remover</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editavel && (
        <div className="flex flex-wrap items-end gap-2">
          <label><span className="rotulo">+ lote extra (produção fora do plano)</span>
            <select className="mt-1 !py-1" value="" onChange={(e) => e.target.value && adicionar(e.target.value)}>
              <option value="">— produto —</option>{itens.map((i) => <option key={i.sku} value={i.sku}>{i.sku} · {prod(i.sku)?.descricao_br}</option>)}
            </select></label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {naoConfirmadas > 0 && <span className="text-xs text-alerta">{naoConfirmadas} lote(s) recebido(s) sem confirmação</span>}
            <button className="btn-secundario" disabled={ocupado} onClick={() => salvar(false)}>Salvar recebimento (parcial)</button>
            {['plano_concluido', 'em_recebimento'].includes(pedido.status) && <button className="btn-primario" disabled={ocupado || naoConfirmadas > 0} title={naoConfirmadas > 0 ? 'Confirme todos os lotes recebidos' : ''} onClick={() => salvar(true)}>Concluir recebimento → packing list</button>}
            {salvo && <span className="text-sm text-ok">Salvo.</span>}
          </div>
        </div>
      )}
      {erro ? <Erro erro={erro} /> : null}
    </section>
  )
}
