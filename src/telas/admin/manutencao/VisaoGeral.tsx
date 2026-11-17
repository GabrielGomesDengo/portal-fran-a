import { useEffect, useState } from 'react'
import { BASES, baseDoId, pendenciasCadastro, type Base, type Pendencia } from '../../../manutencao/bases'
import { baixarModelo } from '../../../manutencao/excel'
import { lerTabela, resumoBases, type ResumoBase } from '../../../dados/manutencao'
import { listarProdutos } from '../../../dados/produtos'
import { Carregando, Erro } from '../../../components/Carregando'
import { fmtDataHora, fmtNum } from '../../../lib/formatos'

export function VisaoGeral({ onImportar }: { onImportar: (baseId: string) => void }) {
  const [resumo, setResumo] = useState<ResumoBase[] | null>(null)
  const [pend, setPend] = useState<Pendencia[] | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  const [baixando, setBaixando] = useState<string | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)

  useEffect(() => {
    resumoBases().then(setResumo).catch(setErro)
    listarProdutos().then((ps) => setPend(pendenciasCadastro(ps))).catch(setErro)
  }, [])

  async function baixarBase(base: Base) {
    setBaixando(base.id)
    try { await baixarModelo(base, await lerTabela(base)) } catch (e) { setErro(e) } finally { setBaixando(null) }
  }
  async function baixarPendencia(p: Pendencia) {
    const prod = baseDoId('produtos')!
    const campos = new Set(['sku', 'descricao_br', 'familia', ...p.campos])
    const recorte: Base = { ...prod, colunas: prod.colunas.filter((c) => campos.has(c.campo)) }
    await baixarModelo(recorte, p.skus, `corrigir_${p.id}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (erro) return <Erro erro={erro} />
  if (!resumo || !pend) return <Carregando />
  const totalPend = pend.reduce((s, p) => s + p.skus.length, 0)

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Bases</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BASES.map((b) => {
            const r = resumo.find((x) => x.tabela === b.tabela)
            return (
              <article key={b.id} className="cartao flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{b.nome}</h3>
                  <span className="rounded-full bg-fundo px-2 py-0.5 text-xs font-semibold">{fmtNum(r?.linhas ?? 0)} registros</span>
                </div>
                <p className="text-sm text-tinta-2">{b.descricao}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-tinta-3">
                  <dt>Última carga</dt><dd className="text-tinta-2">{r?.ultima_carga ? `${fmtDataHora(r.ultima_carga)} · nº ${r.ultima_carga_id}` : 'nenhuma pelo portal'}</dd>
                  <dt>Origem</dt><dd>{b.origemSugerida}</dd>
                  <dt>Frequência</dt><dd>{b.frequencia}</dd>
                  <dt>Modo</dt><dd>{b.modos.map((m) => (m === 'substituir' ? 'substituir (foto)' : 'atualizar')).join(' ou ')}</dd>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <button className="btn-primario !py-1.5" onClick={() => onImportar(b.id)}>Importar</button>
                  <button className="btn-secundario !py-1.5" disabled={baixando === b.id} onClick={() => baixarBase(b)}>{baixando === b.id ? 'Gerando…' : 'Baixar base atual'}</button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="cartao">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Saúde do cadastro <span className="text-sm font-normal text-tinta-3">· SKUs ativos no portfólio</span></h2>
          <span className={`text-sm font-semibold ${totalPend ? 'text-alerta' : 'text-ok'}`}>{totalPend ? `${fmtNum(totalPend)} pendências` : 'Tudo em dia'}</span>
        </div>
        <p className="mb-3 text-sm text-tinta-3">Baixe a lista de uma pendência, preencha os campos que faltam e suba de volta em <b>Importar → Produtos</b>.</p>
        <ul className="divide-y divide-linha">
          {pend.map((p) => (
            <li key={p.id} className="py-2">
              <div className="flex flex-wrap items-center gap-3">
                <button className="flex flex-1 items-center gap-3 text-left" onClick={() => setAberta(aberta === p.id ? null : p.id)} disabled={!p.skus.length} aria-expanded={aberta === p.id}>
                  <span className={`w-12 rounded-md py-0.5 text-center text-sm font-bold ${p.skus.length ? 'bg-alerta/15 text-alerta' : 'bg-ok/15 text-ok'}`}>{p.skus.length}</span>
                  <span>
                    <span className="font-medium">{p.rotulo}</span>
                    <span className="block text-xs text-tinta-3">{p.dica}</span>
                  </span>
                </button>
                {p.skus.length > 0 && <button className="btn-secundario !py-1 text-xs" onClick={() => baixarPendencia(p)}>Baixar para corrigir</button>}
              </div>
              {aberta === p.id && (
                <div className="mt-2 max-h-64 overflow-auto rounded-md border border-linha">
                  <table className="grade">
                    <thead><tr><th>SKU</th><th>Descrição</th><th>Família</th></tr></thead>
                    <tbody>{p.skus.map((s) => <tr key={s.sku}><td className="font-mono">{s.sku}</td><td>{s.descricao_br}</td><td className="text-xs">{String(s.familia ?? '')}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
