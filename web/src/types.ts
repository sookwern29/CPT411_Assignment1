export type Category =
  | 'Conjunction'
  | 'Preposition'
  | 'Determiner'
  | 'Pronoun'
  | 'Modal'
  | (string & {})

export type CategoryColorMap = Record<string, string>

export type Highlight = {
  start: number
  end: number
  original: string
  lower: string
  categories: string[]
  trace?: TraceStep[]
}

export type TraceStep = {
  ch: string
  from: number
  to: number
  trap: boolean
}

export type AcceptedItem = {
  word: string
  count: number
  categories: string[]
}

export type AnalysisResult = {
  text: string
  totalTokens: number
  acceptedTokens: number
  categoryTokenCounts: Record<string, number>
  acceptedWordCounts: Record<string, { count: number; categories: string[] }>
  acceptedByCategory: Record<string, AcceptedItem[]>
  highlights: Highlight[]
  categories: string[]
}

