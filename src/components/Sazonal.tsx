import { SAZONALIDADES, type Campanha, type Sazonalidade } from '../dominio/campanhas'
import { idiomaAtual } from '../i18n/idioma'

export const nomeSazonalidade = (s: Sazonalidade) => (idiomaAtual() === 'fr' ? SAZONALIDADES[s].nomeFr : SAZONALIDADES[s].nome)

/** Nome da campanha: interno usa o nome cadastrado; em francês, "Pâques 2027". */
export const rotuloCampanha = (c: Campanha) =>
  idiomaAtual() === 'fr' ? `${SAZONALIDADES[c.sazonalidade].nomeFr} ${(c.embarque_de ?? c.pedidos_ate).slice(0, 4)}` : c.nome

export function SeloSazonal({ s, className = '' }: { s: Sazonalidade; className?: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${SAZONALIDADES[s].cor} ${className}`}>{nomeSazonalidade(s)}</span>
}
