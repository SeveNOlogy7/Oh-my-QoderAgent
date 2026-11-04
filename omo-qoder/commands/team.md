---
description: "Run parallel team mode with a task DAG, leases, and an independent review gate"
---

# /team

Goal: `$ARGUMENTS`

## Seven-step protocol

1. **Decompose**: split the goal into tasks that can be verified independently.
   Each task needs an objective, files, acceptance check, and evidence type.
2. **Build the DAG**: record dependencies in `.omq/runtime/waves.json`. A task
   with an unmet dependency is not ready.
3. **Choose the scheduler**: use the coordinator MCP when
   `profiles.orchestration` is on; otherwise use the wave file fallback.
   Enable it with `node "$QODER_PLUGIN_ROOT/tools/omo-profile.mjs" enable orchestration`
   and restart the session.
4. **Claim and lease**: the main agent claims ready tasks and records the lease.
   Respect the parallel limit. Complete/fail must pass the same owner; an
   expired lease can be taken over by another owner.
5. **Dispatch**: use `omo-atlas` to produce 8-element proposals, then spawn the
   assigned role for each task. Role agents never spawn other agents.
6. **Collect evidence**: a task is done only with command output and an
   independent review verdict.
7. **Aggregate**: run `review-work` over the combined result. Any blocker means
   REVISE; no commit without explicit user approval.

## Hard rules

- No shared writable files between parallel tasks.
- No task marked done without evidence.
- No subagent spawning from a subagent.
- No commit, push, or remote action unless the user asked.
- If the coordinator is unavailable, degrade to the wave-file fallback; do not
  fail the whole run.
