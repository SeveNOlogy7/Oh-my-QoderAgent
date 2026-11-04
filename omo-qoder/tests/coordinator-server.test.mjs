import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('stdio server lists 13 tools and handles a tool call', (t) => {
  const project = mkdtempSync(join(tmpdir(), 'omo-server-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const dbPath = join(project, 'coordinator.sqlite');

  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'coordinator_create_task',
        arguments: { id: 'T1', title: 'Demo' },
      },
    },
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'coordinator_status', arguments: {} },
    },
  ]
    .map((message) => JSON.stringify(message))
    .join('\n');

  const result = spawnSync(process.execPath, [join(root, 'mcp', 'coordinator', 'server.mjs')], {
    input: `${messages}\n`,
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      OMO_COORDINATOR_DB: dbPath,
      QODER_PROJECT_DIR: project,
      CLAUDE_PROJECT_DIR: project,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(responses.length, 4);

  assert.equal(responses[0].result.serverInfo.name, 'omo-coordinator');
  assert.equal(responses[1].result.tools.length, 13);
  const created = JSON.parse(responses[2].result.content[0].text);
  assert.equal(created.id, 'T1');
  assert.equal(created.status, 'pending');
  const status = JSON.parse(responses[3].result.content[0].text);
  assert.equal(status.tasks.pending, 1);
  assert.equal(status.journalMode, 'wal');
});
