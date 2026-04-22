from __future__ import annotations
from pathlib import Path

import importlib.util
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple


@dataclass(frozen=True)
class Highlight:
    start: int
    end: int
    original: str
    lower: str
    categories: List[str]


def _load_closed_class_module() -> Any:
    """
    Load `closed_class_dfa.py` from the sibling `CPT411_Assignment1/` folder
    without requiring it to be a Python package.
    """
    # here = os.path.dirname(__file__)
    # assignment_root = os.path.abspath(os.path.join(here, "..", "..", "CPT411_Assignment1"))
    # script_path = os.path.join(assignment_root, "closed_class_dfa.py")
    here = Path(__file__).resolve().parent
    script_path = here.parent / "closed_class_dfa.py"
    if not os.path.exists(script_path):
        raise FileNotFoundError(f"Could not find closed_class_dfa.py at: {script_path}")

    spec = importlib.util.spec_from_file_location("closed_class_dfa", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to create module spec for closed_class_dfa.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_MOD = _load_closed_class_module()
_DFA = _MOD.TrieDFA(list(_MOD.WORD_MAP.keys()))


def trace_word(word: str) -> Dict[str, Any]:
    """
    Return DFA trace details for a single token.

    This is used by the UI to show a trace even for rejected words.
    """
    if word is None:
        word = ""
    original = str(word)
    lower = original.lower()
    accepted, _final = _DFA.run(lower)
    categories = list(_MOD.WORD_MAP.get(lower, []))
    steps = _DFA.trace(lower)
    trace = [{"ch": ch, "from": frm, "to": to, "trap": bool(trap)} for (ch, frm, to, trap) in steps]
    return {
        "original": original,
        "lower": lower,
        "accepted": bool(accepted),
        "categories": categories,
        "steps": len(trace),
        "trace": trace,
    }


def _word_frequency_from_findings(findings: List[Tuple]) -> Dict[str, Dict[str, Any]]:
    freq: Dict[str, Dict[str, Any]] = {}
    for original, _start, _end, cats, _acc in findings:
        lw = original.lower()
        if lw not in freq:
            freq[lw] = {"count": 0, "categories": list(cats)}
        freq[lw]["count"] += 1
    return freq


def _accepted_by_category(word_counts: Dict[str, Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {c: [] for c in _MOD.CLOSED_CLASS.keys()}
    for w, info in word_counts.items():
        cats = info["categories"]
        for c in cats:
            out.setdefault(c, []).append({"word": w, "count": info["count"], "categories": cats})
    for c in list(out.keys()):
        out[c].sort(key=lambda x: (-x["count"], x["word"]))
    return out


def analyze_text(text: str) -> Dict[str, Any]:
    """
    Run the DFA over input text and return JSON-serializable results:
    - total token count
    - accepted token count
    - accepted words grouped by category
    - highlight spans with offsets for UI rendering
    """
    if text is None:
        text = ""

    all_tokens, findings = _MOD.scan_text(_DFA, text)

    highlight_payloads: List[Dict[str, Any]] = []
    for original, start, end, cats, acc in findings:
        if not acc:
            continue
        lower = str(original).lower()
        steps = _DFA.trace(lower)
        trace = [{"ch": ch, "from": frm, "to": to, "trap": bool(trap)} for (ch, frm, to, trap) in steps]

        h = Highlight(
            start=int(start),
            end=int(end),
            original=str(original),
            lower=lower,
            categories=list(cats),
        )
        highlight_payloads.append({**h.__dict__, "trace": trace})
    highlight_payloads.sort(key=lambda h: int(h["start"]))

    word_counts = _word_frequency_from_findings(findings)
    accepted_by_cat = _accepted_by_category(word_counts)

    # token occurrences by category (tokens, not unique words)
    cat_counts: Dict[str, int] = {c: 0 for c in _MOD.CLOSED_CLASS.keys()}
    for _original, _s, _e, cats, _acc in findings:
        for c in cats:
            cat_counts[c] = cat_counts.get(c, 0) + 1

    return {
        "text": text,
        "totalTokens": len(all_tokens),
        "acceptedTokens": len(findings),
        "categoryTokenCounts": cat_counts,
        "acceptedWordCounts": word_counts,
        "acceptedByCategory": accepted_by_cat,
        "highlights": highlight_payloads,
        "categories": list(_MOD.CLOSED_CLASS.keys()),
    }

