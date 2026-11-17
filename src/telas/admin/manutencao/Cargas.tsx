import { Fragment, useEffect, useState } from 'react'
import { baseDaTabela } from '../../../manutencao/bases'
import { desfazerCarga, linhasDaCarga, listarCargas, nomesUsuarios, type Carga, type LinhaCarga } from '../../../dados/manutencao'
import { Carregando, Erro } from '../../../components/Carregando'
import { fmtDataHora, fmtNum } from '../../../lib/formatos'
import { Diferencas, Etiqueta, nomeTabela, rotuloChave } from './comum'

export function Cargas({ destaque }: { destaque?: number }) {
  const [cargas, setCargas] = useState<Carga[] | null>(null)
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<unknown>(null)
  const [aberta, setAberta] = useState<number | null>(destaque ?? null)
  const [linhas, setLinhas] = useState<Record<number, LinhaCarga[]>>({})
  const [desfazendo, setDesfazendo] = useState<number | null>(null)

  const carregar = () => listarCargas().then(setCargas).catch(setErro)
  useEffect(() => { carregar(); nomesUsuarios().then(setNomes).catch(() => {}) }, [])
  useEffect(() => { if (aberta && !linhas[aberta]) linhasDaCarga(aberta).then((l) => setLinhas((x) => ({ ...x, [aberta]: l }))).catch(setErro) }, [aberta, linhas])

  async function desfazer(c: Carga) {
    if (!window.confirm(`Desfazer a carga nº ${c.id} (${nomeTabela(c.tabela)})?\n\nOs registros voltam exatamente como estavam antes dela. Edições manuais feitas depois nesses registros também serão revertidas.`)) return
    setDesfazendo(c.id); setErro(null)
    try { await desfazerCarga(c.id); await carregar() } catch (e) { setErro(e) } finally { setDesfazendo(null) }
  }

  if (!cargas) return erro ? <Erro erro={erro} /> : <Carregando />
  // Pode desfazer: a carga ativa mais recente de cada tabela
  const desfazivel = new Set<number>()
  const vistas = new Set<string>()
  for (const c of cargas) { if (c.desfeita_em || vistas.has(c.tabela)) { if (!c.desfeita_em) vistas.add(c.tabela); continue } desfazivel.add(c.id); vistas.add(c.tabela) }

  return (
    <div className="space-y-3">
      {erro != null && <Erro erro={erro} />}
      {destaque && <p className="rounded-md bg-ok/10 p-3 text-sm text-ok">Carga nº {destaque} gravada com sucesso.</p>}
      {!cargas.length ? <p className="cartao text-sm text-tinta-3">Nenhuma carga feita pelo portal ainda.</p> : (
        <div className="cartao overflow-x-auto p-0">
          <table className="grade">
            <thead><tr><th>Nº</th><th>Data</th><th>Base</th><th>Modo</th><th>Arquivo</th><th>Por</th><th className="text-right">Novos</th><th className="text-right">Alterados</th><th className="text-right">Removidos</th><th className="text-right">Sem mudança</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {cargas.map((c) => (
                <Fragment key={c.id}>
                  <tr className={c.desfeita_em ? 'text-tinta-3' : ''}>
                    <td className="font-mono">{c.id}</td>
                    <td className="whitespace-nowrap">{fmtDataHora(c.criado_em)}</td>
                    <td>{nomeTabela(c.tabela)}</td>
                    <td className="text-xs">{c.modo}</td>
                    <td className="max-w-48 truncate text-xs" title={[c.arquivo, c.observacao].filter(Boolean).join(' — ')}>{c.arquivo}{c.observacao && <span className="block text-tinta-3">{c.observacao}</span>}</td>
                    <td className="text-xs">{c.usuario ? nomes[c.usuario] ?? '—' : '—'}</td>
                    <td className="text-right">{fmtNum(c.novos)}</td>
                    <td className="text-right">{fmtNum(c.alterados)}</td>
                    <td className="text-right">{fmtNum(c.removidos)}</td>
                    <td className="text-right text-tinta-3">{fmtNum(c.iguais)}</td>
                    <td className="whitespace-nowrap text-xs">{c.desfeita_em ? `Desfeita ${fmtDataHora(c.desfeita_em)}${c.desfeita_por && nomes[c.desfeita_por] ? ` por ${nomes[c.desfeita_por]}` : ''}` : <span className="font-semibold text-ok">Aplicada</span>}</td>
                    <td className="whitespace-nowrap">
                      <button className="btn-secundario !px-2 !py-1 text-xs" onClick={() => setAberta(aberta === c.id ? null : c.id)} aria-expanded={aberta === c.id}>{aberta === c.id ? 'Fechar' : 'Ver linhas'}</button>{' '}
                      {desfazivel.has(c.id) && <button className="btn-secundario !px-2 !py-1 text-xs text-erro" disabled={desfazendo === c.id} onClick={() => desfazer(c)}>{desfazendo === c.id ? 'Desfazendo…' : 'Desfazer'}</button>}
                    </td>
                  </tr>
                  {aberta === c.id && (
                    <tr><td colSpan={12} className="bg-fundo">
                      {!linhas[c.id] ? <Carregando /> : !linhas[c.id].length ? <p className="p-2 text-sm text-tinta-3">Nenhuma linha mudou nesta carga.</p> : (
                        <div className="max-h-96 overflow-auto rounded-md border border-linha bg-cartao">
                          <table className="grade">
                            <thead><tr><th>Chave</th><th>Ação</th><th>O que mudou</th></tr></thead>
                            <tbody>
                              {linhas[c.id].map((l) => (
                                <tr key={l.id}>
                                  <td className="font-mono text-xs">{rotuloChave(l.chave)}</td>
                                  <td><Etiqueta acao={l.acao} /></td>
                                  <td><Diferencas base={baseDaTabela(c.tabela)} itens={diffs(l)} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-tinta-3">Só a carga mais recente de cada base pode ser desfeita (para não desmanchar cargas posteriores). Para voltar mais, desfaça uma por uma, da mais nova para a mais antiga.</p>
    </div>
  )
}

const OCULTOS = new Set(['atualizado_em', 'importado_em'])
function diffs(l: LinhaCarga) {
  const chaves = new Set(Object.keys(l.chave))
  if (l.acao === 'removido') return Object.entries(l.antes ?? {}).filter(([k, v]) => !chaves.has(k) && !OCULTOS.has(k) && v !== null).map(([campo, antes]) => ({ campo, antes, depois: null }))
  const a = l.antes ?? {}, d = l.depois ?? {}
  return Object.keys(d).filter((k) => !chaves.has(k) && !OCULTOS.has(k) && JSON.stringify(a[k] ?? null) !== JSON.stringify(d[k] ?? null)).map((campo) => ({ campo, antes: a[campo] ?? null, depois: d[campo] }))
}
