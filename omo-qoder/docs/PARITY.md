# Capability parity: OmO v4.19.4 -> omo-qoder v1.0

Status values: `planned`, `in-progress`, `done`, `gap`, `n/a`.

## Roles

| OmO role | omo-qoder agent | Status |
|---|---|---|
| Prometheus (planning) | `omo-planner` | done |
| Metis (plan critique) | `omo-critic` | done |
| Hephaestus (deep coding) | `omo-deep` | done |
| Sisyphus-Junior (single task) | `omo-junior` | done |
| Atlas (wave state/dispatch) | `omo-atlas` | done |
| Oracle (architecture/debug) | `omo-oracle` | done |
| Momus (adversarial review) | `omo-reviewer` | done |
| Librarian (docs/API retrieval) | `omo-librarian` | done |
| Looker (visual acceptance) | `omo-looker` | done |
| Explore (host built-in) | reused | n/a |

Model tiers: Qoder CLI validates the literal `model` value. High-complexity
roles use `Auto`; single-task/retrieval/visual roles use `Fast`. The literal
`performance` is rejected by `qodercn` at spawn time even though the agent list
displays it, so it is not used here.

## Protocols and skills

| OmO capability | omo-qoder entry | Status |
|---|---|---|
| ultrawork lifecycle | `/ulw` + `ulw-execute` | done |
| Team Mode | `/team` + coordinator | done |
| Planning / Prometheus | `/hyperplan` + `ulw-plan` | done |
| Maximum-saturation research | `ulw-research` | done |
| Parallel review gate | `review-work` | done |
| Status board | `/omo-status` | done |
| Self-check | `/omo-doctor` | done |
| Keyword hint gate | `hooks/keyword-gate.mjs` | done (default off) |

## Optional layers

| Capability | omo-qoder profile | Status |
|---|---|---|
| Coordinator MCP (13 tools, SQLite WAL) | `orchestration` | done |
| CodeGraph semantic lookup | `graph` | done (external install + index required; fallback Explore + grep) |
| Read-only dashboard | `dashboard` | done (loopback, token-gated, no write channel) |
| Keyword hint gate | hook | done (default off) |

## Deliberate gaps in v1.0

| OmO capability | Decision |
|---|---|
| Native CLI / daemon | n/a for a Qoder plugin |
| OpenCode V2 host support | n/a; Qoder is the host |
| Claude Code compatibility shims | n/a; use Qoder conventions |
| Full model-routing parity | gap; use Qoder tiers (`auto`, `performance`, `lite`) and document per-role choices |
| Hash-anchored edit runtime | gap; Qoder's Edit tool is used; revisit only if evidence shows a need |
| Upstream whole-repo sync | not allowed; selective protocol sync only |

## License boundary

Upstream OmO is under the Sustainable Use License 1.0. This project re-derives
protocols and records no copied upstream source. Attribution and pinned
commits live in `NOTICE` and `upstream/omo-sources.lock.json`.
