import { useCallback, useEffect, useRef, useState } from 'react'
import { Graphviz } from '@hpcc-js/wasm'

const API_BASE = 'http://127.0.0.1:8000'

type FullDFAData = {
  word: string
  original: string
  accepted: boolean
  hit_trap: boolean
  num_states: number
  trace_states: number[]
  trace_edges: Array<{ from: number; to: number; ch: string }>
  all_transitions: Array<{ from: number; to: number; ch: string }>
  accept_info: Record<string, string>
}

type Transform = { x: number; y: number; scale: number }

// ── DOT helpers ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Read the actual transform currently applied to the DOM element (mid-CSS-transition safe). */
function getActualTransform(el: HTMLElement): Transform {
  const m = new DOMMatrixReadOnly(window.getComputedStyle(el).transform)
  // m.a = scaleX, m.d = scaleY (equal for uniform scale), m.e = tx, m.f = ty
  return { x: m.e, y: m.f, scale: m.a }
}

/**
 * Returns the visually visible height of `el` by intersecting its bounding rect
 * with the browser viewport AND any overflow:hidden ancestors.
 * This is necessary because the canvas getBoundingClientRect().height can be larger
 * than what is actually visible (e.g. 1360px when the modal clips it to ~343px).
 */
function getVisibleHeight(el: HTMLElement): number {
  const bcrEl = el.getBoundingClientRect()
  // Start with the viewport clip
  let clippedTop = Math.max(bcrEl.top, 0)
  let clippedBottom = Math.min(bcrEl.bottom, window.innerHeight)
  // Also tighten against any overflow:hidden ancestors
  let parent = el.parentElement
  while (parent && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent)
    if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
      const pr = parent.getBoundingClientRect()
      clippedTop = Math.max(clippedTop, pr.top)
      clippedBottom = Math.min(clippedBottom, pr.bottom)
    }
    parent = parent.parentElement
  }
  return Math.max(200, clippedBottom - clippedTop)
}

function computeFit(svgStr: string, cw: number, ch: number): Transform | null {
  const wm = svgStr.match(/width="([\d.]+)pt"/)
  const hm = svgStr.match(/height="([\d.]+)pt"/)
  if (!wm || !hm) return null
  const sw = parseFloat(wm[1]) * 1.3333
  const sh = parseFloat(hm[1]) * 1.3333
  const scale = Math.min(cw / sw, ch / sh) * 0.92
  return {
    x: Math.max(0, (cw - sw * scale) / 2),
    // Place near top (8% down) rather than vertical-centering.
    // For a 1360px container this gives y≈109; for 520px gives y≈42.
    y: Math.max(10, ch * 0.08),
    scale,
  }
}

/**
 * Build a DOT graph with NEUTRAL colors for every node/edge.
 * All animation highlighting is done via SVG DOM manipulation — NOT in the DOT.
 * This means the graph is rendered only once per word.
 */
function buildFullDot(data: FullDFAData): string {
  const { all_transitions, accept_info, hit_trap, trace_edges } = data

  const allNodeIds = new Set<number>([0])
  for (const t of all_transitions) {
    allNodeIds.add(t.from)
    allNodeIds.add(t.to)
  }

  const lines: string[] = []
  lines.push('digraph FullDFA {')
  lines.push('  rankdir=TB;')
  lines.push('  bgcolor="transparent";')
  lines.push('  graph [pad="0.4", nodesep="0.18", ranksep="0.5"];')
  lines.push('  node [fontname="Arial", fontsize=7, width=0.55, height=0.55, fixedsize=true];')
  lines.push('  edge [fontname="Courier", fontsize=7, arrowsize=0.45, color="#e2e8f0", fontcolor="#cbd5e1"];')

  for (const s of allNodeIds) {
    const isAccept = accept_info[String(s)] !== undefined
    const acceptWord = accept_info[String(s)]
    const isStart = s === 0
    let label = isStart ? 'q0\\n(start)' : `q${s}`
    if (isAccept && acceptWord) label += `\\n(${esc(acceptWord)})`
    const shape = isAccept ? 'doublecircle' : 'circle'
    // All nodes start gray/green; animation will change colors as steps progress
    const fillColor = isAccept ? '#f0fdf4' : '#f8fafc'
    const strokeColor = isAccept ? '#86efac' : '#e2e8f0'
    const fontColor = isAccept ? '#166534' : '#94a3b8'
    const penWidth = isAccept ? 1 : 0.6
    lines.push(
      `  q${s} [label="${label}", shape=${shape}, style=filled, fillcolor="${fillColor}", color="${strokeColor}", fontcolor="${fontColor}", penwidth=${penWidth}];`,
    )
  }

  if (hit_trap) {
    const trapEdge = trace_edges[trace_edges.length - 1]
    lines.push(
      '  TRAP [label="TRAP", shape=octagon, style=filled, fillcolor="#fff1f2",' +
        ' color="#fecdd3", fontcolor="#fca5a5", fontsize=8, width=0.55, height=0.55, fixedsize=true];',
    )
    if (trapEdge) {
      lines.push(
        `  q${trapEdge.from} -> TRAP [label="${esc(trapEdge.ch)}", color="#fecdd3", fontcolor="#fca5a5"];`,
      )
    }
  }

  for (const t of all_transitions) {
    lines.push(`  q${t.from} -> q${t.to} [label="${esc(t.ch)}"];`)
  }

  lines.push('}')
  return lines.join('\n')
}

// ── SVG DOM manipulation ───────────────────────────────────────────────────

function buildNodeCache(root: Element): Map<string, Element> {
  const cache = new Map<string, Element>()
  for (const g of root.querySelectorAll('g.node')) {
    const title = g.querySelector('title')?.textContent?.trim()
    if (title) cache.set(title, g)
  }
  return cache
}

function buildEdgeCache(root: Element): Map<string, Element> {
  const cache = new Map<string, Element>()
  for (const g of root.querySelectorAll('g.edge')) {
    const title = g.querySelector('title')?.textContent?.trim()
    if (title) cache.set(title, g)
  }
  return cache
}

/**
 * Extract each node's centre in SVG viewport coordinate space using getCTM(),
 * which correctly accounts for all ancestor transforms (e.g. the Graphviz root
 * <g class="graph" transform="... translate(X Y)"> offset).
 * Returns coordinates in SVG user units (= pt for Graphviz output).
 */
function buildNodePositionCache(root: Element): Map<string, { x: number; y: number }> {
  const cache = new Map<string, { x: number; y: number }>()
  const svgEl = root.querySelector('svg') as SVGSVGElement | null
  if (!svgEl) return cache
  for (const g of root.querySelectorAll('g.node')) {
    const title = g.querySelector('title')?.textContent?.trim()
    if (!title) continue
    const ellipse = g.querySelector('ellipse') as SVGEllipseElement | null
    if (ellipse) {
      const ctm = (ellipse as SVGGraphicsElement).getCTM()
      if (ctm) {
        const pt = svgEl.createSVGPoint()
        pt.x = ellipse.cx.baseVal.value
        pt.y = ellipse.cy.baseVal.value
        const gp = pt.matrixTransform(ctm)
        cache.set(title, { x: gp.x, y: gp.y })
      }
      continue
    }
    // Fallback for polygon shapes (TRAP octagon)
    const polygon = g.querySelector('polygon') as SVGPolygonElement | null
    if (polygon) {
      const ctm = (polygon as SVGGraphicsElement).getCTM()
      if (ctm) {
        const bbox = (polygon as SVGGraphicsElement).getBBox()
        const pt = svgEl.createSVGPoint()
        pt.x = bbox.x + bbox.width / 2
        pt.y = bbox.y + bbox.height / 2
        const gp = pt.matrixTransform(ctm)
        cache.set(title, { x: gp.x, y: gp.y })
      }
    }
  }
  return cache
}

/**
 * Apply fill/stroke to all shape elements within a node group.
 * For doublecircle nodes: outer ellipse gets fill, inner gets fill=none.
 */
function styleNodeShapes(g: Element, fill: string, stroke: string, strokeWidth: string) {
  const ellipses = Array.from(g.querySelectorAll('ellipse'))
  const polygons = Array.from(g.querySelectorAll('polygon'))

  for (let i = 0; i < ellipses.length; i++) {
    const el = ellipses[i] as SVGElement
    el.style.fill = i === 0 ? fill : 'none'
    el.style.stroke = stroke
    el.style.strokeWidth = strokeWidth
    el.style.transition = 'fill 0.22s ease, stroke 0.22s ease, stroke-width 0.22s ease'
  }
  for (const el of polygons) {
    const s = el as SVGElement
    s.style.fill = fill
    s.style.stroke = stroke
    s.style.strokeWidth = strokeWidth
    s.style.transition = 'fill 0.22s ease, stroke 0.22s ease, stroke-width 0.22s ease'
  }
}

function styleNodeText(g: Element, color: string) {
  for (const el of g.querySelectorAll('text')) {
    const s = el as SVGElement
    s.style.fill = color
    s.style.transition = 'fill 0.22s ease'
  }
}

/** Apply fill/stroke to path + polygon (arrowhead) + label text of an edge group. */
function styleEdgeParts(g: Element, stroke: string, strokeWidth: string) {
  for (const el of g.querySelectorAll('path')) {
    const s = el as SVGElement
    s.style.stroke = stroke
    s.style.strokeWidth = strokeWidth
    s.style.transition = 'stroke 0.22s ease, stroke-width 0.22s ease'
  }
  for (const el of g.querySelectorAll('polygon')) {
    const s = el as SVGElement
    s.style.fill = stroke
    s.style.stroke = stroke
    s.style.transition = 'fill 0.22s ease, stroke 0.22s ease'
  }
  for (const el of g.querySelectorAll('text')) {
    const s = el as SVGElement
    s.style.fill = stroke === '#e2e8f0' ? '#cbd5e1' : stroke
    s.style.transition = 'fill 0.22s ease'
  }
}

type NodeStyle = 'base' | 'visited' | 'current' | 'accept_final' | 'reject_final' | 'trap_final'

function applyNodeStyle(g: Element, style: NodeStyle, isAccept: boolean) {
  switch (style) {
    case 'base':
      styleNodeShapes(g, isAccept ? '#f0fdf4' : '#f8fafc', isAccept ? '#86efac' : '#e2e8f0', isAccept ? '1' : '0.6')
      styleNodeText(g, isAccept ? '#166534' : '#94a3b8')
      break
    case 'visited':
      styleNodeShapes(g, '#dbeafe', '#93c5fd', '1.5')
      styleNodeText(g, '#1d4ed8')
      break
    case 'current':
      styleNodeShapes(g, '#2563eb', '#1d4ed8', '2.5')
      styleNodeText(g, 'white')
      break
    case 'accept_final':
      styleNodeShapes(g, '#059669', '#065f46', '3')
      styleNodeText(g, 'white')
      break
    case 'reject_final':
      styleNodeShapes(g, '#f59e0b', '#ca8a04', '2.5')
      styleNodeText(g, 'white')
      break
    case 'trap_final':
      styleNodeShapes(g, '#e11d48', '#9f1239', '2.5')
      styleNodeText(g, 'white')
      break
  }
}

/**
 * Applies animation state for the given step to the live SVG DOM.
 *   step 0 = at q0 (no edges taken yet)
 *   step k = after reading k characters; currentState = trace_states[k]
 */
function applyAnimStep(
  step: number,
  data: FullDFAData,
  nodeCache: Map<string, Element>,
  edgeCache: Map<string, Element>,
) {
  const totalSteps = data.trace_states.length - 1
  const isFinished = step >= totalSteps

  // ── Reset all trace nodes and edges to their base color ──────────────────
  for (const s of data.trace_states) {
    if (s === -1) continue
    const g = nodeCache.get(`q${s}`)
    if (g) applyNodeStyle(g, 'base', data.accept_info[String(s)] !== undefined)
  }
  if (data.hit_trap) {
    const g = nodeCache.get('TRAP')
    if (g) {
      styleNodeShapes(g, '#fff1f2', '#fecdd3', '0.6')
      styleNodeText(g, '#fca5a5')
    }
  }
  for (const e of data.trace_edges) {
    const key = e.to === -1 ? `q${e.from}->TRAP` : `q${e.from}->q${e.to}`
    const g = edgeCache.get(key)
    if (g) styleEdgeParts(g, '#e2e8f0', '0.6')
  }

  // ── Mark visited states (trace_states[0..step-1]) ────────────────────────
  for (let i = 0; i < step; i++) {
    const s = data.trace_states[i]
    if (s !== -1) {
      const g = nodeCache.get(`q${s}`)
      if (g) applyNodeStyle(g, 'visited', false)
    }
  }

  // ── Mark visited edges (trace_edges[0..step-2]) ──────────────────────────
  for (let i = 0; i < step - 1; i++) {
    const e = data.trace_edges[i]
    const key = e.to === -1 ? `q${e.from}->TRAP` : `q${e.from}->q${e.to}`
    const g = edgeCache.get(key)
    if (g) styleEdgeParts(g, '#93c5fd', '1.5')
  }

  // ── Mark current state ───────────────────────────────────────────────────
  const currentState = data.trace_states[step]
  if (currentState !== undefined) {
    if (currentState === -1) {
      const g = nodeCache.get('TRAP')
      if (g) applyNodeStyle(g, 'trap_final', false)
    } else {
      const g = nodeCache.get(`q${currentState}`)
      if (g) {
        if (isFinished && data.accepted) applyNodeStyle(g, 'accept_final', true)
        else if (isFinished) applyNodeStyle(g, 'reject_final', data.accept_info[String(currentState)] !== undefined)
        else applyNodeStyle(g, 'current', false)
      }
    }
  }

  // ── Mark the edge just taken (trace_edges[step-1]) ───────────────────────
  if (step > 0) {
    const e = data.trace_edges[step - 1]
    const key = e.to === -1 ? `q${e.from}->TRAP` : `q${e.from}->q${e.to}`
    const g = edgeCache.get(key)
    if (g) styleEdgeParts(g, e.to === -1 ? '#e11d48' : '#2563eb', '2.8')
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export function TraceSubgraph({ word }: { word: string }) {
  const [data, setData] = useState<FullDFAData | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [svgError, setSvgError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)

  // Animation
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(700)
  const [followMode, setFollowMode] = useState(true)

  // Pan / zoom
  const [tf, setTf] = useState<Transform>({ x: 0, y: 0, scale: 1 })

  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<string | null>(null)
  const nodeCacheRef = useRef<Map<string, Element>>(new Map())
  const edgeCacheRef = useRef<Map<string, Element>>(new Map())
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const cacheReadyRef = useRef(false)
  const tfRef = useRef<Transform>({ x: 0, y: 0, scale: 1 })
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  useEffect(() => { svgRef.current = svg }, [svg])
  useEffect(() => { tfRef.current = tf }, [tf])

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!word) return
    setLoading(true)
    setFetchError(null)
    setData(null)
    setSvg(null)
    setStep(0)
    setPlaying(false)
    fetch(`${API_BASE}/full_dfa?word=${encodeURIComponent(word)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`)
        return r.json() as Promise<FullDFAData>
      })
      .then(setData)
      .catch((e: unknown) => setFetchError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false))
  }, [word])

  // ── Render DOT → SVG ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!data) return
    let cancelled = false
    setRendering(true)
    setSvg(null)
    setSvgError(null)
    setStep(0)
    setPlaying(false)
    const dot = buildFullDot(data)
    ;(async () => {
      try {
        const gv = await Graphviz.load()
        const out = gv.layout(dot, 'svg', 'dot')
        if (!cancelled) setSvg(out)
      } catch (e) {
        if (!cancelled) setSvgError(e instanceof Error ? e.message : 'Render failed')
      } finally {
        if (!cancelled) setRendering(false)
      }
    })()
    return () => { cancelled = true }
  }, [data])

  const fitToScreen = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const cw = rect.width || 820
    const ch = rect.height || 520
    const t = computeFit(svgRef.current, cw, ch)
    if (t) {
      if (viewportRef.current) viewportRef.current.style.transition = 'none'
      setTf(t)
    }
  }, [])

  // ── Build SVG node/edge caches after render, then apply step 0 ───────────
  useEffect(() => {
    if (!viewportRef.current) return
    if (!svg || !data) {
      // Clear stale SVG when a new word is loading
      viewportRef.current.innerHTML = ''
      cacheReadyRef.current = false
      return
    }
    cacheReadyRef.current = false
    // Inject SVG directly so React never touches this content again.
    // Using dangerouslySetInnerHTML would reset all our inline style changes
    // every time step/tf state changes cause a re-render.
    viewportRef.current.innerHTML = svg
    const id = setTimeout(() => {
      if (!viewportRef.current) return
      nodeCacheRef.current = buildNodeCache(viewportRef.current)
      edgeCacheRef.current = buildEdgeCache(viewportRef.current)
      nodePositionsRef.current = buildNodePositionCache(viewportRef.current)
      cacheReadyRef.current = true
      applyAnimStep(0, data, nodeCacheRef.current, edgeCacheRef.current)

      // Show the full DFA at fit-to-screen, then if follow mode is on,
      // pan to the initial state (step 0 = q0) so the first play starts there.
      fitToScreen()
      if (followModeRef.current) {
        panToCurrentNodeImperative(0)
      }
    }, 30)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg, data, fitToScreen])

  // ── Apply animation step to SVG DOM ──────────────────────────────────────
  useEffect(() => {
    if (!data || !svg) return
    applyAnimStep(step, data, nodeCacheRef.current, edgeCacheRef.current)
  }, [step, data, svg])

  // ── Auto-play timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !data) return
    const totalSteps = data.trace_states.length - 1
    if (step >= totalSteps) { setPlaying(false); return }
    const t = setTimeout(() => setStep((s) => s + 1), speed)
    return () => clearTimeout(t)
  }, [playing, step, speed, data])

  // ── Auto-follow: pan + zoom to center the current state ───────────────────
  // Use a ref so panToCurrentNodeImperative can always access latest followMode
  const followModeRef = useRef(followMode)
  useEffect(() => { followModeRef.current = followMode }, [followMode])

  // Pan to node using its SVG coordinate-space position — no DOM layout reads,
  // so this is immune to CSS transition timing and React batching issues.
  const panToCurrentNodeImperative = useCallback((currentStep: number) => {
    if (!data || !containerRef.current || !viewportRef.current) return
    if (!cacheReadyRef.current) return
    const stateId = data.trace_states[currentStep]
    if (stateId === undefined) return
    const key = stateId === -1 ? 'TRAP' : `q${stateId}`
    const pos = nodePositionsRef.current.get(key)
    if (!pos) return

    const rect = containerRef.current.getBoundingClientRect()
    const cw = rect.width || 820
    // getBoundingClientRect().height is the full layout height (may equal the SVG height).
    // The truly visible portion is the intersection of the canvas rect with the viewport
    // and any overflow:hidden ancestors (e.g. the modal clips the canvas).
    const ch = getVisibleHeight(containerRef.current)

    // getCTM() already returns coordinates in CSS pixel space of the viewport div.
    // The browser renders the SVG with 1 SVG user unit = 1 CSS px (pt treated as px),
    // so viewBox coords ARE CSS px — no conversion factor needed.
    const nodeX = pos.x
    const nodeY = pos.y

    // Zoom in to at least 2×; never force zoom-out if user has zoomed further
    const ts = Math.max(tfRef.current.scale, 2.0)
    const target: Transform = { scale: ts, x: cw / 2 - nodeX * ts, y: ch / 2 - nodeY * ts }

    if (!isDragging.current) {
      viewportRef.current.style.transition = 'transform 0.28s ease'
    }
    setTf(target)
  }, [data])

  const panToCurrentNode = panToCurrentNodeImperative

  useEffect(() => {
    if (!followMode) return
    panToCurrentNodeImperative(step)
  }, [step, followMode, panToCurrentNodeImperative])

  // ── Mouse-wheel zoom ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.12 : 0.88
      // Wheel zoom: instant (no transition)
      if (viewportRef.current) viewportRef.current.style.transition = 'none'
      setTf((t) => {
        const ns = Math.max(0.05, Math.min(10, t.scale * factor))
        const r = ns / t.scale
        return { scale: ns, x: mx - (mx - t.x) * r, y: my - (my - t.y) * r }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── Drag to pan ───────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    // User is manually panning — disable follow and stop any running transition
    setFollowMode(false)
    if (viewportRef.current) {
      // Freeze the transform at its current ANIMATED position so drag starts from there
      const actual = getActualTransform(viewportRef.current)
      viewportRef.current.style.transition = 'none'
      setTf(actual)
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTf((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }
  const onPointerUp = () => { isDragging.current = false }

  // ── Derived values ────────────────────────────────────────────────────────
  const totalSteps = data ? data.trace_states.length - 1 : 0
  const isFinished = step >= totalSteps
  const busy = loading || rendering

  const currentStateLbl = data
    ? (() => {
        const s = data.trace_states[step]
        return s === undefined ? 'q0' : s === -1 ? 'TRAP' : `q${s}`
      })()
    : 'q0'

  const badgeVariant = !data
    ? 'current'
    : isFinished
      ? data.accepted
        ? 'accept'
        : data.hit_trap
          ? 'trap'
          : 'reject'
      : 'current'

  const progressPct = totalSteps > 0 ? (step / totalSteps) * 100 : 0

  const togglePlay = () => {
    if (isFinished) { setStep(0); setPlaying(true) }
    else setPlaying((p) => !p)
  }
  const reset = () => { setStep(0); setPlaying(false) }
  const stepBack = () => { setPlaying(false); setStep((s) => Math.max(0, s - 1)) }
  const stepFwd = () => { setPlaying(false); setStep((s) => Math.min(totalSteps, s + 1)) }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="traceFullDFA">
      {/* Stats */}
      {/* {data && (
        <div className="traceFullDFA__stats">
          <span className="pill">
            <span className="muted">States</span>
            <span className="mono">{data.num_states}</span>
          </span>
          <span className="pill">
            <span className="muted">Transitions</span>
            <span className="mono">{data.all_transitions.length}</span>
          </span>
          <span className="pill">
            <span className="muted">Word</span>
            <span className="mono">"{data.word}"</span>
          </span>
          <span className="pill">
            <span className="muted">Result</span>
            <span style={{ color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
          </span>
        </div>
      )} */}

      {/* Word character display (synced with step) */}
      {data && (
        <div className="traceAnim__wordRow">
          <span className="traceAnim__wordLabel muted">Input</span>
          <div className="traceAnim__word">
            {data.word.split('').map((ch, i) => (
              <span
                key={i}
                className={[
                  'traceAnim__char',
                  // Before final: normal stepping colours.
                  !isFinished && i === step - 1 ? 'traceAnim__char--active' : '',
                  !isFinished && i < step - 1 ? 'traceAnim__char--done' : '',
                  !isFinished && i === step ? 'traceAnim__char--next' : '',

                  // Final: keep already-consumed characters as done.
                  isFinished && i < step - 1 ? 'traceAnim__char--done' : '',

                  // Final: colour ONLY the deciding (active) character by outcome.
                  isFinished && i === step - 1 && badgeVariant === 'accept'
                    ? 'traceAnim__char--accepted'
                    : '',
                  isFinished && i === step - 1 && (badgeVariant === 'trap' || badgeVariant === 'reject')
                    ? 'traceAnim__char--rejected'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {ch}
              </span>
            ))}
          </div>
          <div className="traceAnim__stateLabel">
            {(playing || step > 0) && (
              <>
                <span className="muted traceAnim__stateLabelKey">State</span>
                <span className={`traceAnim__stateBadge traceAnim__stateBadge--${badgeVariant}`}>
                  {currentStateLbl}
                </span>
              </>
            )}

            {/* <span className="muted traceAnim__stateLabelKey">Result</span>
            <span style={{ color: resultColor, fontWeight: 800 }}>
              {resultLabel}
            </span> */}
          </div>
        </div>
      )}

      {/* Unified controls row: playback + speed + pan/zoom */}
      {svg && (
        <div className="traceFullDFA__controlsRow">
          <div className="traceFullDFA__controlsLeft">
            {data && (
              <>
                <div className="traceAnim__btnGroup">
                  <button type="button" className="btn btn--secondary traceAnim__btn" onClick={reset} title="Reset">⏮</button>
                  <button type="button" className="btn btn--secondary traceAnim__btn" onClick={stepBack} disabled={step === 0} title="Step back">◀</button>
                  <button type="button" className="btn traceAnim__playBtn" onClick={togglePlay}>
                    {playing ? '⏸\u2009Pause' : isFinished ? '↺\u2009Replay' : '▶\u2009Play'}
                  </button>
                  <button type="button" className="btn btn--secondary traceAnim__btn" onClick={stepFwd} disabled={isFinished} title="Step forward">▶</button>
                </div>

                <div className="traceAnim__speedRow">
                  <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>Slow</span>
                  <input
                    type="range"
                    className="traceAnim__speedSlider"
                    min={200} max={2000} step={100}
                    value={2200 - speed}
                    onChange={(e) => setSpeed(2200 - Number(e.target.value))}
                    aria-label="Animation speed"
                  />
                  <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>Fast</span>
                </div>
              </>
            )}
          </div>

          <div className="traceFullDFA__controlsRight">
            <div className="traceFullDFA__zoomGroup">
              <button type="button" className="btn btn--secondary traceFullDFA__toolBtn"
                onClick={() => {
                  if (viewportRef.current) viewportRef.current.style.transition = 'transform 0.2s ease'
                  setTf((t) => ({ ...t, scale: Math.min(10, t.scale * 1.3) }))
                }} title="Zoom in">+</button>
              <button type="button" className="btn btn--secondary traceFullDFA__toolBtn"
                onClick={() => {
                  if (viewportRef.current) viewportRef.current.style.transition = 'transform 0.2s ease'
                  setTf((t) => ({ ...t, scale: Math.max(0.05, t.scale * 0.77) }))
                }} title="Zoom out">−</button>
              <button type="button" className="btn btn--secondary traceFullDFA__toolBtn"
                onClick={() => {
                  if (viewportRef.current) viewportRef.current.style.transition = 'transform 0.25s ease'
                  fitToScreen()
                }} title="Fit to screen">Fit</button>
            </div>

            <div className="traceFullDFA__followGroup">
              <button
                type="button"
                className={`btn traceFullDFA__toolBtn traceFullDFA__followBtn${followMode ? ' traceFullDFA__followBtn--on' : ''}`}
                onClick={() => {
                  const next = !followMode
                  setFollowMode(next)
                  if (next) panToCurrentNode(step)
                }}
                title={followMode ? 'Auto-follow ON — click to disable' : 'Auto-follow OFF — click to enable'}
              >
                {followMode ? '⊙ Follow' : '○ Follow'}
              </button>
              <span className="muted traceFullDFA__scaleLabel">{Math.round(tf.scale * 100)}%</span>
              <span className="muted traceFullDFA__hint">Scroll to zoom · Drag to pan</span>
            </div>
          </div>
        </div>
      )}

      {/* Canvas — wrapper gives flex-allocated height; canvas fills remaining space so the
           SVG viewport (CSS transform) cannot escape the clip region */}
      <div className="traceFullDFA__canvasWrap">
        {data && (
          <div className="traceFullDFA__canvasHeader">
            <div className="traceFullDFA__canvasHeaderTitle">Closed-class DFA Model</div>
            <details className="traceFullDFA__infoDetails">
              <summary
                className="traceFullDFA__canvasHeaderIconBtn"
                title="Overall DFA info"
                aria-label="Overall DFA info"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 17v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M12 8.5h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  <path
                    d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </summary>
              <div className="traceFullDFA__infoPopover">
                <div className="traceAnim__dfaDetailsRow">
                  <span className="muted">Total States</span>
                  <span className="mono">{data.num_states}</span>
                </div>
                <div className="traceAnim__dfaDetailsRow">
                  <span className="muted">Total Transitions</span>
                  <span className="mono">{data.all_transitions.length}</span>
                </div>
              </div>
            </details>
          </div>
        )}
      <div
        ref={containerRef}
        className="traceFullDFA__canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {busy && (
          <div className="traceFullDFA__loading muted">
            {loading
              ? `Fetching full DFA for "${word}"…`
              : `Rendering ${data?.num_states ?? 413} states — may take a few seconds…`}
          </div>
        )}
        {fetchError && <div className="error">{fetchError}</div>}
        {svgError && <div className="error">Graphviz: {svgError}</div>}
        {/* Viewport: always in DOM so viewportRef is valid; SVG is injected directly via innerHTML */}
        <div
          ref={viewportRef}
          className="traceFullDFA__viewport"
          style={{
            transform: `translate(${tf.x}px,${tf.y}px) scale(${tf.scale})`,
            transformOrigin: '0 0',
            display: svg ? 'block' : 'none',
          }}
        />

        {svg && data && (
          <div className="traceFullDFA__progressFooter">
            <div className="traceAnim__progressBar">
              <div className="traceAnim__progressFill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="muted traceFullDFA__progressText">
              {step}{'\u202f'}/{'\u202f'}{totalSteps}
            </span>
          </div>
        )}
      </div>
      </div>

      {/* Legend */}
      {svg && (
        <div className="traceLegend">
          <span className="legendPill legendPill--blue">Current state/edge</span>
          <span className="legendPill traceFullDFA__visitedPill">Visited (light blue)</span>
          <span className="legendPill legendPill--green">Accept (double ring)</span>
          <span className="legendPill traceFullDFA__otherPill">Other (gray)</span>
          {data?.hit_trap && <span className="legendPill legendPill--red">TRAP (octagon)</span>}
        </div>
      )}
    </div>
  )
}

