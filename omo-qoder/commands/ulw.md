---
description: "Run the ultrawork lifecycle: plan threshold, waves, dual evidence, review gate"
---

# /ulw

Goal: `$ARGUMENTS`

## Protocol

1. If the goal spans multiple files and no approved plan exists, read
   `skills/ulw-plan/SKILL.md` and run its planning threshold. Do not execute
   until the plan is approved.
2. Read `skills/ulw-execute/SKILL.md` and follow it exactly.
3. Use the approved plan path if one exists. If not, create the plan first.
4. Stop before execution when the acceptance check or rollback is missing.
5. Record execution state under `.omq/`, never outside it.
6. Report the wave summary, per-task evidence, and the review verdict.

Do not mark the goal complete without command evidence and an independent
review.
