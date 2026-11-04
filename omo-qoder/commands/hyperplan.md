---
description: "Planning only: interview, critic gap analysis, and an approval gate; no execution"
---

# /hyperplan

Topic: `$ARGUMENTS`

## Protocol

1. Read `skills/ulw-plan/SKILL.md` and follow the planning protocol.
2. Use `omo-planner` for the interview and the plan artifact under
   `.omq/plans/`.
3. Use `omo-critic` for a read-only gap analysis: missing requirements,
   unverifiable acceptance checks, and rollback risks.
4. Present the plan, the critic findings, and the single decision the user must
   make now.
5. Stop. Do not implement, spawn an executor, commit, or push.

On approval, tell the user to run `/omo-qoder:ulw` with the plan path.
