import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { listarPedidos } from '../dados/pedidos'
import { ROTULO_STATUS, type Pedido, type Perfil, type StatusPedido } from '../tipos/dominio'
import { fmtData } from '../lib/formatos'
import { Carregando, Erro } from '../components/Carregando'

/** Quais status pedem ação de cada perfil. */
const MINHA_VEZ: Record<Perfil, StatusPedido[]> = {
  franca: ['rascunho', 'aguardando_fr'],
  supply: ['enviado', 'em_validacao_supply'],
  pcp: ['aprovado', 'em_planejamento_pcp'],
  operacoes: ['plano_concluido', 'em_recebimento', 'packing_list', 'invoice_gerada'],
  admin: [],
}

export function Inicio() {
  const { perfil } = useAuth()
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  useEffect(() => { listarPedidos().then(setPedidos).catch(setErro) }, [])
  if (erro) return <Erro erro={erro} />
  if (!pedidos || !perfil) return <Carregando />
  const minhaVez = pedidos.filter((p) => MINHA_VEZ[perfil.perfil].includes(p.status))
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Olá, {perfil.nome.split(' ')[0]}</h1>
        {(perfil.perfil === 'franca' || perfil.perfil === 'admin') && <Link to="/pedidos/novo" className="btn-primario">+ Novo pedido</Link>}
      </div>
      <section className="cartao">
        <h2 className="mb-2 font-semibold">Esperando a sua ação ({minhaVez.length})</h2>
        {minhaVez.length === 0 ? <p className="text-sm text-tinta-3">Nada pendente para você agora.</p> : <ListaPedidos pedidos={minhaVez} />}
      </section>
      <section className="cartao">
        <h2 className="mb-2 font-semibold">Todos os pedidos ({pedidos.length})</h2>
        {pedidos.length === 0 ? <p className="text-sm text-tinta-3">Nenhum pedido ainda.</p> : <ListaPedidos pedidos={pedidos} />}
      </section>
    </div>
  )
}

export function ListaPedidos({ pedidos }: { pedidos: Pedido[] }) {
  return (
    <table className="grade">
      <thead><tr><th>Nº</th><th>Embarque</th><th>Chegada FR</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {pedidos.map((p) => (
          <tr key={p.id}>
            <td className="font-mono">{p.numero}</td>
            <td>{fmtData(p.data_embarque)}</td>
            <td>{fmtData(p.data_chegada_fr)}</td>
            <td><span className="pill bg-marca/20">{ROTULO_STATUS[p.status]}</span></td>
            <td className="text-right"><Link className="text-sm underline" to={`/pedidos/${p.id}`}>Abrir</Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
