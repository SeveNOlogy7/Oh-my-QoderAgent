# OMO for Qoder (omo-qoder)

OMO-style multi-agent orchestration for Qoder. The design target is capability
parity with [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)
v4.19.4: role agents, explicit protocols, and project-local state.

This is **not** the `oh-my-qoder` plugin. It uses a different plugin id,
namespace, agent catalog, and command set. Its state directory is `.omq/` —
deliberately not `.omo/`, which belongs to upstream oh-my-openagent, so the two
can run in one project without writing each other's files.

## What is always on

- **9 role agents**: planner (Prometheus), critic (Metis), deep (Hephaestus),
  junior (Sisyphus-Junior), atlas, oracle, reviewer (Momus), librarian, looker.
  The built-in Explore agent is reused for fast repository scans.
- **5 commands**: `/ulw`, `/team`, `/hyperplan`, `/omo-status`, `/omo-doctor`.
- **4 skills**: `ulw-plan`, `ulw-execute`, `ulw-research`, `review-work`.

Ordinary questions and single-file edits are handled by the main agent. No
subagent is spawned and no state is written until one of the explicit commands
is used.

## Commands

| Command | Purpose |
|---|---|
| `/omo-qoder:ulw` | Ultrawork lifecycle: plan threshold, waves, dual evidence, review gate |
| `/omo-qoder:team` | Parallel team mode with a task DAG, leases, and fallback |
| `/omo-qoder:hyperplan` | Planning only: interview, critic pass, approval gate |
| `/omo-qoder:omo-status` | Read-only `.omq/` status board |
| `/omo-qoder:omo-doctor` | Plugin self-check |

The keyword gate is opt-in per project (`.omq/config.json` with
`"keyword_hook": true`, or `.qoder/config.json` with `omq.keyword_hook: true`).
It only adds a command hint; it never starts a workflow or writes state.

## Optional profiles (off by default)

| Profile | Provides | Fallback |
|---|---|---|
| `orchestration` | Coordinator MCP: stdio, SQLite WAL, tasks/dependencies/leases/mailbox | Core wave files under `.omq/runtime/` |
| `graph` | CodeGraph MCP for semantic repository lookup | Built-in Explore + Bash grep/rg |
| `dashboard` | Loopback-only read-only status dashboard | `/omo-status` |

A failure in an optional profile must degrade only that profile.

Enable the coordinator (writes the project `.mcp.json`; restart the session):

```bash
node "$QODER_PLUGIN_ROOT/tools/omo-profile.mjs" enable orchestration
```

Disable it with the same tool and `disable orchestration`. The plugin's own
`.mcp.json` is empty, so installation alone starts no MCP server.

Enable the graph profile after installing CodeGraph and indexing the project:

```bash
npm install -g @colbymchenry/codegraph
codegraph init
node "$QODER_PLUGIN_ROOT/tools/omo-profile.mjs" enable graph
```

If the binary or `.codegraph/` is missing, the profile is marked degraded and
the agent falls back to Explore + Bash `grep`/`rg`.

Enable and start the read-only dashboard:

```bash
node "$QODER_PLUGIN_ROOT/tools/omo-profile.mjs" enable dashboard
node "$QODER_PLUGIN_ROOT/dashboard/server.mjs"
```

It binds loopback only and prints a per-start URL and token. If it cannot
start, use `/omo-status`.

## Install

```bash
# local development
qodercn --plugin-dir "E:/Oh-My-QoderAgent/omo-qoder" -p "hello"

# user-level install
qodercn plugins install "E:/Oh-My-QoderAgent/omo-qoder" --scope user
qodercn plugins enable omo-qoder@local
```

Restart the session after installation so the agent manifest is re-scanned.

## State and isolation

All project state lives in `.omq/`:

```text
.omq/
  plans/           # plan artifacts
  runtime/         # wave/task state and coordinator mirror
  config.json      # optional profile switches
```

Every state write goes to `.omq/` and nowhere else: the plugin never writes
`.omo/` (upstream oh-my-openagent's directory), never reads the `oh-my-qoder`
plugin tree, and does not modify user agents/skills/MCP configuration on install.

Upgrading from 1.1.0's predecessor: state moved from `.omo/` to `.omq/`, and the
`.qoder/config.json` fallback key moved from `omo` to `omq`. Rename both in any
project that had the keyword gate enabled.

## Testing

```bash
npm test                  # 37 tests
npm run doctor            # structural self-check
npm run validate          # qodercn plugin validation
npm run test:isolated     # isolated discovery, no oh-my-qoder
npm run test:dashboard    # real dashboard process smoke
OMO_E2E_REUSE_AUTH=1 npm run test:e2e  # full isolated E2E with 9/9 spawn
```

`test:e2e` creates a temporary `--config-dir`, installs only `omo-qoder`, and
checks discovery, 9/9 spawn, all three profiles, the dashboard, tests, and
doctor. With `OMO_E2E_REUSE_AUTH=1` it temporarily copies the local login state
into that temp config and deletes it on exit; `oh-my-qoder` is never copied.

## License boundary

The plugin's own code is MIT. Upstream OmO is under the Sustainable Use
License 1.0. This repository re-derives protocols and does not copy upstream
source. See `NOTICE`, `upstream/omo-sources.lock.json`, and `docs/PARITY.md`.

## Status

v1.0 is feature-complete and passed the isolated E2E: 9/9 spawn, 4 skills,
5 commands, all three profiles (coordinator and CodeGraph Connected, dashboard
smoke OK), with `oh-my-qoder` absent. The remaining work is the release gate.
State schemas and zero-intrusion rules are in `docs/STATE.md`.
