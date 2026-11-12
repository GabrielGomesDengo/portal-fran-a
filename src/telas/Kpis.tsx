import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { listarPedidos } from '../dados/pedidos'
import { listarProdutos } from '../dados/produtos'
import { carregarTabelaContract } from '../dados/contractDate'
import { carregarParametros, numero } from '../dados/parametros'
import { calcularOtif, type Otif } from '../dominio/otif'
import { somarDias } from '../dominio/calendario'
import { fmtData } from '../lib/formatos'
import { Carregando, Erro } from '../components/Carregando'
import type { Pedido, Produto } from '../tipos/dominio'
import type { Recebimento } from '../dados/operacoes'
import type { FaixaContractDate } from '../dominio/contractDate'

type Linha = { pedido: Pedido; otif: Otif }

export function Kpis() {
  const [dados, setDados] = useState<{ linhas: Linha[]; semRecebimento: number } | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  useEffect(() => {
    Promise.all([listarPedidos(), listarProdutos(), carregarTabelaContract(), carregarParametros(), supabase.from('recebimento').select('*')])
      .then(([pedidos, produtos, c, params, rec]) => {
        if (rec.error) throw rec.error
        const antecedencia = numero(params, 'antecedencia_estoque_dias', 7)
        const linhas = montar(pedidos, produtos, (rec.data ?? []) as Recebimento[], c.tabela, antecedencia)
        setDados({ linhas, semRecebimento: pedidos.length - linhas.length })
      }).catch(setErro)
  }, [])
  const total = useMemo(() => dados ? media(dados.linhas.map((l) => l.otif)) : null, [dados])
  if (erro) return <Erro erro={erro} />
  if (!dados || !total) return <Carregando />
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)
  const cor = (v: number | null) => (v === null ? '' : v >= 0.95 ? 'text-ok' : v >= 0.8 ? 'text-alerta' : 'text-erro')
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">KPIs · OTIF</h1>
      <p className="text-sm text-tinta-3">Base: plano do PCP. Shelf life = lotes recebidos que atendem o contract date na chegada. On-time = lotes no estoque até 7 dias antes do embarque. Consolidado = média dos pedidos com recebimento ({dados.linhas.length}).</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['OTIF volume', total.volume], ['OTIF SKU', total.sku], ['OTIF shelf life', total.shelfLife], ['On-time', total.onTime]].map(([r, v]) => (
          <div key={r as string} className="cartao"><div className="rotulo">{r as string}</div><div className={`text-3xl font-semibold ${cor(v as number | null)}`}>{pct(v as number | null)}</div></div>
        ))}
      </div>
      <div className="cartao overflow-x-auto p-0">
        <table className="grade">
          <thead><tr><th>Pedido</th><th>Embarque</th><th>Status</th><th>Volume</th><th>SKU</th><th>Shelf life</th><th>On-time</th><th>Lotes</th></tr></thead>
          <tbody>{dados.linhas.map(({ pedido, otif }) => (
            <tr key={pedido.id}><td><Link className="font-mono underline" to={`/pedidos/${pedido.id}`}>{pedido.numero}</Link></td><td>{fmtData(pedido.data_embarque)}</td><td className="text-xs">{pedido.status}</td>
              <td className={cor(otif.volume)}>{pct(otif.volume)}</td><td className={cor(otif.sku)}>{pct(otif.sku)}</td><td className={cor(otif.shelfLife)}>{pct(otif.shelfLife)}</td><td className={cor(otif.onTime)}>{pct(otif.onTime)}</td><td>{otif.linhas}</td></tr>))}</tbody>
        </table>
        {dados.linhas.length === 0 && <p className="p-4 text-sm text-tinta-3">Nenhum pedido com recebimento registrado ainda.</p>}
      </div>
    </div>
  )
}

function montar(pedidos: Pedido[], produtos: Produto[], rec: Recebimento[], tabela: FaixaContractDate[], antecedencia: number): Linha[] {
  return pedidos.flatMap((pedido) => {
    const rs = rec.filter((r) => r.pedido_id === pedido.id); if (rs.length === 0) return []
    const otif = calcularOtif(rs.map((r) => ({ sku: r.sku, qtdBase: r.qtd_planejada ?? 0, qtdRecebida: r.qtd_recebida, validade: r.validade, shelfLifeDias: produtos.find((p) => p.sku === r.sku)?.shelf_life_dias ?? null, dataRecebimento: r.qtd_recebida > 0 ? r.data_recebimento : null })),
      pedido.data_chegada_fr, somarDias(pedido.data_embarque, -antecedencia), tabela)
    return [{ pedido, otif }]
  })
}
function media(os: Otif[]): Otif {
  const m = (k: keyof Omit<Otif, 'linhas'>) => { const v = os.map((o) => o[k]).filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  return { volume: m('volume'), sku: m('sku'), shelfLife: m('shelfLife'), onTime: m('onTime'), linhas: os.reduce((s, o) => s + o.linhas, 0) }
}
