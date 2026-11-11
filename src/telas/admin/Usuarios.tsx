import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Carregando, Erro } from '../../components/Carregando'
import { ROTULO_PERFIL, type Perfil, type PerfilUsuario } from '../../tipos/dominio'

export function Usuarios() {
  const [lista, setLista] = useState<PerfilUsuario[] | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  useEffect(() => { supabase.from('perfil_usuario').select('*').order('nome').then(({ data, error }) => error ? setErro(error) : setLista(data as PerfilUsuario[])) }, [])
  async function editar(u: PerfilUsuario, campos: Partial<PerfilUsuario>) {
    setLista((l) => l!.map((x) => (x.user_id === u.user_id ? { ...x, ...campos } : x)))
    const { error } = await supabase.from('perfil_usuario').update(campos).eq('user_id', u.user_id)
    if (error) setErro(error)
  }
  if (erro) return <Erro erro={erro} />
  if (!lista) return <Carregando />
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Usuários</h1>
      <p className="text-sm text-tinta-3">Quem cria conta entra como <b>França</b> e inativo até o Admin liberar.</p>
      <div className="cartao overflow-x-auto p-0">
        <table className="grade">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Ativo</th></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.user_id}>
                <td>{u.nome}</td><td>{u.email}</td>
                <td><select value={u.perfil} onChange={(e) => editar(u, { perfil: e.target.value as Perfil })}>{(Object.keys(ROTULO_PERFIL) as Perfil[]).map((p) => <option key={p} value={p}>{ROTULO_PERFIL[p]}</option>)}</select></td>
                <td><input type="checkbox" checked={u.ativo} onChange={(e) => editar(u, { ativo: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
