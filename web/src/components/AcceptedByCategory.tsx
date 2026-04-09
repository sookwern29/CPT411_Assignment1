import type { AcceptedItem, CategoryColorMap } from '../types'

type Props = {
  acceptedByCategory: Record<string, AcceptedItem[]>
  colors: CategoryColorMap
}

export function AcceptedByCategory({ acceptedByCategory, colors }: Props) {
  const categories = Object.keys(colors)

  return (
    <div className="accepted">
      {categories.map((cat) => {
        const items = acceptedByCategory?.[cat] ?? []
        return (
          <div key={cat} className="acceptedCat">
            <div className="acceptedCat__header">
              <span className="swatch" style={{ background: colors[cat] }} />
              <span className="acceptedCat__title">{cat}</span>
              <span className="acceptedCat__meta">{items.length} unique</span>
            </div>

            {items.length === 0 ? (
              <div className="muted">No accepted words in this category.</div>
            ) : (
              <div className="table">
                <div className="table__head">
                  <div>Word</div>
                  <div className="num">Count</div>
                  <div>Categories</div>
                </div>
                {items.map((it) => (
                  <div className="table__row" key={`${cat}:${it.word}`}>
                    <div className="mono">{it.word}</div>
                    <div className="num mono">{it.count}</div>
                    <div className="muted">{it.categories.join(', ')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

