#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = process.env.QODER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const omqDir = join(project, '.omq');
const configPath = join(omqDir, 'config.json');
const mcpPath = join(project, '.mcp.json');
const serverPath = join(root, 'mcp', 'coordinator', 'server.mjs');
const dashboardServerPath = join(root, 'dashboard', 'server.mjs');
const dbPath = join(omqDir, 'runtime', 'coordinator.sqlite');
const supported = new Set(['orchestration', 'graph', 'dashboard']);
const asJson = process.argv.includes('--json');
const args = process.argv.slice(2).filter((arg) => arg !== '--json');
const command = args[0];
const profile = args[1];

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`invalid JSON in ${path}: ${error.message}`);
  }
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temp, path);
}

function readConfig() {
  const config = readJson(configPath, {});
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`config must be an object: ${configPath}`);
  }
  if (!config.profiles || typeof config.profiles !== 'object' || Array.isArray(config.profiles)) {
    config.profiles = {};
  }
  return config;
}

function readMcp() {
  const mcp = readJson(mcpPath, {});
  if (!mcp || typeof mcp !== 'object' || Array.isArray(mcp)) {
    throw new Error(`MCP config must be an object: ${mcpPath}`);
  }
  if (!mcp.mcpServers || typeof mcp.mcpServers !== 'object' || Array.isArray(mcp.mcpServers)) {
    mcp.mcpServers = {};
  }
  return mcp;
}

function emit(value) {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
  } else if (value.message) {
    console.log(value.message);
  } else {
    console.log(JSON.stringify(value, null, 2));
  }
}

function fail(message, code = 1) {
  if (asJson) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(message);
  process.exit(code);
}

if (!command || command === 'status') {
  const config = readConfig();
  const mcp = readMcp();
  emit({
    ok: true,
    project,
    configPath,
    mcpPath,
    profiles: {
      orchestration: Boolean(config.profiles.orchestration),
      graph: Boolean(config.profiles.graph),
      dashboard: Boolean(config.profiles.dashboard),
      keywordHook: Boolean(config.keyword_hook),
    },
    coordinatorServer: mcp.mcpServers['omo-coordinator'] ?? null,
    codegraphServer: mcp.mcpServers['omo-codegraph'] ?? null,
    dashboardStartCommand: `node "${dashboardServerPath}"`,
  });
  process.exit(0);
}

if (command !== 'enable' && command !== 'disable') {
  fail('usage: omo-profile.mjs [status|enable <profile>|disable <profile>] [--json]', 2);
}

if (!profile) fail('missing profile name', 2);
if (!supported.has(profile)) {
  fail(`profile "${profile}" is not implemented yet; supported: orchestration, graph, dashboard`, 2);
}

try {
  const config = readConfig();
  const mcp = readMcp();
  const enabled = command === 'enable';
  let serverName = null;
  let startCommand = null;
  let degraded = false;
  let reason = null;
  let fallback = null;

  config.profiles[profile] = enabled;

  if (profile === 'orchestration') {
    serverName = 'omo-coordinator';
    if (enabled) {
      mcp.mcpServers['omo-coordinator'] = {
        command: 'node',
        args: [serverPath],
        cwd: project,
        env: { OMO_COORDINATOR_DB: dbPath },
      };
    } else {
      delete mcp.mcpServers['omo-coordinator'];
    }
  } else if (profile === 'graph') {
    serverName = 'omo-codegraph';
    const graphCommand = process.env.OMO_CODEGRAPH_COMMAND || 'codegraph';
    const needsShell =
      process.platform === 'win32' &&
      (graphCommand === 'codegraph' || graphCommand === 'codegraph.cmd');
    const hasBinary =
      spawnSync(graphCommand, ['--version'], {
        shell: needsShell,
        encoding: 'utf8',
        timeout: 5000,
      }).status === 0;
    const indexed = existsSync(join(project, '.codegraph'));
    degraded = enabled && (!hasBinary || !indexed);
    reason = !hasBinary ? 'codegraph_missing' : !indexed ? 'no_project_index' : null;
    fallback = degraded ? 'Explore + Bash grep/rg' : null;

    if (enabled && !degraded) {
      mcp.mcpServers['omo-codegraph'] = {
        command: graphCommand,
        args: ['serve', '--mcp'],
        cwd: project,
      };
    } else {
      delete mcp.mcpServers['omo-codegraph'];
    }
  } else {
    delete mcp.mcpServers['omo-dashboard'];
    if (enabled) startCommand = `node "${dashboardServerPath}"`;
  }

  writeJsonAtomic(configPath, config);
  writeJsonAtomic(mcpPath, mcp);

  const message = enabled
    ? `${profile} enabled.` +
      (profile === 'dashboard'
        ? ` Start with: ${startCommand}. It binds 127.0.0.1 and prints a per-start URL/token. If it cannot start, use /omo-status.`
        : degraded
          ? ` Degraded: ${reason}; fallback: ${fallback}.`
          : ' Restart the session so Qoder loads the project MCP server. Qoder may ask you to approve the project-scoped server.')
    : `${profile} disabled.` +
      (profile === 'dashboard' ? '' : ' Restart the session so Qoder drops the project MCP server.');

  emit({
    ok: true,
    project,
    profile,
    enabled,
    degraded,
    reason,
    fallback,
    configPath,
    mcpPath,
    serverName,
    serverEntry: serverName ? mcp.mcpServers[serverName] ?? null : null,
    startCommand,
    message,
  });
} catch (error) {
  fail(error.message);
}
