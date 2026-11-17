import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Erro } from '../components/Carregando'
import { ROTULO_PERFIL } from '../tipos/dominio'
import { t } from '../i18n/idioma'

export function MinhaConta() {
  const { perfil, user } = useAuth()
  const [senha, setSenha] = useState(''); const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<unknown>(null); const [ok, setOk] = useState(false); const [ocupado, setOcupado] = useState(false)
  async function trocar(e: FormEvent) {
    e.preventDefault(); setErro(null); setOk(false)
    if (senha !== confirma) { setErro(new Error(t('As senhas não conferem.'))); return }
    setOcupado(true)
    try { const { error } = await supabase.auth.updateUser({ password: senha }); if (error) throw error; setOk(true); setSenha(''); setConfirma('') }
    catch (err) { setErro(err) } finally { setOcupado(false) }
  }
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">{t('Minha conta')}</h1>
      <div className="cartao text-sm"><p><b>{perfil?.nome}</b></p><p>{user?.email}</p><p>{t('Perfil')}: {perfil ? t(ROTULO_PERFIL[perfil.perfil]) : ''}</p></div>
      <form onSubmit={trocar} className="cartao space-y-3">
        <h2 className="font-semibold">{t('Trocar senha')}</h2>
        <label className="block"><span className="rotulo">{t('Nova senha')}</span><input type="password" className="mt-1 w-full" minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="new-password" /></label>
        <label className="block"><span className="rotulo">{t('Confirmar')}</span><input type="password" className="mt-1 w-full" minLength={8} value={confirma} onChange={(e) => setConfirma(e.target.value)} required autoComplete="new-password" /></label>
        {erro ? <Erro erro={erro} /> : null}
        {ok && <p className="rounded-md bg-ok/10 p-3 text-sm text-ok">{t('Senha alterada.')}</p>}
        <button className="btn-primario" disabled={ocupado}>{t('Salvar nova senha')}</button>
      </form>
    </div>
  )
}
