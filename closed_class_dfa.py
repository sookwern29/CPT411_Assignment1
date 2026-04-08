#!/usr/bin/env python3
"""
===========================================================================
  CPT411  Assignment 1
  L5: English Conjunctions / Prepositions / Determiners / Pronouns /
      Modals Finder  (Closed Class Words Recognizer)

  Language:
      L = { w ∈ Σ* | w is an English closed-class word }
      Σ = { a, b, …, z }   (uppercase input normalised to lowercase)

  DFA Design:
      - A trie-based DFA is constructed from the closed-class word list.
      - State 0  : start (initial) state q0
      - State -1 : trap / dead state  (implicit; terminates processing)
      - Every unique character-prefix path becomes a distinct DFA state.
      - Shared prefixes (e.g. "the" / "their") reuse the same states up
        to the branch point, making the machine both correct and compact.
      - The DFA processes exactly ONE character at a time, left to right.
      - On any character with no defined transition the machine enters the
        trap state and processing terminates immediately.

  Output:
      - Single-word DFA trace  (step-by-step state walk)
      - Full text scan         (accept / reject for every token)
      - Frequency summary      (occurrences by word and by category)
      - Highlighted text       (bold + underline via ANSI codes)
===========================================================================
"""

import os
import re
import sys

# ---------------------------------------------------------------------------
# Enable ANSI escape codes on Windows
# ---------------------------------------------------------------------------
if os.name == "nt":
    os.system("")          # Activates virtual-terminal processing in cmd/PS

# ---------------------------------------------------------------------------
# ANSI formatting constants
# ---------------------------------------------------------------------------
BOLD      = "\033[1m"
UNDERLINE = "\033[4m"
GREEN     = "\033[32m"
RED       = "\033[31m"
CYAN      = "\033[36m"
YELLOW    = "\033[33m"
RESET     = "\033[0m"


# ===========================================================================
#  CLOSED CLASS WORD LISTS
#  Each entry is lowercase.  Some words belong to more than one category
#  (e.g. "for" is both a Conjunction and a Preposition); all categories are
#  recorded in WORD_MAP below.
# ===========================================================================
CLOSED_CLASS: dict[str, list[str]] = {

    "Conjunction": [
        "and", "but", "or", "nor", "for", "yet", "so",
        "if", "as", "than", "that", "though", "although",
        "because", "since", "while", "when", "where",
        "whether", "after", "before", "unless", "until",
        "once", "both", "either", "neither", "lest", "till",
    ],

    "Preposition": [
        "in", "on", "at", "by", "for", "with", "about",
        "against", "among", "around", "before", "behind",
        "below", "beside", "between", "beyond", "despite",
        "during", "except", "inside", "into", "near", "of",
        "off", "out", "outside", "over", "through", "to",
        "toward", "towards", "under", "until", "up", "upon",
        "without", "within", "along", "across", "after",
        "behind", "beneath", "like", "per", "plus", "since",
        "via",
    ],

    "Determiner": [
        "a", "an", "the", "this", "that", "these", "those",
        "my", "your", "his", "her", "its", "our", "their",
        "some", "any", "no", "every", "each", "few", "many",
        "much", "more", "most", "other", "such", "all",
        "both", "either", "neither", "what", "whatever",
        "whichever", "whose",
    ],

    "Pronoun": [
        "i", "me", "you", "he", "she", "it", "we", "they",
        "him", "her", "us", "them", "myself", "yourself",
        "himself", "herself", "itself", "ourselves", "themselves",
        "who", "whom", "whose", "which", "what", "one",
        "someone", "anyone", "everyone", "nobody", "somebody",
        "anything", "everything", "nothing", "something",
    ],

    "Modal": [
        "can", "could", "may", "might", "shall", "should",
        "will", "would", "must", "need", "dare", "ought",
    ],
}

# Build word -> [categories]  (many-to-many because of overlapping classes)
WORD_MAP: dict[str, list[str]] = {}
for _cat, _words in CLOSED_CLASS.items():
    for _w in _words:
        WORD_MAP.setdefault(_w, []).append(_cat)


# ===========================================================================
#  CLASS  TrieDFA
#  A Deterministic Finite Automaton built as a trie over the word list.
# ===========================================================================
class TrieDFA:
    """
    Trie-based DFA for recognising closed-class words.

    Attributes
    ----------
    transitions : dict[(int, str) -> int]
        The transition function  δ(state, char) = next_state.
    accept_states : dict[int -> str]
        Maps an accepting state to the word it completes.
    TRAP : int
        Constant (-1) representing the implicit dead / trap state.
    """

    TRAP: int = -1          # Implicit trap / dead state

    def __init__(self, word_list: list[str]) -> None:
        self.transitions: dict[tuple[int, str], int] = {}
        self.accept_states: dict[int, str] = {}
        self._next_id: int = 1          # State 0 is reserved as q0 (start)
        self._build(word_list)

    # ------------------------------------------------------------------
    def _alloc(self) -> int:
        """Allocate and return a new unique state integer ID."""
        sid = self._next_id
        self._next_id += 1
        return sid

    # ------------------------------------------------------------------
    def _build(self, word_list: list[str]) -> None:
        """
        Insert every word into the trie.

        For each character in the word:
          - If δ(current_state, char) is already defined, follow it.
          - Otherwise allocate a fresh state and record the transition.
        After exhausting all characters, mark the reached state as
        accepting and store the completed word there.
        """
        for word in word_list:
            state = 0               # Every word starts from q0
            for ch in word:
                key = (state, ch)
                if key not in self.transitions:
                    self.transitions[key] = self._alloc()
                state = self.transitions[key]
            # Only the first word wins if two words share the exact same
            # character sequence (should not occur for distinct words).
            if state not in self.accept_states:
                self.accept_states[state] = word

    # ------------------------------------------------------------------
    def run(self, word: str) -> tuple[bool, int]:
        """
        Simulate the DFA on *word*, processing ONE character at a time
        from left to right.

        Parameters
        ----------
        word : str
            Lowercase string to test.

        Returns
        -------
        (accepted, final_state)
            accepted    – True iff the DFA halts in an accept state.
            final_state – Integer state ID reached; TRAP (-1) if no
                          transition existed for some character.
        """
        state = 0                           # Begin at start state q0
        for ch in word:
            key = (state, ch)
            if key in self.transitions:
                state = self.transitions[key]
            else:
                # No defined transition → enter trap state; halt early
                return False, self.TRAP

        accepted = state in self.accept_states
        return accepted, state

    # ------------------------------------------------------------------
    def trace(self, word: str) -> list[tuple[str, int, int, bool]]:
        """
        Return a step-by-step trace of the DFA processing *word*.

        Each tuple in the returned list:
            (char_read, from_state, to_state, entered_trap)
        """
        steps: list[tuple[str, int, int, bool]] = []
        state = 0
        for ch in word:
            key = (state, ch)
            nxt = self.transitions.get(key, self.TRAP)
            steps.append((ch, state, nxt, nxt == self.TRAP))
            state = nxt
            if state == self.TRAP:
                break                       # Terminate early at trap
        return steps

    # ------------------------------------------------------------------
    @property
    def num_states(self) -> int:
        """Total number of DFA states (including q0, excluding trap)."""
        return self._next_id                # States: 0 … _next_id-1

    @property
    def num_transitions(self) -> int:
        """Total number of defined transitions in δ."""
        return len(self.transitions)

    @property
    def num_accept(self) -> int:
        """Number of accepting states (one per recognised word)."""
        return len(self.accept_states)


# ===========================================================================
#  TEXT SCANNER
#  Reads the raw text character by character, isolates alphabetic tokens
#  (words), and runs each token through the DFA.
# ===========================================================================
def scan_text(
    dfa: TrieDFA, text: str
) -> tuple[list[tuple], list[tuple]]:
    """
    Scan *text* character by character, extract every alphabetic token,
    and test it against the DFA.

    The scanner reads the source text left-to-right one character at a
    time.  When it encounters an alphabetic character it begins collecting
    a token; a non-alphabetic character (or end-of-input) terminates the
    token.  The collected token is then passed *one character at a time*
    to TrieDFA.run().

    Returns
    -------
    all_tokens : list of (original, start, end, categories, accepted)
    findings   : subset of all_tokens where accepted is True
    """
    all_tokens: list[tuple] = []
    findings:   list[tuple] = []

    i = 0
    n = len(text)

    while i < n:
        if text[i].isalpha():
            # ---- Begin collecting a new token ----
            word_start = i
            chars: list[str] = []

            while i < n and text[i].isalpha():
                chars.append(text[i].lower())   # Normalise to lowercase
                i += 1

            original  = text[word_start:i]
            lowercase = "".join(chars)

            # Run the DFA on the lowercase token, one character at a time
            accepted, _ = dfa.run(lowercase)
            categories  = WORD_MAP.get(lowercase, [])

            record = (original, word_start, i, categories, accepted)
            all_tokens.append(record)
            if accepted:
                findings.append(record)

        else:
            i += 1                              # Skip non-alphabetic char

    return all_tokens, findings


# ===========================================================================
#  OUTPUT / DISPLAY HELPERS
# ===========================================================================

def _sep(char: str = "=", width: int = 74) -> None:
    print(char * width)


def highlighted_text(text: str, findings: list[tuple]) -> str:
    """
    Return a copy of *text* with every accepted word wrapped in ANSI
    bold + underline escape codes for terminal visualisation.
    """
    parts: list[str] = []
    prev = 0
    for _, start, end, _, _ in sorted(findings, key=lambda x: x[1]):
        parts.append(text[prev:start])
        parts.append(f"{BOLD}{UNDERLINE}{text[start:end]}{RESET}")
        prev = end
    parts.append(text[prev:])
    return "".join(parts)


# ---------------------------------------------------------------------------
def print_single_pattern_report(dfa: TrieDFA, word: str) -> None:
    """
    Print full DFA trace (state walk) and verdict for a single word.
    Satisfies the assignment requirement:
        • pattern   • status (ACCEPT / REJECT)   • state-by-state trace
    """
    lower    = word.lower()
    accepted, _ = dfa.run(lower)
    steps    = dfa.trace(lower)
    cats     = WORD_MAP.get(lower, [])

    _sep()
    print(f"  SINGLE PATTERN TEST")
    _sep()
    print(f"\n  Pattern (input string) : '{word}'")
    print(f"  Normalised input       : '{lower}'")
    print(f"  Status                 : "
          f"{GREEN + BOLD + 'ACCEPT' + RESET if accepted else RED + BOLD + 'REJECT' + RESET}")
    if accepted:
        print(f"  Category               : {', '.join(cats)}")

    print(f"\n  {CYAN}DFA State Trace{RESET}")
    print(f"  {'Step':<6} {'Char':<8} {'From':<14} {'To':<14} {'Note'}")
    print("  " + "─" * 56)

    state = 0
    for step_no, (ch, frm, to, trap) in enumerate(steps, 1):
        frm_lbl = f"q{frm}"
        to_lbl  = BOLD + "TRAP" + RESET if trap else f"q{to}"
        note    = RED + "Entering trap state – processing terminated" + RESET if trap else ""
        state   = to
        print(f"  {step_no:<6} '{ch}'     {frm_lbl:<14} {to_lbl:<23} {note}")

    print()
    if accepted:
        print(f"  All {len(lower)} character(s) consumed.  "
              f"Final state q{state} is an {GREEN}ACCEPT{RESET} state.")
    elif steps and steps[-1][3]:     # last step entered trap
        print(f"  No transition from the current state on "
              f"'{steps[-1][0]}' → {RED}TRAP{RESET} state.  Input rejected.")
    else:
        print(f"  All characters consumed but final state q{state} "
              f"is {RED}not{RESET} an accept state.")
    print()


# ---------------------------------------------------------------------------
def print_full_report(
    dfa:        TrieDFA,
    text:       str,
    filepath:   str,
    all_tokens: list[tuple],
    findings:   list[tuple],
) -> None:
    """Print the complete scan report for the input text file."""

    _sep()
    print(f"  CPT411 ASSIGNMENT 1 – L5: CLOSED CLASS WORDS FINDER (DFA)")
    print(f"  Text file  : {os.path.basename(filepath)}")
    print(f"  Characters : {len(text)}   |   Tokens: {len(all_tokens)}")
    _sep()

    # ── DFA Statistics ─────────────────────────────────────────────────────
    print(f"\n{CYAN}[ DFA INFORMATION ]{RESET}")
    print(f"  DFA type              : Trie-based Deterministic Finite Automaton")
    print(f"  Start state           : q0")
    print(f"  Trap / dead state     : q{TrieDFA.TRAP}  (implicit; terminates on missing δ)")
    print(f"  Total states          : q0 … q{dfa.num_states - 1}  ({dfa.num_states} states)")
    print(f"  Accepting states      : {dfa.num_accept}")
    print(f"  Defined transitions   : {dfa.num_transitions}")
    print(f"  Input alphabet Σ      : a–z  (uppercase normalised before processing)")
    print(f"  Recognised vocabulary : {len(WORD_MAP)} closed-class words\n")

    # ── Sample DFA paths ───────────────────────────────────────────────────
    print(f"{CYAN}[ SAMPLE DFA STATE PATHS ]{RESET}")
    sample_words = ["the", "and", "can", "she", "in", "xyz"]
    for sw in sample_words:
        steps = dfa.trace(sw.lower())
        path  = "q0"
        for ch, _, to, trap in steps:
            lbl  = "TRAP" if trap else f"q{to}"
            path += f" --{ch}--> {lbl}"
        acc, _ = dfa.run(sw.lower())
        tag    = f"  {GREEN}[ACCEPT]{RESET}" if acc else f"  {RED}[REJECT]{RESET}"
        print(f"  '{sw:>4}' : {path}{tag}")
    print()

    # ── Word-by-word trace table ────────────────────────────────────────────
    _sep("─")
    print(f"{CYAN}[ WORD-BY-WORD DFA TRACE ]{RESET}")
    _sep("─")
    hdr = f"  {'#':<5} {'Original':<18} {'Lowercase':<18} {'Position':<14} {'Status':<10} Category"
    print(hdr)
    print("  " + "─" * 76)

    for idx, (word, start, end, cats, acc) in enumerate(all_tokens, 1):
        status = GREEN + "ACCEPT" + RESET if acc else RED + "REJECT" + RESET
        cat_s  = ", ".join(cats) if cats else "—"
        pos    = f"chars {start}–{end - 1}"
        print(f"  {idx:<5} {word:<18} {word.lower():<18} {pos:<14} {status:<19} {cat_s}")

    # ── Findings ───────────────────────────────────────────────────────────
    _sep("─")
    print(f"{CYAN}[ ACCEPTED CLOSED CLASS WORDS ]{RESET}")
    _sep("─")

    if not findings:
        print("  No closed class words found in the text.")
    else:
        print(f"  {'#':<5} {'Word':<18} {'Position':<14} Category")
        print("  " + "─" * 58)
        for idx, (word, start, end, cats, _) in enumerate(findings, 1):
            pos = f"chars {start}–{end - 1}"
            print(f"  {idx:<5} {word:<18} {pos:<14} {', '.join(cats)}")

    # ── Summary ────────────────────────────────────────────────────────────
    _sep("─")
    print(f"{CYAN}[ SUMMARY ]{RESET}")
    _sep("─")
    print(f"  Total tokens scanned      : {len(all_tokens)}")
    print(f"  Closed class words found  : {len(findings)}")

    # Count by category
    cat_counts: dict[str, int] = {}
    for _, _, _, cats, _ in findings:
        for c in cats:
            cat_counts[c] = cat_counts.get(c, 0) + 1

    print(f"\n  Occurrences by category:")
    for cat in ["Conjunction", "Preposition", "Determiner", "Pronoun", "Modal"]:
        bar = "█" * cat_counts.get(cat, 0)
        print(f"    {cat:<15} : {cat_counts.get(cat, 0):>3}  {bar}")

    # Frequency table (unique words)
    freq: dict[str, dict] = {}
    for word, _, _, cats, _ in findings:
        lw = word.lower()
        freq.setdefault(lw, {"count": 0, "cats": cats})
        freq[lw]["count"] += 1

    print(f"\n  Unique closed class words used : {len(freq)}")
    print(f"  {'Word':<20} {'Count':<8} Category")
    print("  " + "─" * 52)
    for w, info in sorted(freq.items(), key=lambda x: -x[1]["count"]):
        print(f"  {w:<20} {info['count']:<8} {', '.join(info['cats'])}")

    # ── Highlighted text ───────────────────────────────────────────────────
    _sep("─")
    print(f"{CYAN}[ INPUT TEXT – CLOSED CLASS WORDS HIGHLIGHTED (bold + underline) ]{RESET}")
    _sep("─")
    print()
    print(highlighted_text(text, findings))
    print()
    _sep()


# ===========================================================================
#  MAIN
# ===========================================================================
def main() -> None:
    _sep()
    print("  CPT411 Assignment 1 – L5: Closed Class Words DFA Recognizer")
    _sep()

    # ── Build DFA ───────────────────────────────────────────────────────────
    print("\n[*] Building trie-based DFA from closed class word lists …")
    dfa = TrieDFA(list(WORD_MAP.keys()))
    print(
        f"[*] DFA ready.  "
        f"States: {dfa.num_states}  |  "
        f"Transitions: {dfa.num_transitions}  |  "
        f"Accept states: {dfa.num_accept}\n"
    )

    # ── Locate text file ───────────────────────────────────────────────────
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
    else:
        default = os.path.join(os.path.dirname(__file__), "sampletext3.txt")
        prompt  = f"Enter text file path [default: sampletext3.txt]: "
        entered = input(prompt).strip()
        filepath = entered if entered else default

    try:
        with open(filepath, "r", encoding="utf-8") as fh:
            text = fh.read()
    except FileNotFoundError:
        print(f"\n[ERROR] File not found: {filepath}")
        sys.exit(1)

    print(f"[*] Loaded '{os.path.basename(filepath)}'  ({len(text)} characters)\n")

    # ── Single pattern test ────────────────────────────────────────────────
    _sep("-")
    print("  SINGLE PATTERN TEST  (type a word and see the DFA state walk)")
    _sep("-")
    raw = input("Enter word to test (press Enter to skip): ").strip()
    print()
    if raw:
        print_single_pattern_report(dfa, raw)

    # ── Additional predefined test cases ──────────────────────────────────
    _sep("-")
    print("  PREDEFINED TEST CASES")
    _sep("-")
    test_cases = [
        ("and",   "ACCEPT – Conjunction"),
        ("the",   "ACCEPT – Determiner"),
        ("can",   "ACCEPT – Modal"),
        ("she",   "ACCEPT – Pronoun"),
        ("in",    "ACCEPT – Preposition"),
        ("food",  "REJECT – common noun"),
        ("quick", "REJECT – adjective"),
        ("xyz",   "REJECT – not a word"),
    ]
    print(f"  {'Word':<12} {'Expected':<30} {'DFA Result':<10} {'Pass?'}")
    print("  " + "─" * 60)
    for word, expected in test_cases:
        acc, _ = dfa.run(word.lower())
        result  = "ACCEPT" if acc else "REJECT"
        passed  = expected.startswith(result)
        tick    = GREEN + "PASS" + RESET if passed else RED + "FAIL" + RESET
        print(f"  {word:<12} {expected:<30} {result:<10} {tick}")
    print()

    # ── Full text scan ─────────────────────────────────────────────────────
    print("[*] Scanning full text …")
    all_tokens, findings = scan_text(dfa, text)
    print(f"[*] Done.  {len(all_tokens)} tokens scanned, {len(findings)} accepted.\n")

    print_full_report(dfa, text, filepath, all_tokens, findings)


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    main()
