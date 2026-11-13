import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { carregarPedido, listarAlteracoes, listarEventos, mudarStatus, type Alteracao } from '../../dados/pedidos'
import { listarProdutos } from '../../dados/produtos'
import { carregarTabelaContract } from '../../dados/contractDate'
import { Carregando, Erro } from '../../components/Carregando'
import { LinhaDoTempo } from '../../components/LinhaDoTempo'
import { fmtData, fmtEur, fmtNum } from '../../lib/formatos'
import { exportarPedidoExcel } from '../../documentos/exportarPedido'
import { PainelSupply } from './PainelSupply'
import { PainelFranca } from './PainelFranca'
import { PainelPCP } from './PainelPCP'
import { PainelRecebimento } from './PainelRecebimento'
import { PainelPackingList } from './PainelPackingList'
import { PainelInvoice } from './PainelInvoice'
import { carregarInvoice, carregarPackingList, listarRecebimentos, type CreditNote, type Invoice, type InvoiceLinha, type PackingList, type Pallet, type Recebimento } from '../../dados/operacoes'
import { listarPlano, type LotePlano } from '../../dados/plano'
import { carregarParametros, numero } from '../../dados/parametros'
import type { FaixaContractDate } from '../../dominio/contractDate'
import { ROTULO_STATUS, type Pedido as TPedido, type PedidoItem, type Produto, type StatusPedido } from '../../tipos/dominio'

type Evento = { para_status: StatusPedido; motivo: string | null; criado_em: string }
type Dados = { pedido: TPedido; itens: PedidoItem[]; produtos: Produto[]; eventos: Evento[]; alteracoes: Alteracao[]; contract: FaixaContractDate[]; plano: LotePlano[]; leadEstoque: number; antecedenciaEstoque: number
  recebimentos: Recebimento[]; packing: { pl: PackingList; pallets: Pallet[] } | null; invoice: { invoice: Invoice; linhas: InvoiceLinha[]; creditNotes: CreditNote[] } | null; params: Record<string, string> }

export function Pedido() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const { user, perfil } = useAuth()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(() => {
    if (!id) return
    Promise.all([carregarPedido(id), listarProdutos(), listarEventos(id), listarAlteracoes(id), carregarTabelaContract(), listarPlano(id), carregarParametros(), listarRecebimentos(id), carregarPackingList(id), carregarInvoice(id)])
      .then(([d, produtos, eventos, alteracoes, c, plano, params, recebimentos, packing, invoice]) => setDados({ ...d, produtos, eventos: eventos as Evento[], alteracoes, contract: c.tabela, plano,
        leadEstoque: numero(params, 'lead_time_estoque_dias', 1), antecedenciaEstoque: numero(params, 'antecedencia_estoque_dias', 7), recebimentos, packing, invoice, params }))
      .catch(setErro)
  }, [id])
  useEffect(carregar, [carregar])

  if (erro) return <Erro erro={erro} />
  if (!dados || !user || !perfil) return <Carregando />
  const { pedido, itens, produtos, eventos, alteracoes, contract, plano, leadEstoque, antecedenciaEstoque, recebimentos, packing, invoice, params } = dados
  const ehOps = perfil.perfil === 'operacoes' || perfil.perfil === 'admin'
  const emOps = ['plano_concluido', 'em_recebimento', 'packing_list', 'invoice_gerada', 'concluido'].includes(pedido.status)
  const chave = `${pedido.status}-${pedido.atualizado_em}-${eventos.length}`
  const ehPCP = perfil.perfil === 'pcp' || perfil.perfil === 'admin'
  const depoisDoPlano = ['plano_concluido', 'em_recebimento', 'packing_list', 'invoice_gerada', 'concluido'].includes(pedido.status)
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const qtdFinal = (i: PedidoItem) => i.qtd_aprovada ?? i.qtd_solicitada
  const total = itens.reduce((s, i) => s + (i.preco_eur ?? prod(i.sku)?.preco_interco_eur ?? 0) * qtdFinal(i), 0)
  const ehSupply = perfil.perfil === 'supply' || perfil.perfil === 'admin'
  const ehFranca = perfil.perfil === 'franca' || perfil.perfil === 'admin'
  const emValidacao = pedido.status === 'enviado' || pedido.status === 'em_validacao_supply'
  const motivoRecusa = [...eventos].reverse().find((e) => e.para_status === 'recusado_supply')?.motivo ?? null

  const ehAdmin = perfil.perfil === 'admin'
  const podeReabrir = ehAdmin && (pedido.status === 'aprovado' || pedido.status === 'em_planejamento_pcp' || pedido.status === 'plano_concluido')
  async function reabrir(para: 'em_validacao_supply' | 'recusado_supply') {
    const motivo = window.prompt(para === 'recusado_supply' ? 'Motivo da reprovação (obrigatório):' : 'Motivo para reabrir a validação (obrigatório):')
    if (!motivo || !motivo.trim()) return
    setOcupado(true); try { await mudarStatus(pedido, para, user!.id, motivo.trim()); carregar() } catch (e) { setErro(e) } finally { setOcupado(false) }
  }
  async function iniciarPlano() {
    setOcupado(true); try { await mudarStatus(pedido, 'em_planejamento_pcp', user!.id); carregar() } catch (e) { setErro(e) } finally { setOcupado(false) }
  }
  async function iniciarValidacao() {
    setOcupado(true); try { await mudarStatus(pedido, 'em_validacao_supply', user!.id); carregar() } catch (e) { setErro(e) } finally { setOcupado(false) }
  }

  return (
    <div className="space-y-4">
      {sp.get('novo') && <p className="rounded-md bg-ok/10 p-3 text-sm text-ok">Pedido enviado para a Dengo Brasil. O time de Supply vai validar e você será avisado.</p>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pedido {pedido.numero}</h1>
          <p className="text-sm text-tinta-2">Embarque {fmtData(pedido.data_embarque)} · chegada FR {fmtData(pedido.data_chegada_fr)}{pedido.po_franca ? ` · PO ${pedido.po_franca}` : ''}</p>
        </div>
        <button className="btn-secundario" onClick={() => exportarPedidoExcel({ ...dados, recebimentos, packing, invoice })}>⬇ Baixar em Excel</button>
      </div>
      <LinhaDoTempo status={pedido.status} />

      {ehSupply && pedido.status === 'enviado' && (
        <div className="cartao flex items-center justify-between gap-3 border-marca">
          <p className="text-sm">Pedido novo da França aguardando validação.</p>
          <button className="btn-primario" disabled={ocupado} onClick={iniciarValidacao}>Iniciar validação</button>
        </div>
      )}
      {podeReabrir && (
        <div className="cartao flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">Pedido já aprovado. Como Admin, você pode reabrir a validação para editar, ou reprovar.</p>
          <div className="flex gap-2">
            <button className="btn-secundario" disabled={ocupado} onClick={() => reabrir('em_validacao_supply')}>Reabrir validação e editar</button>
            <button className="btn-perigo" disabled={ocupado} onClick={() => reabrir('recusado_supply')}>Reprovar pedido</button>
          </div>
        </div>
      )}
      {ehSupply && pedido.status === 'em_validacao_supply' && (
        <PainelSupply key={pedido.atualizado_em} pedido={pedido} itens={itens} produtos={produtos} contract={contract} userId={user.id} aoConcluir={carregar} />
      )}
      {ehPCP && pedido.status === 'aprovado' && (
        <div className="cartao flex items-center justify-between gap-3 border-marca">
          <p className="text-sm">Pedido aprovado. O PCP pode montar o plano de produção.</p>
          <button className="btn-primario" disabled={ocupado} onClick={iniciarPlano}>Iniciar plano de produção</button>
        </div>
      )}
      {(pedido.status === 'em_planejamento_pcp' || depoisDoPlano) && (
        <PainelPCP key={`pcp-${chave}`} pedido={pedido} itens={itens} produtos={produtos} plano={plano} contract={contract}
          leadEstoque={leadEstoque} antecedenciaEstoque={antecedenciaEstoque} userId={user.id} editavel={ehPCP && ['em_planejamento_pcp', 'plano_concluido', 'em_recebimento'].includes(pedido.status)} aoConcluir={carregar} />
      )}
      {emOps && (ehOps || recebimentos.length > 0) && (
        <PainelRecebimento key={`rec-${chave}`} pedido={pedido} itens={itens} produtos={produtos} plano={plano} recebimentos={recebimentos} contract={contract}
          leadEstoque={leadEstoque} antecedenciaEstoque={antecedenciaEstoque} userId={user.id} editavel={ehOps && ['plano_concluido', 'em_recebimento', 'packing_list', 'invoice_gerada'].includes(pedido.status)} aoConcluir={carregar} />
      )}
      {['packing_list', 'invoice_gerada', 'concluido'].includes(pedido.status) && (
        <PainelPackingList key={`pl-${chave}`} pedido={pedido} produtos={produtos} recebimentos={recebimentos} inicial={packing}
          dimensoesPadrao={params.dimensoes_pallet ?? '1,00 X 1,20 X 1,10'} taraPallet={numero(params, 'tara_pallet_kg', 15)} taraMasterBox={numero(params, 'tara_master_box_kg', 21)}
          userId={user.id} editavel={ehOps && pedido.status !== 'concluido'} aoConcluir={carregar} />
      )}
      {['invoice_gerada', 'concluido'].includes(pedido.status) && packing && (
        <PainelInvoice key={`inv-${chave}`} pedido={pedido} produtos={produtos} pallets={packing.pallets} recebimentos={recebimentos} inicial={invoice} contract={contract}
          incoterm={params.incoterm ?? 'EXW'} moeda={params.moeda_invoice ?? 'EUR'} numeroPL={packing.pl.numero} userId={user.id} editavel={ehOps && pedido.status !== 'concluido'} aoConcluir={carregar} />
      )}
      {ehFranca && (pedido.status === 'aguardando_fr' || pedido.status === 'recusado_supply') && (
        <PainelFranca pedido={pedido} itens={itens} produtos={produtos} alteracoes={alteracoes} motivoRecusa={motivoRecusa} userId={user.id} aoConcluir={carregar} />
      )}

      {!(ehSupply && emValidacao && pedido.status === 'em_validacao_supply') && (
        <div className="cartao overflow-x-auto p-0">
          <table className="grade">
            <thead><tr><th>SKU</th><th>Produto</th><th>UM</th><th>Solicitado</th><th>Aprovado</th><th>Preço</th><th>Total</th><th>Obs.</th></tr></thead>
            <tbody>
              {itens.map((i) => { const p = prod(i.sku); const dif = i.qtd_aprovada !== null && i.qtd_aprovada !== i.qtd_solicitada; return (
                <tr key={i.id} className={dif ? 'bg-marca/10' : ''}>
                  <td className="font-mono">{i.sku}</td><td>{p?.descricao_br ?? i.sku}</td><td>{p?.unidade}</td>
                  <td>{fmtNum(i.qtd_solicitada)}</td>
                  <td className={dif ? 'font-semibold' : ''}>{i.qtd_aprovada === null ? '—' : fmtNum(i.qtd_aprovada)}</td>
                  <td>{fmtEur(i.preco_eur ?? p?.preco_interco_eur)}</td><td>{fmtEur((i.preco_eur ?? p?.preco_interco_eur ?? 0) * qtdFinal(i))}</td>
                  <td className="text-xs text-tinta-3">{i.observacao}</td>
                </tr>) })}
            </tbody>
            <tfoot><tr><td colSpan={6} className="text-right font-semibold">Total estimado</td><td className="font-semibold">{fmtEur(total)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
      {pedido.observacao && <p className="cartao text-sm"><b>Observações:</b> {pedido.observacao}</p>}

      <section className="cartao">
        <h2 className="mb-2 font-semibold">Histórico</h2>
        <ul className="space-y-1 text-sm">
          {eventos.map((e, i) => <li key={i}><span className="text-tinta-3">{new Date(e.criado_em).toLocaleString('pt-BR')}</span> · {ROTULO_STATUS[e.para_status] ?? e.para_status}{e.motivo ? ` — ${e.motivo}` : ''}</li>)}
        </ul>
        {alteracoes.length > 0 && (
          <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Alterações de Supply ({alteracoes.length})</summary>
            <ul className="mt-2 space-y-1">{alteracoes.map((a) => <li key={a.id}><span className="text-tinta-3">{new Date(a.criado_em).toLocaleString('pt-BR')}</span> · {a.sku ? `${a.sku} ` : ''}{a.campo}: {a.valor_antigo ?? '—'} → {a.valor_novo ?? '—'}</li>)}</ul>
          </details>
        )}
      </section>
    </div>
  )
}
