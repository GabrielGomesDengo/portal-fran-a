import { useEffect, useState } from 'react'
import { listarPedidos } from '../../dados/pedidos'
import { Carregando, Erro } from '../../components/Carregando'
import { ListaPedidos } from '../Inicio'
import type { Pedido } from '../../tipos/dominio'

export function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  useEffect(() => { listarPedidos().then(setPedidos).catch(setErro) }, [])
  if (erro) return <Erro erro={erro} />
  if (!pedidos) return <Carregando />
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Pedidos</h1>
      <div className="cartao">{pedidos.length === 0 ? <p className="text-sm text-tinta-3">Nenhum pedido.</p> : <ListaPedidos pedidos={pedidos} />}</div>
    </div>
  )
}
