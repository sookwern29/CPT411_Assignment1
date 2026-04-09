import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import './app.css'
import type { AnalysisResult, CategoryColorMap } from './types'
import { InputPage } from './pages/InputPage'
import { ResultsPage } from './pages/ResultsPage'

const RESULT_STORAGE_KEY = 'cpt411_dfa_result_v1'

const CATEGORY_COLORS: CategoryColorMap = {
  Conjunction: '#3b82f6',
  Preposition: '#22c55e',
  Determiner: '#f59e0b',
  Pronoun: '#a855f7',
  Modal: '#ef4444',
}

function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESULT_STORAGE_KEY)
      if (raw) setResult(JSON.parse(raw) as AnalysisResult)
    } catch {
      // ignore
    }
  }, [])

  return (
    <Routes>
      <Route
        path="/"
        element={
          <InputPage
            colors={CATEGORY_COLORS}
            onResult={(r) => {
              setResult(r)
              try {
                localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(r))
              } catch {
                // ignore
              }
            }}
          />
        }
      />
      <Route path="/results" element={<ResultsPage result={result} colors={CATEGORY_COLORS} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
