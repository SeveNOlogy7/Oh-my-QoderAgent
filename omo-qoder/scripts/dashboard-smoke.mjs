#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = mkdtempSync(join(tmpdir(), 'omo-dashboard-smoke-'));
mkdirSync(join(project, '.omq', 'runtime'), { recursive: true });
writeFileSync(
  join(project, '.omq', 'config.json'),
  JSON.stringify({ profiles: { dashboard: true } }),
);
writeFileSync(
  join(project, '.omq', 'runtime', 'waves.json'),
  JSON.stringify({
    plan: '.omq/plans/smoke.md',
    wave: 1,
    tasks: [{ id: 'T1', role: 'omo-junior', status: 'done', acceptance: 'smoke', evidence: [{}] }],
  }),
);

const child = spawn(process.execPath, [join(root, 'dashboard', 'server.mjs')], {
  env: { ...process.env, QODER_PROJECT_DIR: project },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const line = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('dashboard startup timed out')), 10000);
    const reader = createInterface({ input: child.stdout });
    reader.once('line', (value) => {
      clearTimeout(timer);
      resolve(value);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`dashboard exited early with ${code}: ${stderr}`));
    });
  });

  const info = JSON.parse(line);
  assert.ok(info.port > 0);
  assert.ok(info.token);

  const base = `http://127.0.0.1:${info.port}`;
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);

  const status = await fetch(`${base}/api/status?token=${info.token}`);
  assert.equal(status.status, 200);
  const data = await status.json();
  assert.equal(data.plan, '.omq/plans/smoke.md');

  const unauthorized = await fetch(`${base}/api/status`);
  assert.equal(unauthorized.status, 401);

  const post = await fetch(`${base}/api/status`, { method: 'POST' });
  assert.equal(post.status, 405);

  console.log(`Dashboard smoke OK (port ${info.port})`);
} finally {
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  rmSync(project, { recursive: true, force: true });
}
