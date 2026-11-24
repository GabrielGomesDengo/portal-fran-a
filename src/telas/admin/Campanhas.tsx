import { useEffect, useMemo, useState } from 'react'
import { excluirCampanha, listarCampanhas, salvarCampanha } from '../../dados/campanhas'
import { listarProdutos, salvarProduto } from '../../dados/produtos'
import { LISTA_SAZONALIDADES, SAZONALIDADES, situacaoCampanha, validarCampanha, type Campanha, type Sazonalidade, type SituacaoCampanha } from '../../dominio/campanhas'
import { SeloSazonal } from '../../components/Sazonal'
import { Carregando, Erro } from '../../components/Carregando'
import { fmtData, hoje } from '../../lib/formatos'
import type { Produto } from '../../tipos/dominio'

type Rascunho = Omit<Campanha, 'id'> & { id?: string }
const vazio = (s: Sazonalidade = 'pascoa'): Rascunho => ({ sazonalidade: s, nome: '', pedidos_de: hoje(), pedidos_ate: '', embarque_de: null, embarque_ate: null, observacao: null })
const SITUACAO: Record<SituacaoCampanha, [string, string]> = {
  aberta: ['Aberta', 'bg-ok/15 text-ok'], agendada: ['Agendada', 'bg-alerta/15 text-alerta'], encerrada: ['Encerrada', 'bg-fundo text-tinta-3'],
}

/** Campanhas sazonais (Páscoa e Natal): itens dessas subcategorias só podem ser pedidos com campanha aberta. */
export function Campanhas() {
  const [campanhas, setCampanhas] = useState<Campanha[] | null>(null)
  const [produtos, setProdutos] = useState<Produto[] | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  const [form, setForm] = useState<Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')
  const hojeL = hoje()

  const carregar = () => Promise.all([listarCampanhas(), listarProdutos()]).then(([c, p]) => { setCampanhas(c); setProdutos(p) }).catch(setErro)
  useEffect(() => { carregar() }, [])

  const porSaz = useMemo(() => Object.fromEntries(LISTA_SAZONALIDADES.map((s) => [s, (produtos ?? []).filter((p) => p.sazonalidade === s).sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.descricao_br.localeCompare(b.descricao_br))])) as Record<Sazonalidade, Produto[]>, [produtos])
  const errosForm = form ? validarCampanha(form) : []
  const semEstrutura = produtos !== null && produtos.length > 0 && produtos.every((p) => p.sazonalidade === undefined)

  async function salvar() {
    if (!form || errosForm.length) return
    setSalvando(true); setErro(null)
    try { await salvarCampanha(form); setForm(null); await carregar() } catch (e) { setErro(e) } finally { setSalvando(false) }
  }
  async function excluir(c: Campanha) {
    if (!window.confirm(`Excluir a campanha "${c.nome}"? Pedidos já feitos não mudam.`)) return
    try { await excluirCampanha(c.id); await carregar() } catch (e) { setErro(e) }
  }
  async function classificar(p: Produto, s: Sazonalidade | null) {
    setProdutos((ps) => ps!.map((x) => (x.sku === p.sku ? { ...x, sazonalidade: s } : x)))
    try { await salvarProduto(p.sku, { sazonalidade: s }) } catch (e) { setErro(e); carregar() }
  }

  if (!campanhas || !produtos) return erro ? <Erro erro={erro} /> : <Carregando />
  const grupos: SituacaoCampanha[] = ['aberta', 'agendada', 'encerrada']
  const candidatos = busca.trim().length >= 2
    ? produtos.filter((p) => !p.sazonalidade && (p.sku.includes(busca.trim()) || p.descricao_br.toLowerCase().includes(busca.trim().toLowerCase()) || (p.descricao_fr ?? '').toLowerCase().includes(busca.trim().toLowerCase()))).slice(0, 8)
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Campanhas sazonais</h1>
          <p className="text-sm text-tinta-3">Itens de <b>Páscoa</b> e <b>Natal</b> só aparecem para a França enquanto houver campanha aberta, e só para embarques dentro da janela da campanha.</p>
        </div>
        {!form && <button className="btn-primario" onClick={() => setForm(vazio())}>+ Nova campanha</button>}
      </div>
      {semEstrutura && <p className="rounded-md bg-alerta/10 p-3 text-sm text-alerta">O banco ainda não tem a estrutura de campanhas (migration 011). As telas já estão prontas; aplique a migration para começar a usar.</p>}
      {erro != null && <Erro erro={erro} />}

      {form && (
        <section className="cartao space-y-4 border-marca">
          <h2 className="font-semibold">{form.id ? 'Editar campanha' : 'Nova campanha'}</h2>
          <fieldset className="flex flex-wrap gap-2" aria-label="Subcategoria">
            {LISTA_SAZONALIDADES.map((s) => (
              <label key={s} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${form.sazonalidade === s ? 'border-marca bg-marca/10' : 'border-linha'}`}>
                <input type="radio" name="saz" checked={form.sazonalidade === s} onChange={() => setForm({ ...form, sazonalidade: s })} />
                <SeloSazonal s={s} /> <span className="text-tinta-3">{porSaz[s].filter((p) => p.ativo).length} itens ativos</span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block"><span className="rotulo">Nome</span>
              <input className="mt-1 w-full" value={form.nome} placeholder={`${SAZONALIDADES[form.sazonalidade].nome} ${new Date().getFullYear() + 1}`} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
            <label className="block"><span className="rotulo">Pedidos a partir de</span>
              <input type="date" className="mt-1 w-full" value={form.pedidos_de} onChange={(e) => setForm({ ...form, pedidos_de: e.target.value })} /></label>
            <label className="block"><span className="rotulo">Pedidos até</span>
              <input type="date" className="mt-1 w-full" value={form.pedidos_ate} onChange={(e) => setForm({ ...form, pedidos_ate: e.target.value })} /></label>
            <label className="block"><span className="rotulo">Embarques a partir de <span className="font-normal normal-case text-tinta-3">(opcional)</span></span>
              <input type="date" className="mt-1 w-full" value={form.embarque_de ?? ''} onChange={(e) => setForm({ ...form, embarque_de: e.target.value || null })} /></label>
            <label className="block"><span className="rotulo">Embarques até <span className="font-normal normal-case text-tinta-3">(opcional)</span></span>
              <input type="date" className="mt-1 w-full" value={form.embarque_ate ?? ''} onChange={(e) => setForm({ ...form, embarque_ate: e.target.value || null })} /></label>
            <label className="block"><span className="rotulo">Observação interna</span>
              <input className="mt-1 w-full" value={form.observacao ?? ''} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Ex.: alinhado com a França em 20/11" /></label>
          </div>
          <p className="text-xs text-tinta-3">A França vê a campanha e os itens de {SAZONALIDADES[form.sazonalidade].nome} entre as datas de pedido. Se a janela de embarque estiver preenchida, os itens só entram em pedidos com embarque dentro dela.</p>
          {errosForm.length > 0 && (form.nome || form.pedidos_ate) && <ul className="text-sm text-erro">{errosForm.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="flex gap-2">
            <button className="btn-primario" disabled={salvando || errosForm.length > 0} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar campanha'}</button>
            <button className="btn-secundario" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </section>
      )}

      {grupos.map((g) => {
        const lista = campanhas.filter((c) => situacaoCampanha(c, hojeL) === g)
        if (!lista.length && g !== 'aberta') return null
        return (
          <section key={g} className="space-y-2">
            <h2 className="font-semibold">{SITUACAO[g][0]}s <span className="text-sm font-normal text-tinta-3">({lista.length})</span></h2>
            {!lista.length ? <p className="cartao text-sm text-tinta-3">Nenhuma campanha aberta agora: os itens de Páscoa e Natal não aparecem para a França.</p> : (
              <div className="grid gap-3 md:grid-cols-2">
                {lista.map((c) => (
                  <article key={c.id} className={`cartao space-y-2 ${g === 'encerrada' ? 'opacity-75' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <SeloSazonal s={c.sazonalidade} />
                      <h3 className="flex-1 font-semibold">{c.nome}</h3>
                      <span className={`pill ${SITUACAO[g][1]}`}>{SITUACAO[g][0]}</span>
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                      <dt className="text-tinta-3">Pedidos</dt><dd>{fmtData(c.pedidos_de)} a {fmtData(c.pedidos_ate)}</dd>
                      <dt className="text-tinta-3">Embarques</dt><dd>{c.embarque_de || c.embarque_ate ? `${c.embarque_de ? fmtData(c.embarque_de) : 'qualquer data'} a ${c.embarque_ate ? fmtData(c.embarque_ate) : 'sem limite'}` : 'qualquer data'}</dd>
                      <dt className="text-tinta-3">Itens</dt><dd>{porSaz[c.sazonalidade].filter((p) => p.ativo).length} ativos de {SAZONALIDADES[c.sazonalidade].nome}</dd>
                      {c.observacao && <><dt className="text-tinta-3">Obs.</dt><dd>{c.observacao}</dd></>}
                    </dl>
                    <div className="flex gap-3 text-sm">
                      <button className="underline" onClick={() => setForm({ ...c })}>Editar</button>
                      <button className="text-erro underline" onClick={() => excluir(c)}>Excluir</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )
      })}

      <section className="cartao space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Itens sazonais</h2>
            <p className="text-sm text-tinta-3">Quem está em cada subcategoria. Também dá para ajustar pela tabela mestre (coluna "Sazonal") ou no Portfólio.</p>
          </div>
          <div className="relative">
            <input className="w-72" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Incluir item: buscar SKU ou nome" aria-label="Buscar item para incluir" />
            {candidatos.length > 0 && (
              <ul className="absolute right-0 z-10 mt-1 w-[28rem] max-w-[90vw] rounded-md border border-linha bg-cartao p-1 shadow-lg">
                {candidatos.map((p) => (
                  <li key={p.sku} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-fundo">
                    <span className="flex-1"><span className="font-mono text-xs">{p.sku}</span> {p.descricao_br}</span>
                    {LISTA_SAZONALIDADES.map((s) => <button key={s} className="text-xs underline" onClick={() => { classificar(p, s); setBusca('') }}>+ {SAZONALIDADES[s].nome}</button>)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {LISTA_SAZONALIDADES.map((s) => (
            <div key={s}>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><SeloSazonal s={s} /> {porSaz[s].filter((p) => p.ativo).length} ativos · {porSaz[s].length} no total</h3>
              <div className="max-h-96 overflow-auto rounded-md border border-linha">
                <table className="grade">
                  <thead><tr><th>SKU</th><th>Produto</th><th>Família</th><th></th></tr></thead>
                  <tbody>
                    {porSaz[s].map((p) => (
                      <tr key={p.sku} className={p.ativo ? '' : 'text-tinta-3'}>
                        <td className="font-mono text-xs">{p.sku}</td>
                        <td className="text-sm">{p.descricao_br}{!p.ativo && <span className="ml-1 text-xs">(inativo)</span>}</td>
                        <td className="text-xs">{p.familia}</td>
                        <td><button className="text-xs text-erro underline" onClick={() => classificar(p, null)} title="Volta a ser item regular (sempre disponível)">tirar</button></td>
                      </tr>
                    ))}
                    {!porSaz[s].length && <tr><td colSpan={4} className="text-center text-sm text-tinta-3">Nenhum item.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
