import { useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Erro } from '../components/Carregando'
import { Logo } from '../components/Logo'

export function Entrar() {
  const { entrar, cadastrar } = useAuth()
  const [modo, setModo] = useState<'entrar' | 'cadastrar'>('entrar')
  const [nome, setNome] = useState(''); const [email, setEmail] = useState(''); const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<unknown>(null); const [aviso, setAviso] = useState(''); const [ocupado, setOcupado] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro(null); setAviso(''); setOcupado(true)
    try {
      if (modo === 'entrar') await entrar(email, senha)
      else {
        const r = await cadastrar(nome, email, senha)
        if (r.precisaConfirmar) setAviso('Cadastro feito. Confirme o e-mail e peça ao administrador para liberar seu perfil.')
      }
    } catch (err) { setErro(err) } finally { setOcupado(false) }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-6 text-center">
        <Logo tamanho={96} className="mx-auto" />
        <h1 className="mt-3 text-xl font-semibold">Portal de Pedidos França</h1>
      </div>
      <form onSubmit={enviar} className="cartao space-y-3">
        {modo === 'cadastrar' && <label className="block"><span className="rotulo">Nome</span><input className="mt-1 w-full" value={nome} onChange={(e) => setNome(e.target.value)} required /></label>}
        <label className="block"><span className="rotulo">E-mail</span><input className="mt-1 w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label className="block"><span className="rotulo">Senha</span><input className="mt-1 w-full" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} /></label>
        {erro ? <Erro erro={erro} /> : null}
        {aviso && <p className="rounded-md bg-ok/10 p-3 text-sm text-ok">{aviso}</p>}
        <button className="btn-primario w-full" disabled={ocupado}>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
        <button type="button" className="w-full text-center text-sm text-tinta-3 underline" onClick={() => setModo(modo === 'entrar' ? 'cadastrar' : 'entrar')}>
          {modo === 'entrar' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  )
}
