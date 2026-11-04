import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(project, args, extraEnv = {}) {
  return spawnSync(process.execPath, [join(root, 'tools', 'omo-profile.mjs'), ...args, '--json'], {
    cwd: project,
    encoding: 'utf8',
    env: {
      ...process.env,
      QODER_PROJECT_DIR: project,
      CLAUDE_PROJECT_DIR: project,
      ...extraEnv,
    },
  });
}

function tempProject(t) {
  const dir = mkdtempSync(join(tmpdir(), 'omo-profile-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('enable orchestration writes the flag and a project MCP entry', (t) => {
  const project = tempProject(t);
  writeFileSync(
    join(project, '.mcp.json'),
    JSON.stringify({ mcpServers: { other: { command: 'node', args: ['x.js'] } } }),
  );

  const result = run(project, ['enable', 'orchestration']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.profile, 'orchestration');

  const config = JSON.parse(readFileSync(join(project, '.omq', 'config.json'), 'utf8'));
  assert.equal(config.profiles.orchestration, true);

  const mcp = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf8'));
  assert.ok(mcp.mcpServers.other, 'unrelated server was removed');
  const coordinator = mcp.mcpServers['omo-coordinator'];
  assert.equal(coordinator.command, 'node');
  assert.ok(existsSync(coordinator.args[0]), 'coordinator server path does not exist');
  assert.equal(
    coordinator.env.OMO_COORDINATOR_DB,
    join(project, '.omq', 'runtime', 'coordinator.sqlite'),
  );
});

test('disable orchestration removes the server and keeps other servers', (t) => {
  const project = tempProject(t);
  writeFileSync(
    join(project, '.mcp.json'),
    JSON.stringify({ mcpServers: { other: { command: 'node', args: ['x.js'] } } }),
  );
  assert.equal(run(project, ['enable', 'orchestration']).status, 0);
  const result = run(project, ['disable', 'orchestration']);
  assert.equal(result.status, 0, result.stderr);

  const config = JSON.parse(readFileSync(join(project, '.omq', 'config.json'), 'utf8'));
  assert.equal(config.profiles.orchestration, false);
  const mcp = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf8'));
  assert.ok(mcp.mcpServers.other);
  assert.equal(mcp.mcpServers['omo-coordinator'], undefined);
});

test('enable is idempotent', (t) => {
  const project = tempProject(t);
  assert.equal(run(project, ['enable', 'orchestration']).status, 0);
  assert.equal(run(project, ['enable', 'orchestration']).status, 0);
  const mcp = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf8'));
  assert.equal(Object.keys(mcp.mcpServers).filter((name) => name === 'omo-coordinator').length, 1);
});

test('status reports the default off state', (t) => {
  const project = tempProject(t);
  const result = run(project, ['status']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.profiles.orchestration, false);
  assert.equal(report.coordinatorServer, null);
});

test('graph is degraded without a project index', (t) => {
  const project = tempProject(t);
  const result = run(project, ['enable', 'graph'], { OMO_CODEGRAPH_COMMAND: process.execPath });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.degraded, true);
  assert.equal(report.reason, 'no_project_index');
  assert.match(report.fallback, /Explore/);
  const config = JSON.parse(readFileSync(join(project, '.omq', 'config.json'), 'utf8'));
  assert.equal(config.profiles.graph, true);
  const mcp = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf8'));
  assert.equal(mcp.mcpServers['omo-codegraph'], undefined);
});

test('graph wires the MCP entry when binary and index are present', (t) => {
  const project = tempProject(t);
  mkdirSync(join(project, '.codegraph'), { recursive: true });
  const result = run(project, ['enable', 'graph'], { OMO_CODEGRAPH_COMMAND: process.execPath });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.degraded, false);
  assert.equal(report.reason, null);
  const mcp = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf8'));
  const graph = mcp.mcpServers['omo-codegraph'];
  assert.equal(graph.command, process.execPath);
  assert.deepEqual(graph.args, ['serve', '--mcp']);

  const disabled = run(project, ['disable', 'graph']);
  assert.equal(disabled.status, 0, disabled.stderr);
  const after = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf8'));
  assert.equal(after.mcpServers['omo-codegraph'], undefined);
});

test('dashboard enable writes the flag and a start command without an MCP entry', (t) => {
  const project = tempProject(t);
  const result = run(project, ['enable', 'dashboard']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.match(report.startCommand, /dashboard[\\/]server\.mjs/);

  const config = JSON.parse(readFileSync(join(project, '.omq', 'config.json'), 'utf8'));
  assert.equal(config.profiles.dashboard, true);
  const mcp = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf8'));
  assert.equal(mcp.mcpServers['omo-dashboard'], undefined);

  const disabled = run(project, ['disable', 'dashboard']);
  assert.equal(disabled.status, 0, disabled.stderr);
  const after = JSON.parse(readFileSync(join(project, '.omq', 'config.json'), 'utf8'));
  assert.equal(after.profiles.dashboard, false);
});

test('unknown profiles are rejected without writing state', (t) => {
  const project = tempProject(t);
  const result = run(project, ['enable', 'foo']);
  assert.equal(result.status, 2);
  assert.equal(existsSync(join(project, '.omq', 'config.json')), false);
});
