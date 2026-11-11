import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { carregarPedido, listarEventos } from '../../dados/pedidos'
import { listarProdutos } from '../../dados/produtos'
import { Carregando, Erro } from '../../components/Carregando'
import { LinhaDoTempo } from '../../components/LinhaDoTempo'
import { fmtData, fmtEur, fmtNum } from '../../lib/formatos'
import { gerarExcelResumoPedido } from '../../documentos/resumoPedido'
import { ROTULO_STATUS, type Pedido as TPedido, type PedidoItem, type Produto } from '../../tipos/dominio'

export function Pedido() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const [dados, setDados] = useState<{ pedido: TPedido; itens: PedidoItem[]; produtos: Produto[]; eventos: { para_status: string; motivo: string | null; criado_em: string }[] } | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  useEffect(() => {
    if (!id) return
    Promise.all([carregarPedido(id), listarProdutos(), listarEventos(id)])
      .then(([d, produtos, eventos]) => setDados({ ...d, produtos, eventos }))
      .catch(setErro)
  }, [id])
  if (erro) return <Erro erro={erro} />
  if (!dados) return <Carregando />
  const { pedido, itens, produtos, eventos } = dados
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const total = itens.reduce((s, i) => s + (i.preco_eur ?? 0) * (i.qtd_aprovada ?? i.qtd_solicitada), 0)
  return (
    <div className="space-y-4">
      {sp.get('novo') && <p className="rounded-md bg-ok/10 p-3 text-sm text-ok">Pedido enviado para a Dengo Brasil. O time de Supply vai validar e você será avisado.</p>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pedido {pedido.numero}</h1>
          <p className="text-sm text-tinta-2">Embarque {fmtData(pedido.data_embarque)} · chegada FR {fmtData(pedido.data_chegada_fr)}{pedido.po_franca ? ` · PO ${pedido.po_franca}` : ''}</p>
        </div>
        <button className="btn-secundario" onClick={() => gerarExcelResumoPedido(pedido, itens, produtos)}>⬇ Resumo em Excel</button>
      </div>
      <LinhaDoTempo status={pedido.status} />
      <div className="cartao overflow-x-auto p-0">
        <table className="grade">
          <thead><tr><th>SKU</th><th>Produto</th><th>UM</th><th>Solicitado</th><th>Caixas</th><th>Aprovado</th><th>Preço</th><th>Total</th></tr></thead>
          <tbody>
            {itens.map((i) => { const p = prod(i.sku); return (
              <tr key={i.id}>
                <td className="font-mono">{i.sku}</td><td>{p?.descricao_br ?? i.sku}</td><td>{p?.unidade}</td>
                <td>{fmtNum(i.qtd_solicitada)}</td><td>{fmtNum(i.caixas_solicitadas)}</td>
                <td>{i.qtd_aprovada === null ? '—' : fmtNum(i.qtd_aprovada)}</td>
                <td>{fmtEur(i.preco_eur)}</td><td>{fmtEur((i.preco_eur ?? 0) * (i.qtd_aprovada ?? i.qtd_solicitada))}</td>
              </tr>) })}
          </tbody>
          <tfoot><tr><td colSpan={7} className="text-right font-semibold">Total estimado</td><td className="font-semibold">{fmtEur(total)}</td></tr></tfoot>
        </table>
      </div>
      {pedido.observacao && <p className="cartao text-sm"><b>Observações:</b> {pedido.observacao}</p>}
      <section className="cartao">
        <h2 className="mb-2 font-semibold">Histórico</h2>
        <ul className="space-y-1 text-sm">
          {eventos.map((e, i) => <li key={i}><span className="text-tinta-3">{new Date(e.criado_em).toLocaleString('pt-BR')}</span> · {ROTULO_STATUS[e.para_status as keyof typeof ROTULO_STATUS] ?? e.para_status}{e.motivo ? ` — ${e.motivo}` : ''}</li>)}
        </ul>
      </section>
    </div>
  )
}
