import { useEffect, useMemo, useState } from 'react'
import { Graphviz } from '@hpcc-js/wasm'
import type { TraceStep } from '../types'

function escapeDotLabel(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function dotForTrace(traceSteps: TraceStep[], accepted: boolean): string {
  const lines: string[] = []
  lines.push('digraph DFAPath {')
  lines.push('  rankdir=LR;')
  lines.push('  bgcolor="transparent";')
  lines.push('  graph [pad="0.2", nodesep="0.35", ranksep="0.45"];')
  lines.push(
    '  node [shape=box, style="rounded,filled", fontname="Inter, Segoe UI, Arial", fontsize=12, color="#0f172a22", fillcolor="#ffffff"];',
  )
  lines.push('  edge [fontname="ui-monospace, Consolas, Menlo, monospace", fontsize=12, color="#2563eb", fontcolor="#0f172a"];')

  lines.push('  q0 [label="q0\\n(start)", fillcolor="#e0f2fe", color="#0284c7"];')

  for (let i = 0; i < traceSteps.length; i++) {
    const s = traceSteps[i]
    const from = `q${s.from}`
    const isTrap = s.trap || s.to === -1
    const to = isTrap ? 'TRAP' : `q${s.to}`
    const isLast = i === traceSteps.length - 1

    if (isTrap) {
      lines.push('  TRAP [shape=octagon, style="filled", fillcolor="#ffe4e6", color="#e11d48", fontcolor="#9f1239", penwidth=2];')
      lines.push(`  ${from} [fillcolor="#2563eb", color="#1d4ed8", fontcolor="white", style="rounded,filled"];`)
      lines.push(`  ${from} -> TRAP [label="${escapeDotLabel(s.ch)}", color="#e11d48", fontcolor="#e11d48", penwidth=2];`)
      break
    }

    if (isLast) {
      // Final state: accept → double ring; reject → orange/amber
      if (accepted) {
        lines.push(`  ${to} [label="${to}", fillcolor="#dcfce7", color="#16a34a", penwidth=2.5, style="rounded,filled"];`)
        // Simulate double ring with a peripheries attribute
        lines.push(`  ${to} [peripheries=2];`)
      } else {
        lines.push(`  ${to} [label="${to}", fillcolor="#fef3c7", color="#d97706", fontcolor="#92400e", penwidth=2, style="rounded,filled"];`)
      }
    } else {
      lines.push(`  ${to} [label="${to}", fillcolor="#ecfdf5", color="#10b981"];`)
    }
    lines.push(`  ${from} -> ${to} [label="${escapeDotLabel(s.ch)}"];`)
  }

  lines.push('}')
  return lines.join('\n')
}

export function TraceGraphviz({ traceSteps, accepted }: { traceSteps: TraceStep[]; accepted: boolean }) {
  const dot = useMemo(() => dotForTrace(traceSteps, accepted), [traceSteps, accepted])
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
        setSvg(null)
        const gv = await Graphviz.load()
        const out = gv.layout(dot, 'svg', 'dot')
        if (!cancelled) setSvg(out)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to render graph')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dot])

  if (error) return <div className="error">{error}</div>
  if (!svg) return <div className="muted">Rendering graph…</div>

  return (
    <div
      className="traceGraph"
      aria-label="Per-token DFA subgraph (Graphviz)"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

