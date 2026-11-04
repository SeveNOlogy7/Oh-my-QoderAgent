# MCP profiles

The plugin ships **no** plugin-scoped MCP server: `.mcp.json` is empty, so
installing the plugin starts no background process. Profiles are enabled per
project by writing `.omq/config.json` and the project `.mcp.json`.

## Coordinator (`orchestration`)

Enable:

```bash
node "$QODER_PLUGIN_ROOT/tools/omo-profile.mjs" enable orchestration
```

Disable:

```bash
node "$QODER_PLUGIN_ROOT/tools/omo-profile.mjs" disable orchestration
```

Status:

```bash
node "$QODER_PLUGIN_ROOT/tools/omo-profile.mjs" status
```

The tool merges the `omo-coordinator` entry into the project `.mcp.json` and
preserves unrelated servers. Restart the session after enabling; Qoder may ask
you to approve the project-scoped server.

Properties:

- stdio JSON-RPC server, zero third-party runtime dependencies
- SQLite WAL at `.omq/runtime/coordinator.sqlite`
- source of truth for tasks, dependencies, leases, and mailbox
- 13 tools: create/get/list/update task, add dependency, list ready, claim,
  release, complete, fail, send message, read mailbox, status
- claim, release, and complete require the lease owner; fail on an active task
  requires the lease owner; an expired lease can be taken over
- terminal-state guard on complete/fail; claim enforces `maxParallel` inside a
  `BEGIN IMMEDIATE` transaction; evidence append is transactional; dependency
  cycles are rejected; `blocked` is reachable through update task
- every task mutation writes an atomic `.omq/runtime/waves.json` mirror; the
  mailbox is DB-only; the SQLite database remains the single source of truth
- fallback when the server is unavailable: `.omq/runtime/waves.json`

The scheduler clock is server-owned. Do not add a `now` field to tool inputs.

## CodeGraph (`graph`)

External CodeGraph server, enabled only when both the binary and a project
index exist:

```bash
npm install -g @colbymchenry/codegraph
cd your-project && codegraph init
node "$QODER_PLUGIN_ROOT/tools/omo-profile.mjs" enable graph
```

The tool writes `omo-codegraph` into the project `.mcp.json` as
`codegraph serve --mcp` with `cwd` set to the project. If the binary is missing
or `.codegraph/` does not exist, the profile is marked **degraded** and no MCP
entry is written; the agent falls back to the built-in Explore agent plus Bash
`grep`/`rg`. Re-run `enable graph` after installing and indexing.

Override the binary with `OMO_CODEGRAPH_COMMAND` when it is not on `PATH`.
Disable with `node "$QODER_PLUGIN_ROOT/tools/omo-profile.mjs" disable graph`.

## Dashboard (`dashboard`)

Loopback-only read-only status page. It is not an MCP server; enable the flag
and start the process explicitly:

```bash
node "$QODER_PLUGIN_ROOT/tools/omo-profile.mjs" enable dashboard
node "$QODER_PLUGIN_ROOT/dashboard/server.mjs"
```

The server prints a per-start URL with a random token. `/api/status` is
token-gated; all non-GET methods return 405 and nothing writes `.omq/`.
Fallback: `/omo-status`.
