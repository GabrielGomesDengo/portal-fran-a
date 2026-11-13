import { useEffect, useRef } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ROTULO_PERFIL, type Perfil } from '../tipos/dominio'
import { Logo } from './Logo'

const MENU: Record<Perfil, { para: string; rotulo: string }[]> = {
  franca: [{ para: '/', rotulo: 'Meus pedidos' }, { para: '/pedidos/novo', rotulo: 'Novo pedido' }],
  supply: [{ para: '/', rotulo: 'Início' }, { para: '/pedidos', rotulo: 'Pedidos' }, { para: '/kpis', rotulo: 'KPIs' }, { para: '/admin/produtos', rotulo: 'Portfólio' }],
  pcp: [{ para: '/', rotulo: 'Início' }, { para: '/pedidos', rotulo: 'Pedidos' }],
  operacoes: [{ para: '/', rotulo: 'Início' }, { para: '/pedidos', rotulo: 'Pedidos' }, { para: '/kpis', rotulo: 'KPIs' }],
  admin: [
    { para: '/', rotulo: 'Início' }, { para: '/pedidos', rotulo: 'Pedidos' }, { para: '/pedidos/novo', rotulo: 'Novo pedido' }, { para: '/kpis', rotulo: 'KPIs' },
    { para: '/admin/produtos', rotulo: 'Portfólio' }, { para: '/admin/parametros', rotulo: 'Parâmetros' }, { para: '/admin/usuarios', rotulo: 'Usuários' },
  ],
}

export function Layout() {
  const { perfil, sair } = useAuth()
  const itens = perfil ? MENU[perfil.perfil] : []
  const cab = useRef<HTMLElement>(null)
  // Publica a altura do cabeçalho para que barras "sticky" das telas fiquem logo abaixo dele.
  useEffect(() => {
    const el = cab.current; if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--altura-cabecalho', `${el.offsetHeight}px`))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  return (
    <div className="min-h-dvh">
      <header ref={cab} className="sticky top-0 z-30 border-b border-linha bg-cartao/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2.5">
            <Logo tamanho={36} />
            <span className="text-sm font-semibold leading-tight">Portal de Pedidos<br className="sm:hidden" /> <span className="text-tinta-2">França</span></span>
          </NavLink>
          <nav className="flex flex-wrap gap-1">
            {itens.map((i) => (
              <NavLink key={i.para} to={i.para} end
                className={({ isActive }) => `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-marca font-semibold' : 'hover:bg-fundo'}`}>
                {i.rotulo}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {perfil && <NavLink to="/conta" className="text-tinta-2 hover:underline">{perfil.nome} · <b>{ROTULO_PERFIL[perfil.perfil]}</b></NavLink>}
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
