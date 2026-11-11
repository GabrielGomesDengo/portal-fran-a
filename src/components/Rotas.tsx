import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Carregando } from './Carregando'
import type { Perfil } from '../tipos/dominio'

export function RotaProtegida() {
  const { user, perfil, carregando } = useAuth()
  if (carregando) return <Carregando />
  if (!user) return <Navigate to="/entrar" replace />
  if (perfil && !perfil.ativo) return <p className="p-6">Seu acesso está desativado. Fale com o administrador.</p>
  return <Outlet />
}

export function RotaPerfil({ perfis }: { perfis: Perfil[] }) {
  const { perfil } = useAuth()
  if (!perfil) return <Carregando />
  if (!perfis.includes(perfil.perfil)) return <Navigate to="/" replace />
  return <Outlet />
}

export function RotaPublica() {
  const { user, carregando } = useAuth()
  if (carregando) return <Carregando />
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}
