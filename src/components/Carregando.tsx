export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <p className="p-6 text-sm text-tinta-3" role="status">{texto}</p>
}
export function Erro({ erro }: { erro: unknown }) {
  const msg = erro instanceof Error ? erro.message : String(erro)
  return <p className="rounded-md bg-erro/10 p-3 text-sm text-erro" role="alert">{msg}</p>
}
