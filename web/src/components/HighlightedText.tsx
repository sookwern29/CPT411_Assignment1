import type { CategoryColorMap, Highlight } from '../types'

type Props = {
  text: string
  highlights: Highlight[]
  colors: CategoryColorMap
}

function gradientFor(categories: string[], colors: CategoryColorMap): string {
  const cs = categories.map((c) => colors[c]).filter(Boolean)
  if (cs.length === 0) return 'transparent'
  if (cs.length === 1) return cs[0]
  const step = 100 / cs.length
  const stops = cs
    .map((c, i) => {
      const a = i * step
      const b = (i + 1) * step
      return `${c} ${a}%, ${c} ${b}%`
    })
    .join(', ')
  return `linear-gradient(90deg, ${stops})`
}

export function HighlightedText({ text, highlights, colors }: Props) {
  if (!text) return <div className="muted">No text.</div>

  const parts: Array<{ key: string; value: string; hl?: Highlight }> = []
  let prev = 0
  for (const h of highlights ?? []) {
    if (h.start > prev) {
      parts.push({ key: `t:${prev}-${h.start}`, value: text.slice(prev, h.start) })
    }
    parts.push({ key: `h:${h.start}-${h.end}`, value: text.slice(h.start, h.end), hl: h })
    prev = h.end
  }
  if (prev < text.length) parts.push({ key: `t:${prev}-${text.length}`, value: text.slice(prev) })

  return (
    <div className="highlightWrap">
      <div className="highlightText" aria-label="Highlighted input text">
        {parts.map((p) => {
          if (!p.hl) return <span key={p.key}>{p.value}</span>
          const cats = p.hl.categories ?? []
          const bg = gradientFor(cats, colors)
          return (
            <span
              key={p.key}
              className="hl"
              style={{ background: bg }}
              title={`${p.value} — ${cats.join(', ')}`}
            >
              {p.value}
            </span>
          )
        })}
      </div>
    </div>
  )
}

