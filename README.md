# CPT411 Assignment 1 – DFA Interface (React + FastAPI)

This folder provides a web interface for running the DFA recognizer from:
`..\closed_class_dfa.py`

You can paste text or upload a `.txt` file, then view:
- Total tokens
- Accepted token count
- Clean accepted-words summary grouped by category
- Full text with accepted words highlighted by category color (multi-category words use a combined gradient)

## Prerequisites
- Node.js (for the React UI)
- Python 3.10+ recommended

## Run the API (FastAPI)
From PowerShell:

```powershell
cd "<your-project-directory>\api"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Health check:
- `http://127.0.0.1:8000/health`

## Run the Web UI (React)
In a second PowerShell:

```powershell
cd "<your-project-directory>\web"
npm install
npm run dev
```

Then open the URL printed by Vite (usually `http://127.0.0.1:5173/`).

## Notes
- The UI calls `POST http://127.0.0.1:8000/analyze`.
- Submit either JSON `{ "text": "..." }` or a multipart upload with a `.txt` file.
