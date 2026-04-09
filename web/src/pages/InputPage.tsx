import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadOrPaste } from '../components/UploadOrPaste'
import type { AnalysisResult, CategoryColorMap } from '../types'

const API_BASE = 'http://127.0.0.1:8000'

type Props = {
  colors: CategoryColorMap
  onResult: (r: AnalysisResult) => void
}

export function InputPage({ onResult }: Props) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canAnalyze = useMemo(() => {
    return text.trim().length > 0 || file !== null
  }, [file, text])

  async function analyze() {
    setLoading(true)
    setError(null)
    try {
      let res: Response
      if (file) {
        const form = new FormData()
        form.append('file', file)
        res = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: form })
      } else {
        res = await fetch(`${API_BASE}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        const msg = payload?.detail ? String(payload.detail) : `Request failed: ${res.status}`
        throw new Error(msg)
      }

      const data = (await res.json()) as AnalysisResult
      onResult(data)
      navigate('/results')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app app--centerPage">
      <main className="grid grid--center">
        <div className="pageTitle card--span2">
          <div className="pageTitle__headline">Closed Class Words Finder (DFA)</div>
          <div className="pageTitle__sub">Paste text or upload a txt file, then analyze.</div>
        </div>

        <section className="card card--span2">
          <h2 className="card__title">Input</h2>
          <UploadOrPaste
            text={text}
            onTextChange={(v) => setText(v)}
            file={file}
            onFileChange={(f) => setFile(f)}
            onClear={() => {
              setText('')
              setFile(null)
              setError(null)
            }}
          />
          {error && <div className="error">{error}</div>}
          {/* <div className="hint">
            After you click <b>Analyze</b>, you will be taken to the results page.
          </div> */}
          <div className="actionBar">
            <button className="btn btn--primaryWide" onClick={analyze} disabled={!canAnalyze || loading}>
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
        </section>
      </main>

      <footer className="footer">
        API expected at <code>{API_BASE}</code>.
      </footer>
    </div>
  )
}

