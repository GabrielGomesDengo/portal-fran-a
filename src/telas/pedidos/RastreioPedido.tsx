import { Link } from 'react-router-dom'
import { Rastreio } from '../../components/Ciclo'
import { exportarPedidoExcel } from '../../documentos/exportarPedido'
import { calcularCiclo, ETAPAS } from '../../dominio/ciclo'
import type { RegrasModal } from '../../dominio/modal'
import { fmtData, fmtEur, fmtNum } from '../../lib/formatos'
import { PainelFranca } from './PainelFranca'
import type { Dados } from './Pedido'

/** Visão da França: rastreio do pedido, como um acompanhamento de entrega. Nada de telas internas. */
export function RastreioPedido({ dados, novo, userId, regras, recarregar }: { dados: Dados; novo: boolean; userId: string; regras: RegrasModal; recarregar: () => void }) {
  const { pedido, itens, produtos, eventos, alteracoes, plano, recebimentos } = dados
  const prod = (sku: string) => produtos.find((p) => p.sku === sku)
  const ciclo = calcularCiclo(eventos, pedido.criado_em, pedido.data_embarque)
  const etapa = ETAPAS.find((e) => e.chave === ciclo.etapaAtual)
  const qtdFinal = (q: { qtd_aprovada: number | null; qtd_solicitada: number }) => q.qtd_aprovada ?? q.qtd_solicitada
  const total = itens.reduce((s, i) => s + (i.preco_eur ?? prod(i.sku)?.preco_interco_eur ?? 0) * qtdFinal(i), 0)
  const ajustado = itens.some((i) => i.qtd_aprovada !== null && i.qtd_aprovada !== i.qtd_solicitada)
  const precisaAcao = pedido.status === 'aguardando_fr' || pedido.status === 'recusado_supply'
  // Progresso de produção: volume já no estoque / volume planejado (sem expor o plano interno).
  const planejado = plano.filter((l) => l.atendimento !== 'nao').reduce((s, l) => s + (l.qtd_planejada ?? 0), 0)
  const pronto = recebimentos.reduce((s, r) => s + r.qtd_recebida, 0)
  const pctPronto = planejado > 0 ? Math.min(1, pronto / planejado) : null
  const mostrarProducao = ['producao', 'expedicao', 'embarcado'].includes(ciclo.etapaAtual ?? '') && pctPronto !== null

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {novo && <p className="surgir rounded-lg bg-ok/10 p-4 text-sm text-ok"><b>Pedido enviado!</b> O time de Supply da Dengo Brasil vai analisar e você acompanha cada etapa por aqui.</p>}
      <Link to="/" className="text-sm text-tinta-3 hover:underline">← Meus pedidos</Link>

      <header className="cartao flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-tinta-3">Pedido {pedido.numero}{pedido.po_franca ? ` · PO ${pedido.po_franca}` : ''}</div>
          <h1 className="mt-1 text-2xl font-semibold">{ciclo.cancelado ? 'Pedido cancelado' : etapa?.rotulo ?? '—'}</h1>
          {!ciclo.cancelado && etapa && <p className="mt-1 text-sm text-tinta-2">{etapa.descricao}</p>}
        </div>
        <button className="btn-secundario" onClick={() => exportarPedidoExcel(dados, { somenteResumo: true })}>⬇ Resumo em Excel</button>
      </header>

      {precisaAcao && <PainelFranca pedido={pedido} itens={itens} produtos={produtos} alteracoes={alteracoes} userId={userId} aoConcluir={recarregar}
        motivoRecusa={[...eventos].reverse().find((e) => e.para_status === 'recusado_supply')?.motivo ?? null} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao rotulo="Modal" valor={regras.rotulo} detalhe={regras.modal === 'maritimo' ? `${Math.round(regras.transitDias / 7)} semanas de trânsito` : `${regras.transitDias} dias de trânsito`} />
        <Cartao rotulo="Embarque previsto" valor={fmtData(pedido.data_embarque)} detalhe={!ciclo.cancelado && ciclo.etapaAtual !== 'embarcado' && ciclo.diasAteEmbarque >= 0 ? `em ${ciclo.diasAteEmbarque} dias` : undefined} />
        <Cartao rotulo="Chegada prevista na França" valor={fmtData(pedido.data_chegada_fr)} />
        <Cartao rotulo="Valor estimado" valor={fmtEur(total)} detalhe={`${itens.length} produtos`} />
      </div>
      {pedido.fora_prazo && <p className="rounded-lg bg-alerta/10 p-3 text-sm text-alerta">Pedido colocado com {pedido.antecedencia_dias} dias de antecedência (o recomendado para {regras.rotulo.toLowerCase()} é {regras.antecedenciaPedidoDias}). Ele seguiu com aprovação especial do Supply.</p>}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <h2 className="font-semibold">Acompanhamento</h2>
          <Rastreio pedido={pedido} eventos={eventos} />
          {mostrarProducao && (
            <div className="cartao">
              <div className="flex items-baseline justify-between"><span className="text-sm font-semibold">Produção no estoque</span><span className="text-lg font-semibold">{Math.round(pctPronto! * 100)}%</span></div>
              <div className="mt-2 h-2 rounded-full bg-linha"><div className="h-2 rounded-full bg-ok transition-all" style={{ width: `${pctPronto! * 100}%` }} /></div>
              <p className="mt-1 text-xs text-tinta-3">{fmtNum(pronto)} de {fmtNum(planejado)} unidades/kg prontas.</p>
            </div>
          )}
        </div>

        <section className="space-y-3">
          <h2 className="font-semibold">Produtos {ajustado && <span className="pill ml-1 bg-marca/30">com ajustes do Supply</span>}</h2>
          <div className="cartao overflow-x-auto p-0">
            <table className="grade">
              <thead><tr><th>Produto</th><th className="text-right">Pedido</th><th className="text-right">Confirmado</th><th className="text-right">Preço un.</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {itens.map((i) => { const p = prod(i.sku); const dif = i.qtd_aprovada !== null && i.qtd_aprovada !== i.qtd_solicitada; const preco = i.preco_eur ?? p?.preco_interco_eur ?? 0; return (
                  <tr key={i.id} className={dif ? 'bg-marca/10' : ''}>
                    <td><div className="font-medium">{p?.descricao_br ?? i.sku}</div><div className="font-mono text-xs text-tinta-3">{i.sku}</div></td>
                    <td className="text-right tabular-nums">{fmtNum(i.qtd_solicitada)}</td>
                    <td className={`text-right tabular-nums ${dif ? 'font-semibold' : ''}`}>{i.qtd_aprovada === null ? <span className="text-tinta-3">em análise</span> : fmtNum(i.qtd_aprovada)}</td>
                    <td className="text-right tabular-nums">{fmtEur(preco)}</td>
                    <td className="text-right font-semibold tabular-nums">{fmtEur(preco * qtdFinal(i))}</td>
                  </tr>) })}
              </tbody>
              <tfoot><tr><td colSpan={4} className="text-right font-semibold">Total estimado</td><td className="text-right text-lg font-semibold tabular-nums">{fmtEur(total)}</td></tr></tfoot>
            </table>
          </div>
          {pedido.observacao && <p className="cartao text-sm"><b>Suas observações:</b> {pedido.observacao}</p>}
          <p className="text-xs text-tinta-3">Valores aproximados. O valor final é o da invoice comercial emitida no embarque.</p>
        </section>
      </div>
    </div>
  )
}

function Cartao({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return <div className="cartao"><div className="rotulo">{rotulo}</div><div className="mt-1 text-xl font-semibold">{valor}</div>{detalhe && <div className="text-xs text-tinta-3">{detalhe}</div>}</div>
}
