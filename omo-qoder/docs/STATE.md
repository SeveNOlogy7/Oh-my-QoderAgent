# `.omq` state contract

## Scope

State is project-local. There is no global state directory and no shared state
with the `oh-my-qoder` plugin. The directory is `.omq/`, deliberately not
`.omo/`: upstream oh-my-openagent writes `.omo/`, and both must be able to run in
one project without touching each other's files. A `.omq/` tree left behind by the
deprecated `oh-my-qoder` plugin is only read through the exact subpaths below;
anything else in it is ignored.

## Layout

```text
.omq/
  plans/
    {slug}.md              # approved plan
    {slug}.tasks.json      # optional task breakdown
  runtime/
    waves.json             # core wave state + coordinator mirror
    coordinator.sqlite     # truth when orchestration is enabled
  evidence/
    {task-id}.json         # command output + reviewer verdict
  config.json              # profile and keyword switches
```

The coordinator is implemented in `mcp/coordinator/` (13 tools, SQLite WAL) and
is enabled per project with `tools/omo-profile.mjs`. Without it, the core
wave-file fallback is authoritative.

## `config.json`

```json
{
  "keyword_hook": false,
  "profiles": {
    "orchestration": false,
    "graph": false,
    "dashboard": false
  }
}
```

All switches default to `false`. An absent file means all profiles are off.

## `waves.json`

The core fallback writes a subset of this shape. When orchestration is enabled,
the coordinator writes the full shape atomically after every task mutation and
preserves `plan`/`wave` from the existing file. The SQLite database remains the
single source of truth; this file is a mirror.

```json
{
  "plan": ".omq/plans/example.md",
  "wave": 1,
  "tasks": [
    {
      "id": "T1",
      "role": "omo-junior",
      "status": "pending",
      "acceptance": "command or observable check",
      "evidence": [],
      "dependsOn": [],
      "leaseOwner": null,
      "leaseUntil": null
    }
  ],
  "generatedAt": "2026-10-27T00:00:00.000Z",
  "source": "coordinator"
}
```

Task status is one of `pending`, `active`, `done`, `failed`, or `blocked`.
`ready` is computed by dependency checks, not stored. A task cannot be `done`
without at least one evidence entry.

## Leases

The coordinator stores leases in SQLite (`lease_owner`, `lease_until`) and
mirrors them into `waves.json`. A task is claimed with an owner and a lease.
An expired lease can be taken over by another owner; a reentrant claim by the
same owner refreshes the lease. `release` and `complete` require the matching
owner; `fail` requires the matching owner only when the task is active. A
`pending` or `blocked` task may be failed without a lease.

There is no separate `leases.json` file.

## Evidence

Each evidence entry records:

```json
{
  "kind": "test",
  "command": "npm test -- --run",
  "exitCode": 0,
  "summary": "12 passed",
  "reviewer": "omo-reviewer",
  "verdict": "APPROVE",
  "at": "2026-10-27T00:00:00Z"
}
```

## Write rules

1. The main agent is the single writer for plans. When orchestration is off,
   the main agent or Atlas writes wave state; when it is on, the coordinator is
   the single writer for tasks and `waves.json`, and the agent must not write it.
2. Use atomic writes: write a temporary file in the same directory, then rename
   it.
3. Never write outside `.omq/` except for code changes the user explicitly
   requested.
4. The coordinator database is the single source of truth when orchestration is
   enabled; `waves.json` is a mirror, not a second authority.
5. The dashboard is read-only and never mutates state.

## Zero-intrusion rules

- Ordinary chat and single-file edits do not create `.omq/` or spawn a role.
- Only `/ulw`, `/team`, `/hyperplan`, `/omo-status`, and `/omo-doctor` enter a
  mode; the keyword hook is opt-in per project.
- Every optional profile is off by default.
- A failure in a profile degrades only that profile; core state must remain
  readable.
