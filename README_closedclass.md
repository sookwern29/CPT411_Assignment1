# CPT411 Assignment 1 — Technical Report
## L5: English Closed Class Words Finder (DFA Recognizer)

---

## I. Introduction

### Language Definition

This program implements a Deterministic Finite Automaton (DFA) recognizer for **L5: English Closed Class Words**. Closed class words are parts of speech that have a fixed (or nearly fixed) set of members — they rarely gain new words, unlike open classes such as nouns or verbs.

The language recognized is:

```
L = { w ∈ Σ* | w is an English closed-class word }
Σ = { a, b, c, …, z }   (uppercase letters are normalized to lowercase before processing)
```

### Scope

The recognizer covers five closed-class categories:

| Category | Example Members | Count |
|---|---|---|
| **Conjunction** | and, but, or, because, although, while, though | 31 |
| **Preposition** | in, on, at, of, for, with, through, between, over | 46 |
| **Determiner** | the, a, an, this, my, their, some, every, many | 37 |
| **Pronoun** | I, you, she, he, it, we, they, who, someone | 35 |
| **Modal** | can, could, may, might, shall, should, will, would, must | 12 |

Some words belong to more than one category (e.g., `"for"` is both a Conjunction and a Preposition; `"both"` is both a Conjunction and a Determiner). The program records all applicable categories.

The total vocabulary recognized is **143 unique closed-class words**.

---

### Complete DFA Design

The DFA is built as a **trie** (prefix tree) over the entire word list. A trie is ideal here because:
- All words in the vocabulary share the same input alphabet.
- Common prefixes (e.g., `"the"` / `"their"` / `"these"` / `"they"` / `"them"`) can reuse states up to their branch point, producing a compact and correct DFA.
- Each node in the trie maps directly to a unique DFA state.

**Formal DFA Definition:**

```
M = (Q, Σ, δ, q0, F)

Q  = { q0, q1, q2, …, q412 }  ∪  { qTRAP }   (413 states + implicit trap)
Σ  = { a, b, c, …, z }
q0 = start state
F  = { q3, q8, q14, … }  (143 accepting states, one per recognized word)
δ  = transition function (412 defined transitions; all others → qTRAP)
```

**Rules:**
- q0 is the single start state.
- Each character in the vocabulary creates or follows a transition in the trie.
- A state is an **accept state** if and only if the path from q0 to that state spells out a recognized closed-class word exactly.
- Any input character with no defined transition causes the machine to enter the **trap state** (qTRAP = −1). Processing terminates immediately upon entering the trap state.

**Sample DFA paths (partial view of the full trie):**

```
"the"   : q0 --t--> q23 --h--> q24 --e--> q232*
"their" : q0 --t--> q23 --h--> q24 --e--> q232 --i--> q233 --r--> q234*
"they"  : q0 --t--> q23 --h--> q24 --e--> q232 --y--> q235*
"and"   : q0 --a--> q1  --n--> q2  --d--> q3*
"can"   : q0 --c--> q378 --a--> q379 --n--> q380*
"in"    : q0 --i--> q20 --n--> q104*
"xyz"   : q0 --x--> qTRAP   (no transition → REJECT)

(* = accepting state)
```

Note how `"the"`, `"their"`, and `"they"` share states q23 and q24 before branching — this is the key property of the trie-based DFA that avoids state explosion while remaining deterministic.

---

## II. Implementation Information

### a. How Strings Are Read and Processed

#### Step 1 — Text Tokenization (character-by-character scan)

The scanner reads the raw input text **one character at a time** from left to right using an integer index `i`. It does **not** use `split()`, `re.findall()`, or any bulk word-extraction method:

```python
i = 0
n = len(text)
while i < n:
    if text[i].isalpha():
        word_start = i
        chars = []
        while i < n and text[i].isalpha():
            chars.append(text[i].lower())   # normalize to lowercase
            i += 1
        # chars now holds one token, assembled one character at a time
    else:
        i += 1   # skip punctuation, spaces, digits
```

This satisfies the assignment requirement that all processing is done character by character.

#### Step 2 — DFA Simulation (one character at a time)

Each collected token is passed to `TrieDFA.run()`, which simulates the DFA by reading **one character at a time** in a loop:

```python
def run(self, word: str) -> tuple[bool, int]:
    state = 0                        # begin at start state q0
    for ch in word:
        key = (state, ch)
        if key in self.transitions:
            state = self.transitions[key]
        else:
            return False, self.TRAP  # no transition → enter trap state, halt
    accepted = state in self.accept_states
    return accepted, state
```

At each step:
1. The current state and next character form a lookup key `(state, char)`.
2. If the key exists in the transition table `δ`, the machine moves to the next state.
3. If the key does **not** exist, the machine immediately enters the trap state and returns `REJECT` — no further characters are processed.
4. After consuming all characters, the machine returns `ACCEPT` only if the final state is in the set of accepting states `F`.

This is a faithful, character-level simulation of a DFA.

#### Step 3 — DFA Construction (trie build)

The DFA transition table is built automatically from the word list by `TrieDFA._build()`:

```python
def _build(self, word_list):
    for word in word_list:
        state = 0
        for ch in word:
            key = (state, ch)
            if key not in self.transitions:
                self.transitions[key] = self._alloc()   # new state
            state = self.transitions[key]
        self.accept_states[state] = word   # mark final state as accepting
```

For every word, the builder walks from q0 one character at a time. If a transition already exists (shared prefix), it reuses the existing state. Otherwise it allocates a new state integer. After the last character of the word, that state is recorded as an accepting state.

---

### b. Overview of Programming Constructs

| Construct | Purpose |
|---|---|
| **Class `TrieDFA`** | Encapsulates all DFA logic: state allocation, trie construction, simulation, and step-by-step tracing |
| **`dict[(int, str) → int]`** | Implements the DFA transition function δ. Key = `(current_state, character)`, value = `next_state`. O(1) average lookup per character |
| **`dict[int → str]`** (`accept_states`) | Maps each accepting state ID to the word it completes, enabling category lookup after acceptance |
| **`dict[str → list[str]]`** (`WORD_MAP`) | Many-to-many mapping of words to their categories, handling overlapping classes |
| **`while` loop with index `i`** | Reads the source text one character at a time during tokenization |
| **`for ch in word` loop** | Reads each token one character at a time during DFA simulation |
| **ANSI escape codes** | Produces bold+underline highlighting of accepted words in terminal output |
| **`sys.argv`** | Accepts the text file path as a command-line argument |

#### Key design decisions:

- **Trie as DFA:** Instead of manually drawing and hard-coding hundreds of states, the trie is generated automatically from the word list. This makes the DFA extensible — adding a new word only requires adding it to the list.
- **Early trap termination:** As required by the assignment, the program terminates DFA simulation immediately upon entering the trap state, avoiding unnecessary character processing.
- **Uppercase normalization:** Letters are converted to lowercase before being fed to the DFA, so `"The"`, `"THE"`, and `"the"` all map to the same DFA path. The original capitalization is preserved only in the display output.
- **Implicit trap state:** The trap state is represented by the integer `−1`. It has no outgoing transitions and is never explicitly stored in the transition table, keeping memory usage minimal.

---

## III. Conclusion

This project implements a complete, character-level Deterministic Finite Automaton recognizer for English closed-class words (Conjunctions, Prepositions, Determiners, Pronouns, and Modals). The DFA is constructed as a trie over a vocabulary of 143 words, resulting in 413 states and 412 defined transitions.

The program strictly adheres to the DFA simulation model: every character is processed individually through the transition function δ(state, char), and processing halts as soon as the trap state is entered. No regular expression libraries or whole-word lookups are used for the core recognition logic.

When run on the provided sample text (`sampletext3.txt`, 674 characters, 116 tokens), the program correctly identifies **47 closed-class word occurrences** across 22 unique words, with Determiners being the most frequent category (16 occurrences). The output provides a complete audit trail: a step-by-step DFA state trace, a token-by-token accept/reject table with character positions, a frequency breakdown by category and word, and a visually highlighted version of the original text.

---

## IV. Appendix — Full Program

### How to Run

**Requirements:** Python 3.10 or later (no external libraries needed).

```bash
# With the sample text file
python closed_class_dfa.py sampletext3.txt

# Interactive (prompts for file path)
python closed_class_dfa.py
```

### Sample Output (excerpt)

```
Single pattern test — word: "for"
  Pattern (input string) : 'for'
  Normalised input       : 'for'
  Status                 : ACCEPT
  Category               : Conjunction, Preposition

  DFA State Trace
  Step   Char     From           To
  1      'f'     q0             q12
  2      'o'     q12            q13
  3      'r'     q13            q14
  All 3 character(s) consumed. Final state q14 is an ACCEPT state.

Single pattern test — word: "food"
  Pattern (input string) : 'food'
  Normalised input       : 'food'
  Status                 : REJECT

  DFA State Trace
  Step   Char     From           To
  1      'f'     q0             q12
  2      'o'     q12            q13
  3      'o'     q13            TRAP    ← Entering trap state – processing terminated
```

```
Summary for sampletext3.txt
  Total tokens scanned      : 116
  Closed class words found  : 47

  Occurrences by category:
    Conjunction     :  14  ██████████████
    Preposition     :  15  ███████████████
    Determiner      :  16  ████████████████
    Pronoun         :   9  █████████
    Modal           :   0
```

### Full Source Code

See [`closed_class_dfa.py`](closed_class_dfa.py) in this repository.
