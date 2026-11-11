import { ROTULO_STATUS, type StatusPedido } from '../tipos/dominio'

const ETAPAS: { chave: string; rotulo: string; status: StatusPedido[] }[] = [
  { chave: 'fr', rotulo: 'Pedido França', status: ['rascunho', 'enviado'] },
  { chave: 'supply', rotulo: 'Validação Supply', status: ['em_validacao_supply', 'ajustado_supply', 'recusado_supply', 'aguardando_fr'] },
  { chave: 'aprov', rotulo: 'Aprovado', status: ['aprovado'] },
  { chave: 'pcp', rotulo: 'Plano PCP', status: ['em_planejamento_pcp', 'plano_concluido'] },
  { chave: 'ops', rotulo: 'Recebimento', status: ['em_recebimento'] },
  { chave: 'docs', rotulo: 'Packing list / Invoice', status: ['packing_list', 'invoice_gerada'] },
  { chave: 'fim', rotulo: 'Concluído', status: ['concluido'] },
]

export function LinhaDoTempo({ status }: { status: StatusPedido }) {
  if (status === 'cancelado') return <span className="pill bg-erro/15 text-erro">Cancelado</span>
  const atual = ETAPAS.findIndex((e) => e.status.includes(status))
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Etapas do pedido">
      {ETAPAS.map((e, i) => {
        const cls = i < atual ? 'bg-ok/15 text-ok' : i === atual ? 'bg-marca text-tinta' : 'bg-linha/60 text-tinta-3'
        return (
          <li key={e.chave} className={`pill ${cls}`}>
            {i < atual ? '✓ ' : ''}{e.rotulo}{i === atual && status !== 'rascunho' ? ` · ${ROTULO_STATUS[status]}` : ''}
          </li>
        )
      })}
    </ol>
  )
}
