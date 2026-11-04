#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configDir = resolve(root, '..', '.qoder-test');
const qodercn = process.platform === 'win32' ? 'qodercn.cmd' : 'qodercn';

function run(args) {
  const res = spawnSync(qodercn, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (res.error) throw res.error;
  return res;
}

function must(args, label) {
  const res = run(args);
  if (res.status !== 0) {
    console.error(`FAIL ${label}`);
    console.error(`stdout:\n${res.stdout}`);
    console.error(`stderr:\n${res.stderr}`);
    process.exit(res.status ?? 1);
  }
  return res.stdout.trim();
}

rmSync(configDir, { recursive: true, force: true });
mkdirSync(configDir, { recursive: true });

const manifest = JSON.parse(readFileSync(join(root, '.qoder-plugin', 'plugin.json'), 'utf8'));

const validation = JSON.parse(must(['plugins', 'validate', root, '--strict', '--json'], 'validate'));
assert.equal(validation.ok, true, 'plugin validation failed');
assert.equal(validation.report.valid, true, 'plugin manifest invalid');
assert.equal(validation.report.summary.errorCount, 0);
assert.equal(validation.report.summary.warningCount, 0);

const install = JSON.parse(
  must(['--config-dir', configDir, 'plugins', 'install', root, '--scope', 'user', '--json'], 'install'),
);
assert.equal(install.ok, true);
assert.equal(install.pluginId, 'omo-qoder@local');

const list = JSON.parse(must(['--config-dir', configDir, 'plugins', 'list', '--json'], 'list'));
assert.ok(Array.isArray(list) && list.length > 0, 'no plugins listed');
assert.ok(!JSON.stringify(list).includes('oh-my-qoder'), 'oh-my-qoder leaked into isolated config');

const plugin = list.find((item) => item.id === 'omo-qoder@local');
assert.ok(plugin, 'omo-qoder@local missing from list');
assert.equal(plugin.enabled, true);

const installedPath = join(configDir, 'plugins', 'installed_plugins_v2.json');
const settingsPath = join(configDir, 'settings.json');
assert.ok(existsSync(installedPath), 'installed_plugins_v2.json missing');
assert.ok(existsSync(settingsPath), 'settings.json missing');

const installed = JSON.parse(readFileSync(installedPath, 'utf8'));
assert.ok(installed.plugins['omo-qoder@local'], 'omo-qoder@local missing from installed plugins');
assert.ok(!JSON.stringify(installed).includes('oh-my-qoder'), 'oh-my-qoder in installed plugins');

const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
assert.equal(settings.enabledPlugins['omo-qoder@local'], true, 'plugin not enabled');
assert.ok(!JSON.stringify(settings).includes('oh-my-qoder'), 'oh-my-qoder enabled');

const agentCount = readdirSync(join(root, 'agents')).filter((name) => name.endsWith('.md')).length;
const commandCount = readdirSync(join(root, 'commands')).filter((name) => name.endsWith('.md')).length;
const skillCount = manifest.skills.length;

assert.equal(plugin.resources.agents.length, agentCount, 'agent discovery count mismatch');
assert.equal(plugin.resources.commands.length, commandCount, 'command discovery count mismatch');
assert.equal(plugin.resources.skills.length, skillCount, 'skill discovery count mismatch');

console.log('Isolated install OK');
console.log(`  config: ${configDir}`);
console.log(`  plugin: ${plugin.id} v${plugin.version} (${plugin.installPath})`);
console.log(`  resources: ${agentCount} agent(s), ${commandCount} command(s), ${skillCount} skill(s), ${plugin.resources.mcpServers.length} MCP server(s)`);
console.log('  oh-my-qoder: absent');
