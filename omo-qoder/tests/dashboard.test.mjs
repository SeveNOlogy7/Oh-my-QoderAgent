import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDashboard } from '../dashboard/server.mjs';

function rawGet(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, headers: { Host: host } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('dashboard is loopback-only, read-only, and token-gated', async (t) => {
  const project = mkdtempSync(join(tmpdir(), 'omo-dash-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  mkdirSync(join(project, '.omq', 'runtime'), { recursive: true });
  writeFileSync(
    join(project, '.omq', 'config.json'),
    JSON.stringify({ profiles: { dashboard: true, orchestration: true } }),
  );
  const wavesPath = join(project, '.omq', 'runtime', 'waves.json');
  writeFileSync(
    wavesPath,
    JSON.stringify({
      plan: '.omq/plans/demo.md',
      wave: 1,
      tasks: [
        {
          id: 'T1',
          role: 'omo-junior',
          status: 'done',
          acceptance: 'test',
          evidence: [{}],
        },
      ],
    }),
  );

  const dashboard = await startDashboard({ project, token: 'test-token' });
  t.after(() => dashboard.close());

  assert.equal(dashboard.server.address().address, '127.0.0.1');
  const base = `http://127.0.0.1:${dashboard.port}`;

  let response = await fetch(`${base}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  const forbidden = await rawGet(dashboard.port, '/healthz', 'evil.example');
  assert.equal(forbidden.status, 403);

  response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /OMO Status/);

  response = await fetch(`${base}/api/status`);
  assert.equal(response.status, 401);

  response = await fetch(`${base}/api/status?token=test-token`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.plan, '.omq/plans/demo.md');
  assert.equal(data.tasks.length, 1);
  assert.equal(data.profiles.dashboard, true);

  response = await fetch(`${base}/api/status`, {
    headers: { Authorization: 'Bearer test-token' },
  });
  assert.equal(response.status, 200);

  const before = readFileSync(wavesPath, 'utf8');
  response = await fetch(`${base}/api/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 405);
  assert.equal(readFileSync(wavesPath, 'utf8'), before);

  response = await fetch(`${base}/nope`);
  assert.equal(response.status, 404);
});
