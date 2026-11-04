import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function tempProject(t) {
  const dir = mkdtempSync(join(tmpdir(), 'omo-qoder-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(script, args, project, input) {
  return spawnSync(process.execPath, [join(root, script), ...args], {
    cwd: project,
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      QODER_PROJECT_DIR: project,
      CLAUDE_PROJECT_DIR: project,
    },
  });
}

test('status renderer reports no plan when state is absent', (t) => {
  const project = tempProject(t);
  const result = run('tools/omo-status.mjs', [], project);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Plan: none/);
});

test('status renderer reads waves and profiles', (t) => {
  const project = tempProject(t);
  mkdirSync(join(project, '.omq', 'runtime'), { recursive: true });
  writeFileSync(
    join(project, '.omq', 'config.json'),
    JSON.stringify({ keyword_hook: true, profiles: { orchestration: true } }),
  );
  writeFileSync(
    join(project, '.omq', 'runtime', 'waves.json'),
    JSON.stringify({
      plan: '.omq/plans/demo.md',
      wave: 1,
      tasks: [
        { id: 'T1', role: 'omo-junior', status: 'done', acceptance: 'npm test', evidence: [{}] },
      ],
    }),
  );
  const result = run('tools/omo-status.mjs', ['--json'], project);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.plan, '.omq/plans/demo.md');
  assert.equal(report.tasks.length, 1);
  assert.equal(report.tasks[0].evidence, 1);
  assert.equal(report.profiles.orchestration, true);
  assert.equal(report.profiles.keywordHook, true);
});

test('keyword gate is a no-op when the project has not enabled it', (t) => {
  const project = tempProject(t);
  const result = run('hooks/keyword-gate.mjs', [], project, JSON.stringify({ prompt: 'run ultrawork' }));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.continue, true);
  assert.equal(output.suppressOutput, true);
  assert.equal(output.hookSpecificOutput, undefined);
});

test('keyword gate suggests the workflow only when enabled', (t) => {
  const project = tempProject(t);
  mkdirSync(join(project, '.omq'), { recursive: true });
  writeFileSync(join(project, '.omq', 'config.json'), JSON.stringify({ keyword_hook: true }));
  const result = run('hooks/keyword-gate.mjs', [], project, JSON.stringify({ prompt: 'please run ultrawork' }));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /\/omo-qoder:ulw/);
});

test('keyword gate ignores an explicit slash command', (t) => {
  const project = tempProject(t);
  mkdirSync(join(project, '.omq'), { recursive: true });
  writeFileSync(join(project, '.omq', 'config.json'), JSON.stringify({ keyword_hook: true }));
  const result = run('hooks/keyword-gate.mjs', [], project, JSON.stringify({ prompt: '/omo-qoder:ulw build it' }));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.continue, true);
  assert.equal(output.hookSpecificOutput, undefined);
});
