import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { salvarParametro } from '../../dados/parametros'
import { Carregando, Erro } from '../../components/Carregando'

type P = { chave: string; valor: string; descricao: string | null }
type R = { versao: number; shelf_life_dias: number; minimo_dias_chegada: number }

export function Parametros() {
  const [params, setParams] = useState<P[] | null>(null)
  const [regras, setRegras] = useState<R[] | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  useEffect(() => {
    Promise.all([supabase.from('parametro').select('*').order('chave'), supabase.from('contract_date_regra').select('*').eq('vigente', true).order('shelf_life_dias')])
      .then(([a, b]) => { if (a.error) throw a.error; if (b.error) throw b.error; setParams(a.data as P[]); setRegras(b.data as R[]) }).catch(setErro)
  }, [])
  async function salvar(chave: string, valor: string) {
    setParams((ps) => ps!.map((p) => (p.chave === chave ? { ...p, valor } : p)))
    try { await salvarParametro(chave, valor) } catch (e) { setErro(e) }
  }
  async function salvarRegra(r: R, minimo: number) {
    setRegras((rs) => rs!.map((x) => (x.shelf_life_dias === r.shelf_life_dias ? { ...x, minimo_dias_chegada: minimo } : x)))
    const { error } = await supabase.from('contract_date_regra').update({ minimo_dias_chegada: minimo }).eq('versao', r.versao).eq('shelf_life_dias', r.shelf_life_dias)
    if (error) setErro(error)
  }
  if (erro) return <Erro erro={erro} />
  if (!params || !regras) return <Carregando />
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Parâmetros</h2>
        {params.map((p) => (
          <label key={p.chave} className="block">
            <span className="rotulo">{p.chave}</span>
            <input className="mt-1 w-full" value={p.valor} onChange={(e) => salvar(p.chave, e.target.value)} />
            {p.descricao && <span className="text-xs text-tinta-3">{p.descricao}</span>}
          </label>
        ))}
      </section>
      <section className="cartao space-y-3">
        <h2 className="font-semibold">Contract date (versão {regras[0]?.versao})</h2>
        <p className="text-xs text-tinta-3">Dias mínimos de validade restante na chegada à França, por faixa de shelf life. Faixas fora da tabela usam regra proporcional.</p>
        <table className="grade">
          <thead><tr><th>Shelf life (dias)</th><th>Mínimo na chegada (dias)</th><th>Semanas</th><th>% do shelf</th></tr></thead>
          <tbody>
            {regras.map((r) => (
              <tr key={r.shelf_life_dias}>
                <td>{r.shelf_life_dias}</td>
                <td><input type="number" className="w-24 !py-1" value={r.minimo_dias_chegada} onChange={(e) => salvarRegra(r, Number(e.target.value))} /></td>
                <td>{(r.minimo_dias_chegada / 7).toFixed(1)}</td>
                <td>{Math.round((r.minimo_dias_chegada / r.shelf_life_dias) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
