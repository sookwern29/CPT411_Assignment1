import type { ChangeEvent } from 'react'

type Props = {
  text: string
  onTextChange: (value: string) => void
  file: File | null
  onFileChange: (file: File | null) => void
  onClear: () => void
}

export function UploadOrPaste({ text, onTextChange, file, onFileChange, onClear }: Props) {
  const hasText = text.trim().length > 0
  const hasFile = file !== null

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    onFileChange(f)
    if (f) onTextChange('')
  }

  return (
    <div className="input">
      <label className="label">Paste or type your text here</label>
      <textarea
        className="textarea"
        value={text}
        disabled={hasFile}
        onChange={(e) => {
          onTextChange(e.target.value)
          if (e.target.value.trim().length > 0) onFileChange(null)
        }}
        rows={10}
        placeholder="Paste text here…"
      />

      <div className="row">
        <div className="col">
          <label className="label">Or upload a .txt file</label>
          <input
            className="file"
            type="file"
            accept=".txt,text/plain"
            disabled={hasText}
            onChange={onFileInput}
          />
          {file && <div className="muted">Selected: <code>{file.name}</code></div>}
        </div>

        <div className="col col--right">
          <button className="btn btn--secondary" onClick={onClear} type="button">
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}

