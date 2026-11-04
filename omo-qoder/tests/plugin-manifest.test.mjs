import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, '.qoder-plugin', 'plugin.json'), 'utf8'));

test('manifest identity', () => {
  assert.equal(manifest.name, 'omo-qoder');
  assert.match(manifest.version, /^\d+\.\d+\.\d+/);
  assert.equal(manifest.license, 'MIT');
});

test('commands directory has the five core entrypoints', () => {
  const dir = resolve(root, manifest.commands);
  assert.ok(existsSync(dir), `missing ${dir}`);
  const commands = readdirSync(dir).filter((name) => name.endsWith('.md')).sort();
  assert.deepEqual(commands, [
    'hyperplan.md',
    'omo-doctor.md',
    'omo-status.md',
    'team.md',
    'ulw.md',
  ]);
});

test('manifest declares the four core skills', () => {
  const names = manifest.skills
    .map((rel) => rel.replace(/^\.\/skills\//, '').replace(/\/$/, ''))
    .sort();
  assert.deepEqual(names, ['review-work', 'ulw-execute', 'ulw-plan', 'ulw-research']);
});

test('every declared skill has SKILL.md', () => {
  assert.ok(Array.isArray(manifest.skills) && manifest.skills.length > 0);
  for (const rel of manifest.skills) {
    const path = join(resolve(root, rel), 'SKILL.md');
    assert.ok(existsSync(path), `missing SKILL.md for ${rel}`);
    const text = readFileSync(path, 'utf8');
    assert.match(text, /^---\r?\n[\s\S]*?^name:\s*\S+/m, `${rel} missing name`);
    assert.match(text, /^---\r?\n[\s\S]*?^description:\s*\S+/m, `${rel} missing description`);
  }
});

test('every agent has valid frontmatter', () => {
  const dir = join(root, 'agents');
  const agents = readdirSync(dir).filter((name) => name.endsWith('.md'));
  assert.ok(agents.length > 0, 'no agents');
  const allowedColors = new Set(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']);
  const allowedModels = new Set(['Auto', 'Fast', 'inherit']);
  for (const file of agents) {
    const text = readFileSync(join(dir, file), 'utf8');
    assert.match(text, /^---\r?\n[\s\S]*?^name:\s*\S+/m, `${file} missing name`);
    assert.match(text, /^---\r?\n[\s\S]*?^description:\s*\S+/m, `${file} missing description`);
    const color = /^color:\s*(\S+)/m.exec(text)?.[1];
    if (color) assert.ok(allowedColors.has(color), `${file} has invalid color ${color}`);
    const model = /^model:\s*(\S+)/m.exec(text)?.[1];
    if (model) assert.ok(allowedModels.has(model), `${file} has invalid model ${model}`);
  }
});

test('runtime surface does not reference the upstream omo state directory', () => {
  const runtime = ['agents', 'commands', 'skills', 'tools', 'hooks', 'mcp', 'dashboard'];
  const upstream = ['.om', 'o'].join('');
  const leaks = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(md|mjs|cjs|js|json)$/.test(entry.name)) {
        if (readFileSync(full, 'utf8').includes(upstream)) leaks.push(full);
      }
    }
  }
  for (const rel of runtime) walk(join(root, rel));
  assert.deepEqual(leaks, []);
});

test('runtime code reads and writes its own state directory', () => {
  const own = ['.om', 'q'].join('');
  const stateDirUsers = [
    'tools/status-data.mjs',
    'tools/omo-profile.mjs',
    'hooks/keyword-gate.mjs',
    'mcp/coordinator/server.mjs',
  ];
  for (const rel of stateDirUsers) {
    assert.ok(
      readFileSync(join(root, rel), 'utf8').includes(own),
      `${rel} does not reference its own state directory`,
    );
  }
});

test('doctor exits zero', () => {
  const output = execFileSync(process.execPath, [join(root, 'tools', 'omo-doctor.mjs'), '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  const report = JSON.parse(output);
  assert.equal(report.ok, true, JSON.stringify(report.checks.filter((item) => !item.ok), null, 2));
});
