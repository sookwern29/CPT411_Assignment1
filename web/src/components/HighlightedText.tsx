import type { CategoryColorMap, Highlight } from '../types'

type Props = {
  text: string
  highlights: Highlight[]
  colors: CategoryColorMap
  selected?: Highlight | null
  onSelectToken?: (t: { original: string; lower: string; start: number; end: number; highlight?: Highlight }) => void
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

export function HighlightedText({ text, highlights, colors, selected = null, onSelectToken }: Props) {
  if (!text) return <div className="muted">No text.</div>

  const hlBySpan = new Map<string, Highlight>()
  for (const h of highlights ?? []) hlBySpan.set(`${h.start}:${h.end}`, h)

  type Part =
    | { key: string; kind: 'text'; value: string }
    | { key: string; kind: 'word'; value: string; start: number; end: number; highlight?: Highlight }

  const parts: Part[] = []
  const re = /[A-Za-z]+/g
  let i = 0
  while (i < text.length) {
    re.lastIndex = i
    const m = re.exec(text)
    if (!m || m.index > i) {
      const end = m ? m.index : text.length
      parts.push({ key: `t:${i}-${end}`, kind: 'text', value: text.slice(i, end) })
      i = end
      continue
    }

    const start = m.index
    const end = start + m[0].length
    const h = hlBySpan.get(`${start}:${end}`)
    parts.push({ key: `w:${start}-${end}`, kind: 'word', value: m[0], start, end, highlight: h })
    i = end
  }

  return (
    <div className="highlightWrap">
      <div className="highlightText" aria-label="Highlighted input text">
        {parts.map((p) => {
          if (p.kind === 'text') return <span key={p.key}>{p.value}</span>

          const cats = p.highlight?.categories ?? []
          const bg = p.highlight ? gradientFor(cats, colors) : 'transparent'
          const isSelected = selected?.start === p.start && selected?.end === p.end
          const title = p.highlight ? `${p.value} — ${cats.join(', ')}` : `${p.value} — not accepted`
          return (
            <button
              key={p.key}
              type="button"
              className={`hl hl--button${isSelected ? ' hl--selected' : ''}${p.highlight ? '' : ' hl--plain'}`}
              style={{ background: bg }}
              title={title}
              onClick={() =>
                onSelectToken?.({
                  original: p.value,
                  lower: p.value.toLowerCase(),
                  start: p.start,
                  end: p.end,
                  highlight: p.highlight,
                })
              }
            >
              {p.value}
            </button>
          )
        })}
      </div>
    </div>
  )
}

