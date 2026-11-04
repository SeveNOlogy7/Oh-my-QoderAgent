---
name: ulw-plan
description: Interview-driven planning for OMO-style work; use before a multi-step change or when the user invokes /hyperplan.
---

# ulw-plan

## Purpose

Turn a request into a small, testable plan before any code changes. This is the
planning half of the OMO ultrawork lifecycle. It produces a plan artifact, not
an implementation.

## Use when

- The task spans multiple files, packages, or sessions.
- The user asks to plan, interview, or run `/hyperplan`.
- The acceptance criteria are not yet observable.
- A previous attempt failed and the cause is still unclear.

## Do not use when

- The request is a single obvious edit; just do it.
- The user has already approved a plan and asked for execution; use
  `ulw-execute` instead.
- The question is a read-only lookup; answer it directly.

## Protocol

### 1. Activate

State the planning goal and the current evidence you have. Do not write code.
Do not create `.omq/` until the plan is actually being written.

### 2. Gather facts

Inspect the repository with Read and Bash (`ls`, `rg`, `grep`). Record:

- entry points and build/test commands
- existing conventions and state directories
- related tests and failure modes
- any prior plan under `.omq/plans/`

Never ask the user for a fact the repository can answer.

### 3. Interview

Ask one question at a time. Ask only about:

- scope boundaries and non-goals
- priorities and acceptable risk
- compatibility or deadline constraints
- who approves the plan

Stop when the goal, non-goals, acceptance checks, and rollback are clear.

### 4. Apply the planning threshold

Do not proceed to a plan while any of these is unknown:

- the observable end state
- what is explicitly out of scope
- how each step will be verified
- how to roll back

### 5. Write the plan

Write `.omq/plans/{slug}.md` with:

```markdown
# {Title}

## Context
Evidence with file paths and commands.

## Goal
One sentence.

## Non-goals
Explicit exclusions.

## Steps
1. Action
   - Files
   - Acceptance check
2. ...

## Risks
- Risk and mitigation.

## Rollback
How to return to the current state.

## Approval
Pending explicit user approval.
```

### 6. Critic pass

List the three most likely failure modes and the check that catches each one.
If a failure mode has no check, add one step or narrow the plan.

### 7. Approval gate

Present the plan and wait. Do not implement, commit, push, or spawn an executor
until the user explicitly approves.

### 8. Handoff

On approval, hand off to the execution entrypoint the user selected. The
default is `/omo-qoder:ulw`. Preserve the plan path in the handoff.

## Output

- plan path
- step summary
- the one decision the user must make now
- approval status

## State

Only `.omq/plans/` is written. No upstream state paths, no source edits, no
state outside the project.
