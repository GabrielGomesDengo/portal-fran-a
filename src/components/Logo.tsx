import logo from '../assets/logo-dengo.png'
export function Logo({ tamanho = 40, className = '' }: { tamanho?: number; className?: string }) {
  return <img src={logo} alt="Dengo" width={tamanho} height={Math.round(tamanho * 168 / 183)} className={`rounded-md ${className}`} />
}
