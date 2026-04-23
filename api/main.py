from __future__ import annotations

from typing import Any, Optional

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dfa_engine import analyze_text, full_dfa_trace, subgraph_word, trace_word


class AnalyzeRequest(BaseModel):
    text: str


app = FastAPI(title="CPT411 Closed Class DFA API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(
    request: Request,
    file: Optional[UploadFile] = File(default=None),
) -> Any:
    if file is not None:
        if not (file.filename or "").lower().endswith(".txt"):
            raise HTTPException(status_code=400, detail="Only .txt uploads are supported.")
        raw = await file.read()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            # fallback for common Windows text files
            text = raw.decode("latin-1")
    else:
        try:
            body = await request.json()
        except Exception:
            body = None
        text = (body or {}).get("text", "")

    if not isinstance(text, str) or text.strip() == "":
        raise HTTPException(status_code=400, detail='Provide JSON body {"text": "..."} or upload a .txt file.')

    return analyze_text(text)


@app.get("/trace")
def trace(word: str) -> Any:
    if not isinstance(word, str) or word.strip() == "":
        raise HTTPException(status_code=400, detail='Provide query param ?word=...')
    return trace_word(word)


@app.get("/subgraph")
def subgraph(word: str) -> Any:
    if not isinstance(word, str) or word.strip() == "":
        raise HTTPException(status_code=400, detail='Provide query param ?word=...')
    return subgraph_word(word)


@app.get("/full_dfa")
def full_dfa(word: str) -> Any:
    if not isinstance(word, str) or word.strip() == "":
        raise HTTPException(status_code=400, detail='Provide query param ?word=...')
    return full_dfa_trace(word)

