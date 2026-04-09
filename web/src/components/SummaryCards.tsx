import type { CategoryColorMap } from '../types'

type Props = {
  totalTokens: number
  acceptedTokens: number
  categoryTokenCounts: Record<string, number>
  colors: CategoryColorMap
}

function LegendItem({ name, count, color }: { name: string; count: number; color: string }) {
  return (
    <div className="legendItem">
      <span className="swatch" style={{ background: color }} />
      <span className="legendName">{name}</span>
      <span className="legendCount">{count}</span>
    </div>
  )
}

export function SummaryCards({ totalTokens, acceptedTokens, categoryTokenCounts, colors }: Props) {
  const categories = Object.keys(colors)

  return (
    <div className="summary">
      <div className="summaryCards">
        <div className="metric">
          <div className="metric__label">Total tokens</div>
          <div className="metric__value">{totalTokens}</div>
        </div>
        <div className="metric">
          <div className="metric__label">Accepted tokens</div>
          <div className="metric__value">{acceptedTokens}</div>
        </div>
      </div>

      <div className="legend">
        <div className="legend__title">Occurrences by Category</div>
        <div className="legendGrid">
          {categories.map((c) => (
            <LegendItem key={c} name={c} count={categoryTokenCounts?.[c] ?? 0} color={colors[c]} />
          ))}
        </div>
      </div>
    </div>
  )
}

