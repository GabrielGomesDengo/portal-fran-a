import { useMemo, useState } from 'react'
import { mudarStatus, registrarEvento } from '../../dados/pedidos'
import { salvarPlano, type Atendimento, type LotePlano } from '../../dados/plano'
import { dataMaximaProducao, dataMinimaProducao, situacaoProducao, validadeDoLote, type FaixaContractDate } from '../../dominio/contractDate'
import { semanaISO } from '../../dominio/calendario'
import { fmtData, fmtNum } from '../../lib/formatos'
import { Erro } from '../../components/Carregando'
import type { Pedido, PedidoItem, Produto } from '../../tipos/dominio'
import { linkReuniaoTeams, resumoDoPlano } from '../../documentos/reuniaoTeams'

const ROTULO_AT: Record<Atendimento, string> = { sim: 'SIM', avaliar: 'AVALIAR', nao: 'NÃO' }
const COR_AT: Record<Atendimento, string> = { sim: 'bg-ok/15 text-ok', avaliar: 'bg-alerta/15 text-alerta', nao: 'bg-erro/15 text-erro' }

export function PainelPCP({ pedido, itens, produtos, plano, contract, leadEstoque, antecedenciaEstoque, userId, editavel, aoConcluir }: {
  pedido: Pedido; itens: PedidoItem[]; produtos: Produto[]; plano: LotePlano[]; contract: FaixaContractDate[]
  leadEstoque: number; antecedenciaEstoque: number; userId: string; editavel: boolean; aoConcluir: () => void
}) {
  const inicial = useMemo<LotePlano[]>(() => plano.length > 0 ? plano : itens.map((i) => ({
    pedido_id: pedido.id, sku: i.sku, lote_seq: 1, atendimento: null, qtd_planejada: i.qtd_aprovada ?? i.qtd_solicitada, semana_producao: null, data_producao: null, motivo: null,
  })), [plano, itens, pedido.id])
  const [lotes, setLotes] = useState<LotePlano[]>(inicial)
  const [erro, setErro] = useState<unknown>(null); const [ocupado, setOcupado] = useState(false); const [salvo, setSalvo] = useState(false)
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const maxima = dataMaximaProducao(pedido.data_embarque, leadEstoque, antecedenciaEstoque)
  const minimaDe = (sku: string) => { const p = prod(sku); return p?.shelf_life_dias ? dataMinimaProducao(pedido.data_chegada_fr, p.shelf_life_dias, contract) : null }

  function set(idx: number, campos: Partial<LotePlano>) {
    setLotes((ls) => ls.map((l, i) => {
      if (i !== idx) return l
      const n = { ...l, ...campos }
      if (campos.data_producao !== undefined) n.semana_producao = campos.data_producao ? semanaISO(campos.data_producao) : null
      return n
    }))
    setSalvo(false)
  }
  function dividir(idx: number) {
    setLotes((ls) => { const b = ls[idx]; const seq = Math.max(...ls.filter((l) => l.sku === b.sku).map((l) => l.lote_seq)) + 1
      return [...ls.slice(0, idx + 1), { ...b, id: undefined, lote_seq: seq, qtd_planejada: 0, data_producao: null, semana_producao: null }, ...ls.slice(idx + 1)] })
  }
  function remover(idx: number) { setLotes((ls) => ls.filter((_, i) => i !== idx)) }

  const concluido = pedido.status !== 'em_planejamento_pcp'
  async function salvar() {
    setErro(null); setOcupado(true)
    try {
      await salvarPlano(pedido.id, lotes)
      if (concluido) await registrarEvento(pedido.id, pedido.status, pedido.status, userId, 'Plano de produção atualizado pelo PCP')
      setSalvo(true)
    } catch (e) { setErro(e) } finally { setOcupado(false) }
  }
  async function concluir() {
    const pendentes = lotes.filter((l) => !l.atendimento || (l.atendimento !== 'nao' && !l.data_producao))
    if (pendentes.length > 0 && !window.confirm(`${pendentes.length} lote(s) sem atendimento ou sem data de produção. Concluir mesmo assim?`)) return
    setErro(null); setOcupado(true)
    try { await salvarPlano(pedido.id, lotes); await mudarStatus(pedido, 'plano_concluido', userId, null); window.open(linkReuniaoTeams(pedido, resumo), '_blank'); aoConcluir() }
    catch (e) { setErro(e) } finally { setOcupado(false) }
  }

  // Totais por item e resumo
  const porSku = useMemo(() => {
    const m = new Map<string, { aprovado: number; planejado: number; at: Set<Atendimento> }>()
    for (const i of itens) m.set(i.sku, { aprovado: i.qtd_aprovada ?? i.qtd_solicitada, planejado: 0, at: new Set() })
    for (const l of lotes) { const e = m.get(l.sku); if (!e) continue; e.planejado += l.qtd_planejada ?? 0; if (l.atendimento) e.at.add(l.atendimento) }
    return m
  }, [itens, lotes])
  const resumo = useMemo(() => resumoDoPlano(pedido, lotes, itens, produtos, minimaDe, maxima), [pedido, lotes, itens, produtos, maxima]) // eslint-disable-line react-hooks/exhaustive-deps
  const semanas = useMemo(() => Array.from(new Set(lotes.map((l) => l.semana_producao).filter((s): s is number => s !== null))).sort((a, b) => a - b), [lotes])

  return (
    <section className="cartao space-y-4 border-marca">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Plano de produção (PCP)</h2>
        <p className="text-sm text-tinta-2">Embarque {fmtData(pedido.data_embarque)} · chegada FR {fmtData(pedido.data_chegada_fr)} · <b>produzir até {fmtData(maxima)}</b> (estoque D+{leadEstoque}, {antecedenciaEstoque} dias antes do embarque)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="grade">
          <thead><tr><th>SKU</th><th>Produto</th><th>Qtd aprovada</th><th>Produzir entre</th><th>Atender?</th><th>Qtd planejada</th><th>Data produção</th><th>Sem.</th><th>Validade</th><th>Contract date</th><th>Observação PCP</th><th></th></tr></thead>
          <tbody>
            {lotes.map((l, idx) => {
              const p = prod(l.sku); const minima = minimaDe(l.sku); const tot = porSku.get(l.sku)
              const sit = l.data_producao ? situacaoProducao(l.data_producao, minima, maxima) : null
              const validade = l.data_producao && p?.shelf_life_dias ? validadeDoLote(l.data_producao, p.shelf_life_dias) : null
              const primeiro = l.lote_seq === 1 || lotes[idx - 1]?.sku !== l.sku
              return (
                <tr key={`${l.sku}-${l.lote_seq}`} className={!primeiro ? 'bg-fundo/60' : ''}>
                  <td className="font-mono">{primeiro ? l.sku : ''}{l.lote_seq > 1 && <span className="text-xs text-tinta-3"> lote {l.lote_seq}</span>}</td>
                  <td>{primeiro && <>{p?.descricao_br}<div className="text-xs text-tinta-3">shelf {p?.shelf_life_dias ?? '—'} d</div></>}</td>
                  <td>{primeiro && tot && <>{fmtNum(tot.aprovado)}{tot.planejado !== tot.aprovado && <div className={`text-xs ${tot.planejado < tot.aprovado ? 'text-erro' : 'text-alerta'}`}>planejado {fmtNum(tot.planejado)}</div>}</>}</td>
                  <td className="text-xs">{minima ? <>{fmtData(minima)}<br />até {fmtData(maxima)}</> : <span className="text-erro">sem regra</span>}</td>
                  <td>{editavel ? (
                    <select className="!py-1" value={l.atendimento ?? ''} onChange={(e) => set(idx, { atendimento: (e.target.value || null) as Atendimento | null })}>
                      <option value="">—</option><option value="sim">SIM</option><option value="avaliar">AVALIAR</option><option value="nao">NÃO</option>
                    </select>) : l.atendimento && <span className={`pill ${COR_AT[l.atendimento]}`}>{ROTULO_AT[l.atendimento]}</span>}</td>
                  <td>{editavel ? <input type="number" className="w-24 !py-1" min={0} value={l.qtd_planejada ?? ''} onChange={(e) => set(idx, { qtd_planejada: e.target.value === '' ? null : Number(e.target.value) })} /> : fmtNum(l.qtd_planejada)}</td>
                  <td>{editavel ? <input type="date" className="!py-1" value={l.data_producao ?? ''} onChange={(e) => set(idx, { data_producao: e.target.value || null })} /> : fmtData(l.data_producao)}</td>
                  <td>{l.semana_producao ?? '—'}</td>
                  <td>{validade ? fmtData(validade) : '—'}</td>
                  <td>{sit === 'ok' && <span className="pill bg-ok/15 text-ok">atende</span>}
                      {sit === 'antes_minima' && <span className="pill bg-erro/15 text-erro">não atende: produzir após {fmtData(minima)}</span>}
                      {sit === 'depois_maxima' && <span className="pill bg-erro/15 text-erro">não chega ao estoque a tempo</span>}
                      {sit === 'sem_regra' && <span className="pill bg-alerta/15 text-alerta">sem shelf life</span>}</td>
                  <td>{editavel ? <input className="w-44 !py-1" value={l.motivo ?? ''} onChange={(e) => set(idx, { motivo: e.target.value || null })} placeholder="ex.: solicitar da Rodoluki" /> : l.motivo}</td>
                  <td className="whitespace-nowrap text-xs">{editavel && <><button className="underline" onClick={() => dividir(idx)}>+ lote</button>{l.lote_seq > 1 && <> · <button className="text-erro underline" onClick={() => remover(idx)}>remover</button></>}</>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {semanas.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer font-semibold">Programa semanal ({semanas.length} semanas)</summary>
          <div className="mt-2 overflow-x-auto"><table className="grade">
            <thead><tr><th>SKU</th><th>Produto</th><th>Demanda</th><th>Programado</th>{semanas.map((s) => <th key={s}>S{s}</th>)}</tr></thead>
            <tbody>{itens.map((i) => { const t = porSku.get(i.sku)!; return (
              <tr key={i.sku}><td className="font-mono">{i.sku}</td><td>{prod(i.sku)?.descricao_br}</td><td>{fmtNum(t.aprovado)}</td><td className={t.planejado < t.aprovado ? 'text-erro' : ''}>{fmtNum(t.planejado)}</td>
                {semanas.map((s) => <td key={s}>{fmtNum(lotes.filter((l) => l.sku === i.sku && l.semana_producao === s).reduce((a, l) => a + (l.qtd_planejada ?? 0), 0)) || ''}</td>)}</tr>) })}</tbody>
          </table></div>
        </details>
      )}

      <div className="rounded-md bg-fundo p-3 text-sm whitespace-pre-line">{resumo}</div>
      {erro ? <Erro erro={erro} /> : null}
      {editavel && (
        <div className="flex flex-wrap items-center gap-2">
          {concluido ? <>
            <button className="btn-primario" disabled={ocupado} onClick={salvar}>Salvar alterações do plano</button>
            <a className="btn-secundario" href={linkReuniaoTeams(pedido, resumo)} target="_blank" rel="noreferrer">Abrir convite da reunião no Teams</a>
            <span className="text-xs text-tinta-3">Plano concluído: a produção pode mudar, então o PCP segue atualizando. Cada salvamento fica no histórico.</span>
          </> : <>
            <button className="btn-secundario" disabled={ocupado} onClick={salvar}>Salvar rascunho</button>
            <button className="btn-primario" disabled={ocupado} onClick={concluir}>Concluir plano e agendar reunião no Teams</button>
          </>}
          {salvo && <span className="text-sm text-ok">Salvo.</span>}
        </div>
      )}
      {!editavel && <a className="btn-secundario" href={linkReuniaoTeams(pedido, resumo)} target="_blank" rel="noreferrer">Abrir convite da reunião no Teams</a>}
    </section>
  )
}
