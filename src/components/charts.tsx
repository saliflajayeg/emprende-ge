import { moneyPlain } from '../lib/format'

// Gráfico de barras emparejadas (ingresos vs gastos por mes) — SVG puro, sin dependencias.
export function CashFlowChart({
  data,
}: {
  data: { label: string; income: number; expense: number }[]
}) {
  const W = 640
  const H = 240
  const padX = 36
  const padY = 24
  const innerW = W - padX * 2
  const innerH = H - padY * 2
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)))
  const groupW = innerW / data.length
  const barW = Math.min(22, groupW / 3)

  const yFor = (v: number) => padY + innerH - (v / max) * innerH

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label="Flujo de caja">
        {/* Líneas de referencia */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padY + innerH - t * innerH
          return (
            <g key={t}>
              <line x1={padX} y1={y} x2={W - padX} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padX - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
                {moneyPlain(max * t)}
              </text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const gx = padX + i * groupW
          const cx = gx + groupW / 2
          return (
            <g key={i}>
              <rect
                x={cx - barW - 2}
                y={yFor(d.income)}
                width={barW}
                height={padY + innerH - yFor(d.income)}
                fill="#0d9488"
                rx={2}
              />
              <rect
                x={cx + 2}
                y={yFor(d.expense)}
                width={barW}
                height={padY + innerH - yFor(d.expense)}
                fill="#ef4444"
                rx={2}
              />
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill="#64748b">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-teal-600" /> Ingresos
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-red-500" /> Gastos
        </span>
      </div>
    </div>
  )
}

// Gráfico de anillo (donut) para desglose por categoría.
export function DonutChart({
  data,
  size = 180,
}: {
  data: { name: string; amount: number; color: string }[]
  size?: number
}) {
  const total = data.reduce((s, d) => s + d.amount, 0)
  const r = size / 2
  const stroke = size * 0.22
  const radius = r - stroke / 2
  const circ = 2 * Math.PI * radius
  let offset = 0

  if (total === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height: size }}>
        Sin datos todavía
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${r} ${r})`}>
          {data.map((d, i) => {
            const frac = d.amount / total
            const len = frac * circ
            const el = (
              <circle
                key={i}
                cx={r}
                cy={r}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
              />
            )
            offset += len
            return el
          })}
        </g>
        <text x={r} y={r} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} fill="#0f172a">
          {moneyPlain(total)}
        </text>
      </svg>
      <ul className="space-y-1 text-sm">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: d.color }} />
            <span className="text-slate-600">{d.name}</span>
            <span className="ml-auto font-medium text-slate-800">{moneyPlain(d.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
