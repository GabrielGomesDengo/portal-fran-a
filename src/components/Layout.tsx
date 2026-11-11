import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ROTULO_PERFIL, type Perfil } from '../tipos/dominio'

const MENU: Record<Perfil, { para: string; rotulo: string }[]> = {
  franca: [{ para: '/', rotulo: 'Início' }, { para: '/pedidos/novo', rotulo: 'Novo pedido' }, { para: '/pedidos', rotulo: 'Meus pedidos' }],
  supply: [{ para: '/', rotulo: 'Início' }, { para: '/pedidos', rotulo: 'Pedidos' }, { para: '/admin/produtos', rotulo: 'Portfólio' }],
  pcp: [{ para: '/', rotulo: 'Início' }, { para: '/pedidos', rotulo: 'Pedidos' }],
  operacoes: [{ para: '/', rotulo: 'Início' }, { para: '/pedidos', rotulo: 'Pedidos' }],
  admin: [
    { para: '/', rotulo: 'Início' }, { para: '/pedidos', rotulo: 'Pedidos' }, { para: '/pedidos/novo', rotulo: 'Novo pedido' },
    { para: '/admin/produtos', rotulo: 'Portfólio' }, { para: '/admin/parametros', rotulo: 'Parâmetros' }, { para: '/admin/usuarios', rotulo: 'Usuários' },
  ],
}

export function Layout() {
  const { perfil, sair } = useAuth()
  const itens = perfil ? MENU[perfil.perfil] : []
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-linha bg-cartao/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-marca px-2 py-1 font-serif italic text-tinta">dengo</span>
            <span className="text-sm font-semibold">Portal de Pedidos França</span>
          </div>
          <nav className="flex flex-wrap gap-1">
            {itens.map((i) => (
              <NavLink key={i.para} to={i.para} end={i.para === '/'}
                className={({ isActive }) => `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-marca/20 font-semibold' : 'hover:bg-fundo'}`}>
                {i.rotulo}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {perfil && <span className="text-tinta-2">{perfil.nome} · <b>{ROTULO_PERFIL[perfil.perfil]}</b></span>}
            <button className="btn-secundario !py-1" onClick={() => sair()}>Sair</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
