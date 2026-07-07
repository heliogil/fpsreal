interface PriceTagProps {
  price_brl: number
  merchant?: string
  in_stock?: boolean
  size?: 'sm' | 'md' | 'lg'
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PriceTag({
  price_brl,
  merchant,
  in_stock = true,
  size = 'md',
}: PriceTagProps) {
  const sizeClass =
    size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg'

  return (
    <div className="flex flex-col gap-0.5">
      <span className={`num-mono font-semibold ${sizeClass}`}>
        {formatBRL(price_brl)}
      </span>
      <div className="flex items-center gap-2 text-xs text-secondary">
        {merchant && <span>em {merchant}</span>}
        {in_stock ? (
          <span style={{ color: 'var(--accent-blue)' }}>· em estoque</span>
        ) : (
          <span style={{ color: 'var(--accent-red)' }}>· indisponível</span>
        )}
      </div>
    </div>
  )
}