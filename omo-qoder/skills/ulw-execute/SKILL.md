---
name: ulw-execute
description: Execute an approved plan through the ultrawork lifecycle with waves, dual evidence, and a review gate; use after /ulw or plan approval.
---

# ulw-execute

## Purpose

Turn an approved plan into verified work. This is the execution half of the
ultrawork lifecycle. It coordinates role agents, records state under `.omq/`,
and refuses to call work complete without command evidence and an independent
review.

## Use when

- The user invokes `/ulw` with an approved plan or a bounded goal.
- A plan exists under `.omq/plans/` and its approval gate is satisfied.
- A previous execution attempt failed and the plan still covers the task.

## Do not use when

- There is no plan and the task is multi-step; run `ulw-plan` first.
- The task is a single obvious edit; do it directly.
- The user asked only for research or a review; use those protocols.

## Lifecycle

### 1. Activation

Confirm the entry is explicit (`/ulw` or a direct execution request). Restate
the goal and the plan path. Do not write state yet.

### 2. Goal registration

Read the plan. Record the approved goal and non-goals in
`.omq/plans/{slug}.md`. If the plan lacks an acceptance check or rollback, stop
and return to `ulw-plan`.

### 3. Skill inventory

Identify the skills and roles the plan actually needs. Do not spawn roles for
work the main agent can do directly. Read-only roles must receive read-only
tasks.

### 4. Certainty safeguards

Stop before execution if any of these is missing:

- an observable acceptance check
- the files or surfaces in scope
- the rollback path
- the authority to change the code

### 5. Planning threshold

If the work spans multiple files or an unknown surface, require a plan. A
single-file, obvious change may proceed without one.

### 6. Execution

Group ready tasks into waves. Respect dependencies and the parallelism limit.
The main agent spawns roles; role agents never spawn other agents. Dispatch
each task with its objective, inputs, files, acceptance check, and required
evidence. Prefer the coordinator MCP when enabled; otherwise use
`.omq/runtime/waves.json`. When the coordinator is enabled, claim and close
each task with the same owner id; an expired lease may be taken over, and
complete/fail without the lease owner is rejected.

### 7. Dual evidence

A task is complete only when it has:

1. command evidence: the exact command, exit code, and output summary; and
2. an independent review verdict from `review-work`.

A claim without both is unverified.

### 8. Review gate and commit

Run `review-work` over the aggregate diff. Any blocker means REVISE; do not
commit. Commit only if the user asked. Report changed files, checks, and
residual risk.

## Hard rules

- No writes outside `.omq/` except the code change the user requested.
- No subagent spawning from a subagent.
- No task marked done without evidence.
- No review skipped because the change is large or late.
- No commit or push without an explicit user request.
- No retry loop without new evidence; stop and report the blocker.

## Output

- plan path and wave summary
- per-task evidence
- aggregate review verdict
- residual risk and next decision
