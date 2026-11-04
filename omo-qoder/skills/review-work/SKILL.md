---
name: review-work
description: Parallel multi-lane review gate with evidence-based verdicts; use before completion, commit, or handoff.
---

# review-work

## Purpose

Gate work before it ships. Five independent lanes inspect the same change from
different angles; the main agent aggregates their findings into one verdict.
A single blocker stops the change.

## Use when

- `ulw-execute` reaches its review gate.
- The user asks for a code review of a diff or branch.
- A change is about to be committed, handed off, or released.

## Do not use when

- The work is a trivial typo or a read-only answer.
- There is no diff or artifact to review.

## Lanes

Spawn the lanes in parallel from the main agent. Role agents never spawn.

| Lane | Agent | Question |
|---|---|---|
| Requirements | `omo-critic` | Does the change satisfy the stated goal and non-goals? |
| Correctness | `omo-reviewer` | Are there logic, edge-case, security, or regression defects? |
| Architecture | `omo-oracle` | Does the change fit the system boundaries and create hidden risk? |
| Sources | `omo-librarian` | Do the APIs and versions match the authoritative docs? |
| Visual | `omo-looker` | Does the UI match the reference, if a UI change exists? |

If a lane does not apply, record the reason instead of silently skipping it.
The visual lane is skipped only when there is no visual artifact.

## Protocol

1. Assemble the review package: goal, non-goals, diff, tests, and commands run.
2. Spawn the applicable lanes in parallel. Give each lane the package and its
   question, not the expected answer.
3. Require each lane to return findings with severity (`blocker`, `major`,
   `minor`), evidence (`file:line` or command output), and a verdict.
4. Aggregate: any blocker means REVISE; any unresolved major means REVISE.
   APPROVE requires no blocker or major finding.
5. Run the aggregate verification command yourself; do not rely on a lane's
   claim that it passed.
6. Report the verdict, blockers, evidence, and residual risk.

## Evidence rules

- A finding without evidence is a hypothesis, not a blocker.
- A passing claim without command output is unverified.
- Cite file:line for code findings and the exact command for test findings.
- Do not approve with an unresolved blocker because the change is large or late.

## Output

```text
Verdict: APPROVE | REVISE | REJECT

Blockers:
- [lane] {finding} — {evidence} — {required fix}

Major:
- ...

Minor:
- ...

Lanes run: requirements, correctness, architecture, sources, visual
Skipped lanes: {lane — reason}
Verification: {command} -> {result}
Residual risk: ...
```
