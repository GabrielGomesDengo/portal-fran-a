import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mudarStatus, type Alteracao } from '../../dados/pedidos'
import { fmtData, fmtNum } from '../../lib/formatos'
import { Erro } from '../../components/Carregando'
import type { Pedido, PedidoItem, Produto } from '../../tipos/dominio'

const ROTULO_CAMPO: Record<string, string> = { data_embarque: 'Data de embarque', observacao: 'Observação', quantidade: 'Quantidade', item_incluido: 'Item incluído', item_removido: 'Item removido' }

export function PainelFranca({ pedido, itens, produtos, alteracoes, motivoRecusa, userId, aoConcluir }: {
  pedido: Pedido; itens: PedidoItem[]; produtos: Produto[]; alteracoes: Alteracao[]; motivoRecusa: string | null; userId: string; aoConcluir: () => void
}) {
  const nav = useNavigate()
  const [erro, setErro] = useState<unknown>(null); const [ocupado, setOcupado] = useState(false)
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const fmt = (campo: string, v: string | null) => (v === null ? '—' : campo === 'data_embarque' ? fmtData(v) : /^\d+(\.\d+)?$/.test(v) ? fmtNum(Number(v)) : v)
  async function acao(para: 'aprovado' | 'cancelado') {
    setErro(null); setOcupado(true)
    try { await mudarStatus(pedido, para, userId, para === 'cancelado' ? 'Recusado pela França' : 'Alterações aceitas pela França'); aoConcluir() } catch (e) { setErro(e) } finally { setOcupado(false) }
  }
  if (pedido.status === 'recusado_supply') return (
    <section className="cartao space-y-3 border-erro">
      <h2 className="font-semibold text-erro">Pedido recusado pelo Supply</h2>
      <p className="text-sm"><b>Motivo:</b> {motivoRecusa ?? '—'}</p>
      {erro ? <Erro erro={erro} /> : null}
      <div className="flex gap-2">
        <button className="btn-primario" onClick={() => nav('/pedidos/novo')}>Fazer um novo pedido</button>
        <button className="btn-secundario" disabled={ocupado} onClick={() => acao('cancelado')}>Encerrar este pedido</button>
      </div>
    </section>
  )
  const diffs = itens.filter((i) => i.qtd_aprovada !== null && i.qtd_aprovada !== i.qtd_solicitada)
  return (
    <section className="cartao space-y-3 border-marca">
      <h2 className="font-semibold">O Supply ajustou o pedido. Você aceita as alterações?</h2>
      {alteracoes.length > 0 && (
        <table className="grade">
          <thead><tr><th>Quando</th><th>Item</th><th>O que mudou</th><th>De</th><th>Para</th></tr></thead>
          <tbody>{alteracoes.map((a) => (
            <tr key={a.id}><td className="text-tinta-3">{new Date(a.criado_em).toLocaleString('pt-BR')}</td><td>{a.sku ? `${a.sku} · ${prod(a.sku)?.descricao_br ?? ''}` : '—'}</td>
              <td>{ROTULO_CAMPO[a.campo] ?? a.campo}</td><td>{fmt(a.campo, a.valor_antigo)}</td><td className="font-semibold">{fmt(a.campo, a.valor_novo)}</td></tr>))}</tbody>
        </table>
      )}
      {diffs.length === 0 && alteracoes.length === 0 && <p className="text-sm text-tinta-3">Nenhuma diferença registrada.</p>}
      {erro ? <Erro erro={erro} /> : null}
      <div className="flex gap-2">
        <button className="btn-primario" disabled={ocupado} onClick={() => acao('aprovado')}>Aceitar e seguir para o PCP</button>
        <button className="btn-perigo" disabled={ocupado} onClick={() => acao('cancelado')}>Recusar e cancelar o pedido</button>
      </div>
    </section>
  )
}
