import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { PerfilUsuario } from '../tipos/dominio'

type Auth = {
  user: User | null
  session: Session | null
  perfil: PerfilUsuario | null
  carregando: boolean
  entrar: (email: string, senha: string) => Promise<void>
  cadastrar: (nome: string, email: string, senha: string) => Promise<{ precisaConfirmar: boolean }>
  sair: () => Promise<void>
  recarregarPerfil: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [carregando, setCarregando] = useState(true)

  async function carregarPerfil(userId: string | undefined) {
    if (!userId) { setPerfil(null); return }
    const { data } = await supabase.from('perfil_usuario').select('*').eq('user_id', userId).maybeSingle()
    setPerfil((data as PerfilUsuario) ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await carregarPerfil(data.session?.user.id)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      carregarPerfil(s?.user.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) throw error
  }
  async function cadastrar(nome: string, email: string, senha: string) {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password: senha, options: { data: { nome: nome.trim() } },
    })
    if (error) throw error
    return { precisaConfirmar: !data.session }
  }
  async function sair() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{
      user: session?.user ?? null, session, perfil, carregando, entrar, cadastrar, sair,
      recarregarPerfil: () => carregarPerfil(session?.user.id),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
