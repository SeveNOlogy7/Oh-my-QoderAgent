---
name: ulw-research
description: Maximum-saturation research with source triangulation, excursions, and a closing briefing; use for open questions and external API/docs research.
---

# ulw-research

## Purpose

Answer an open question with enough evidence that the caller can act on it.
Research is not a link dump: it decomposes the question, gathers independent
sources, follows surprising leads, and closes with a decision-ready briefing.

## Use when

- The question depends on external documentation, an API version, or a
  landscape comparison.
- The caller needs a recommendation with evidence and uncertainty.
- A plan has an unresolved technical unknown.

## Do not use when

- The answer is in the repository and a file read suffices.
- The caller asked for code changes; use `ulw-execute`.
- The question is a simple fact with one authoritative source.

## Protocol

### 1. Define the question

Write one sentence: what decision will this research change? List the
non-questions so the scope does not drift.

### 2. Decompose

Split the question into sub-questions that can each be answered by a source.
Mark which sub-questions are blocking.

### 3. Gather

Prefer primary sources: official documentation, changelogs, schemas, the
installed package's own types, and the repository. Use the librarian role for
external docs. Record every source with a URL or file path and a version pin.
If the graph profile is degraded, use the built-in Explore agent plus Bash
`grep`/`rg` instead of waiting for CodeGraph.

### 4. Triangulate

For each material claim, seek a second independent source. Separate:

- what the source says
- what you infer
- what remains unknown

### 5. Excursions

Follow a surprising lead only when it could change the decision. Time-box the
excursion and record what it changed. Do not wander into unrelated topics.

### 6. Stop condition

Stop when the blocking sub-questions have at least two independent sources, or
when the remaining gap is explicitly recorded as unknown. Do not keep
researching to fill space.

### 7. Closing briefing

Deliver:

- the answer in one paragraph
- the decision it supports
- evidence with citations and version pins
- confidence and the largest remaining gap
- the next probe, if the gap matters

## Guardrails

- No code changes.
- No fabricated URLs, versions, or quotes.
- No claim without a source unless labeled as inference.
- No open-ended browsing without a decision it could change.

## Output

```text
Answer: ...
Decision: ...
Evidence:
- [source] — [constraint]
Confidence: high | medium | low
Gap: ...
Next probe: ...
```
