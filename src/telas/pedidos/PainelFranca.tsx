import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mudarStatus, type Alteracao } from '../../dados/pedidos'
import { fmtData, fmtDataHora, fmtNum } from '../../lib/formatos'
import { Erro } from '../../components/Carregando'
import type { Pedido, PedidoItem, Produto } from '../../tipos/dominio'
import { t, nomeProduto } from '../../i18n/idioma'

const ROTULO_CAMPO: Record<string, string> = { data_embarque: 'Data de embarque', observacao: 'Observação', quantidade: 'Quantidade', item_incluido: 'Item incluído', item_removido: 'Item removido' }
const rotuloCampo = (c: string) => (ROTULO_CAMPO[c] ? t(ROTULO_CAMPO[c]) : c)

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
      <h2 className="font-semibold text-erro">{t('Pedido recusado pelo Supply')}</h2>
      <p className="text-sm"><b>{t('Motivo')}:</b> {motivoRecusa ?? '—'}</p>
      {erro ? <Erro erro={erro} /> : null}
      <div className="flex gap-2">
        <button className="btn-primario" onClick={() => nav('/pedidos/novo')}>{t('Fazer um novo pedido')}</button>
        <button className="btn-secundario" disabled={ocupado} onClick={() => acao('cancelado')}>{t('Encerrar este pedido')}</button>
      </div>
    </section>
  )
  const diffs = itens.filter((i) => i.qtd_aprovada !== null && i.qtd_aprovada !== i.qtd_solicitada)
  return (
    <section className="cartao space-y-3 border-marca">
      <h2 className="font-semibold">{t('O Supply ajustou o pedido. Você aceita as alterações?')}</h2>
      {alteracoes.length > 0 && (
        <table className="grade">
          <thead><tr><th>{t('Quando')}</th><th>{t('Item')}</th><th>{t('O que mudou')}</th><th>{t('De')}</th><th>{t('Para')}</th></tr></thead>
          <tbody>{alteracoes.map((a) => (
            <tr key={a.id}><td className="text-tinta-3">{fmtDataHora(a.criado_em)}</td><td>{a.sku ? `${a.sku} · ${nomeProduto(prod(a.sku))}` : '—'}</td>
              <td>{rotuloCampo(a.campo)}</td><td>{fmt(a.campo, a.valor_antigo)}</td><td className="font-semibold">{fmt(a.campo, a.valor_novo)}</td></tr>))}</tbody>
        </table>
      )}
      {diffs.length === 0 && alteracoes.length === 0 && <p className="text-sm text-tinta-3">{t('Nenhuma diferença registrada.')}</p>}
      {erro ? <Erro erro={erro} /> : null}
      <div className="flex gap-2">
        <button className="btn-primario" disabled={ocupado} onClick={() => acao('aprovado')}>{t('Aceitar e seguir para a produção')}</button>
        <button className="btn-perigo" disabled={ocupado} onClick={() => acao('cancelado')}>{t('Recusar e cancelar o pedido')}</button>
      </div>
    </section>
  )
}
