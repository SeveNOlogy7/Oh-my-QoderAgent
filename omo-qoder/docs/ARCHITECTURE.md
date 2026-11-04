# Architecture

## Principle

OMO for Qoder ports the **orchestration shape** of OmO, not its source tree:
specialized role agents, explicit protocols, independent review, dual evidence,
and a project-local state contract. Ordinary chat stays on the main agent.

## Four layers

```text
execution      role agents + skills + explicit commands      always on
scheduling     coordinator MCP (SQLite WAL)                  optional
semantics      CodeGraph MCP                                 optional
presentation   dashboard + status renderer                   optional
```

Only the execution layer is required. Each optional layer has its own switch
and its own fallback. The plugin's `.mcp.json` is empty; profiles are enabled
per project by `tools/omo-profile.mjs`, which writes `.omq/config.json` and the
project `.mcp.json`.

## Core execution layer

- `agents/*.md` are discovered by the host. The manifest does not declare
  `agents`; Qoder scans the directory.
- `commands/*.md` are markdown protocol entrypoints. They dispatch to skills or
  run bundled tools.
- `skills/<name>/SKILL.md` holds the reusable protocol. The manifest lists skill
  directories explicitly.
- Hooks live under `hooks/` and are auto-discovered from `hooks/hooks.json`.
  The keyword gate is present but default-off; when a project enables it, it
  only adds a command hint and never starts a workflow or writes state.

## State contract

Project state is confined to `.omq/`:

| Path | Meaning |
|---|---|
| `.omq/plans/*.md` | Approved plans and task breakdowns |
| `.omq/runtime/*.json` | Wave/task fallback state; `waves.json` is an atomic coordinator mirror when orchestration is on |
| `.omq/runtime/coordinator.sqlite` | Coordinator truth when orchestration is on; WAL mode |
| `.omq/config.json` | Profile switches and optional keyword gate |

The full schemas, evidence format, atomic-write rule, and zero-intrusion rules
are in `docs/STATE.md`.

Rules:

1. No write outside `.omq/` unless the user asked for a code change.
2. A profile failure may not corrupt core state.
3. The coordinator database is the single source of truth when enabled; the
   file state is a mirror, never a second writer.
4. The dashboard is read-only and cannot mutate tasks.

## Role boundaries

Role agents never spawn other agents. The main agent owns orchestration. This
is a structural constraint: read-only roles get a tool whitelist without
`Edit`/`Write`, and the prompts additionally forbid using Bash to write.

## Model tiers

Qoder CLI validates the literal `model` field at spawn time. Use only values
the host reports: `Auto` for planning, critique, deep coding, scheduling,
architecture, and review; `Fast` for single-task execution, retrieval, and
visual acceptance. Do not use `performance` or other display-only tier names.


## Door model

- `/ulw` enters the ultrawork lifecycle.
- `/team` enters parallel team mode.
- `/hyperplan` enters planning only.
- The keyword hook, when enabled, can suggest a mode but never silently writes
  state.

Everything else is ordinary chat.

## Qoder host mapping

| Need | Qoder mechanism |
|---|---|
| Plugin manifest | `.qoder-plugin/plugin.json` |
| Agents | `agents/*.md` auto-discovery |
| Commands | `commands/*.md` |
| Skills | `skills/<name>/SKILL.md` + manifest list |
| Hooks | `hooks/hooks.json` auto-discovery |
| MCP | `.mcp.json` with `${QODER_PLUGIN_ROOT}` |
| Plugin root | `QODER_PLUGIN_ROOT` |
| Project root | `QODER_PROJECT_DIR` |

## Presentation layer

`dashboard/server.mjs` is the optional read-only dashboard. It binds
`127.0.0.1`, uses a random port and a random per-start token, serves a static
shell plus `/api/status`, rejects every non-GET method with 405, and never
writes `.omq/`. Without it, use `/omo-status`.

## Degradation

| Profile | Failure | Fallback |
|---|---|---|
| orchestration | MCP unavailable or sqlite busy | `.omq/runtime/` wave files |
| graph | CodeGraph missing or index stale | Explore + Bash grep/rg (profile marked degraded; no MCP entry written) |
| dashboard | port/token failure | `/omo-status` |
| keyword gate | script error or config off | slash commands only |
