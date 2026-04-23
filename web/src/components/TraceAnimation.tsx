import { useEffect, useRef, useState } from 'react'
import type { TraceStep } from '../types'

interface Props {
  traceSteps: TraceStep[]
  word: string
  accepted: boolean
}

export function TraceAnimation({ traceSteps, word, accepted }: Props) {
  const [currentStep, setCurrentStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(800) // ms per step
  const tableRef = useRef<HTMLDivElement>(null)
  const chainRef = useRef<HTMLDivElement>(null)

  const totalSteps = traceSteps.length
  const isFinished = currentStep >= totalSteps

  // Auto-advance
  useEffect(() => {
    if (!playing) return
    if (isFinished) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setCurrentStep(s => s + 1), speed)
    return () => clearTimeout(t)
  }, [playing, currentStep, isFinished, speed])

  // Scroll active table row into view
  useEffect(() => {
    if (!tableRef.current || currentStep === 0) return
    const rows = tableRef.current.querySelectorAll<HTMLElement>('.traceTable__row')
    const activeRow = rows[currentStep - 1]
    activeRow?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentStep])

  // Scroll active chain node into view
  useEffect(() => {
    if (!chainRef.current) return
    const nodes = chainRef.current.querySelectorAll<HTMLElement>('.traceAnim__node')
    const activeNode = nodes[currentStep]
    activeNode?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [currentStep])

  // Build node list: [q0, q{step1.to}, q{step2.to}, ..., (TRAP?)]
  const nodes: Array<{ state: number; label: string; isTrap: boolean }> = [
    { state: 0, label: 'q0', isTrap: false },
  ]
  for (const s of traceSteps) {
    if (s.trap) {
      nodes.push({ state: -1, label: 'TRAP', isTrap: true })
      break
    } else {
      nodes.push({ state: s.to, label: `q${s.to}`, isTrap: false })
    }
  }

  function nodeStatus(idx: number): string {
    if (idx < currentStep) return 'visited'
    if (idx === currentStep) {
      if (isFinished) {
        const node = nodes[idx]
        if (node.isTrap) return 'trap'
        if (accepted) return 'accept'
        return 'reject'
      }
      return 'current'
    }
    return 'future'
  }

  function edgeStatus(idx: number): string {
    if (idx < currentStep - 1) return 'done'
    if (idx === currentStep - 1) return 'active'
    return 'future'
  }

  const currentStateLabel = (() => {
    if (currentStep === 0) return 'q0'
    const s = traceSteps[currentStep - 1]
    return s.trap ? 'TRAP' : `q${s.to}`
  })()

  const badgeVariant = isFinished
    ? nodes[currentStep]?.isTrap
      ? 'trap'
      : accepted
        ? 'accept'
        : 'reject'
    : 'current'

  const reset = () => { setCurrentStep(0); setPlaying(false) }
  const stepBack = () => setCurrentStep(s => Math.max(0, s - 1))
  const stepForward = () => setCurrentStep(s => Math.min(totalSteps, s + 1))
  const togglePlay = () => {
    if (isFinished) { setCurrentStep(0); setPlaying(true) }
    else setPlaying(p => !p)
  }

  const progressPct = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0

  return (
    <div className="traceAnim">
      {/* ── Word display ─────────────────────────── */}
      <div className="traceAnim__wordRow">
        <span className="traceAnim__wordLabel muted">Input</span>
        <div className="traceAnim__word">
          {word.split('').map((ch, i) => {
            const isActive = i === currentStep - 1
            const isDone = i < currentStep - 1
            const isNext = i === currentStep
            return (
              <span
                key={i}
                className={[
                  'traceAnim__char',
                  isActive ? 'traceAnim__char--active' : '',
                  isDone ? 'traceAnim__char--done' : '',
                  isNext ? 'traceAnim__char--next' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {ch}
              </span>
            )
          })}
        </div>
        <div className="traceAnim__stateLabel">
          <span className="muted traceAnim__stateLabelKey">State</span>
          <span className={`traceAnim__stateBadge traceAnim__stateBadge--${badgeVariant}`}>
            {currentStateLabel}
          </span>
        </div>
      </div>

      {/* ── State chain ───────────────────────────── */}
      <div className="traceAnim__chainWrap">
        <div className="traceAnim__chain" ref={chainRef}>
          {nodes.map((node, idx) => {
            const status = nodeStatus(idx)
            const edge = idx < traceSteps.length ? traceSteps[idx] : null
            const eStatus = edge ? edgeStatus(idx) : null
            return (
              <div key={idx} className="traceAnim__chainItem">
                <div className={`traceAnim__node traceAnim__node--${status}`}>
                  <span className="traceAnim__nodeLabel">{node.label}</span>
                  {status === 'accept' && (
                    <span className="traceAnim__star" aria-hidden="true">★</span>
                  )}
                </div>
                {edge && (
                  <div className={`traceAnim__edge traceAnim__edge--${eStatus}`}>
                    <span className="traceAnim__edgeChar">'{edge.ch}'</span>
                    <div className="traceAnim__edgeArrow">
                      <div className="traceAnim__edgeLine" />
                      <div className="traceAnim__edgeHead" />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Controls ─────────────────────────────── */}
      <div className="traceAnim__controls">
        <div className="traceAnim__btnGroup">
          <button
            type="button"
            className="btn btn--secondary traceAnim__btn"
            onClick={reset}
            title="Reset"
          >
            ⏮
          </button>
          <button
            type="button"
            className="btn btn--secondary traceAnim__btn"
            onClick={stepBack}
            disabled={currentStep === 0}
            title="Step back"
          >
            ◀
          </button>
          <button
            type="button"
            className="btn traceAnim__playBtn"
            onClick={togglePlay}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸\u2009Pause' : isFinished ? '↺\u2009Replay' : '▶\u2009Play'}
          </button>
          <button
            type="button"
            className="btn btn--secondary traceAnim__btn"
            onClick={stepForward}
            disabled={isFinished}
            title="Step forward"
          >
            ▶
          </button>
        </div>

        <div className="traceAnim__speedRow">
          <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>Slow</span>
          <input
            type="range"
            className="traceAnim__speedSlider"
            min={200}
            max={2000}
            step={100}
            value={2200 - speed}
            onChange={e => setSpeed(2200 - Number(e.target.value))}
            aria-label="Animation speed"
          />
          <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>Fast</span>
        </div>

        <div className="traceAnim__progress">
          <div className="traceAnim__progressBar">
            <div
              className="traceAnim__progressFill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="muted" style={{ fontSize: 12, minWidth: 52, textAlign: 'right' }}>
            {currentStep}\u202f/\u202f{totalSteps}
          </span>
        </div>
      </div>

      {/* ── Trace table ───────────────────────────── */}
      <div
        className="traceTable traceAnim__table"
        role="table"
        aria-label="DFA trace table"
        ref={tableRef}
      >
        <div className="traceTable__head" role="row">
          <div role="columnheader">Step</div>
          <div role="columnheader">Char</div>
          <div role="columnheader">From</div>
          <div role="columnheader">To</div>
          <div role="columnheader">Note</div>
        </div>
        {traceSteps.map((s, idx) => {
          const fromLbl = `q${s.from}`
          const toLbl = s.trap ? 'TRAP' : `q${s.to}`
          const note = s.trap ? 'Entering trap state — processing terminated' : ''
          const isActive = idx === currentStep - 1
          const isDone = idx < currentStep - 1
          return (
            <div
              key={`${idx}:${s.ch}:${s.from}:${s.to}`}
              className={[
                'traceTable__row',
                isActive ? 'traceTable__row--active' : '',
                isDone ? 'traceTable__row--done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="row"
            >
              <div className="mono" role="cell">{idx + 1}</div>
              <div className="mono" role="cell">'{s.ch}'</div>
              <div className="mono" role="cell">{fromLbl}</div>
              <div className="mono" role="cell">{toLbl}</div>
              <div className={s.trap ? 'traceNote traceNote--trap' : 'traceNote'} role="cell">
                {note || '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
