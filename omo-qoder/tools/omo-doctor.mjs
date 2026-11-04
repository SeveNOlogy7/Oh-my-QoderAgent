#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');
const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail: String(detail) });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const manifestPath = join(root, '.qoder-plugin', 'plugin.json');
let manifest = null;
try {
  manifest = readJson(manifestPath);
  check('manifest', true, manifestPath);
} catch (error) {
  check('manifest', false, `${manifestPath}: ${error.message}`);
}

if (manifest) {
  check('manifest name', manifest.name === 'omo-qoder', manifest.name);
  check(
    'manifest version',
    typeof manifest.version === 'string' && /^\d+\.\d+\.\d+/.test(manifest.version),
    manifest.version,
  );

  const commandsDir = resolve(root, manifest.commands ?? './commands/');
  const commands = listFiles(commandsDir).filter((name) => name.endsWith('.md'));
  check('commands dir', existsSync(commandsDir), commandsDir);
  check('commands count', commands.length > 0, `${commands.length} command(s)`);

  const skills = Array.isArray(manifest.skills) ? manifest.skills : [];
  check('skills declared', skills.length > 0, `${skills.length} skill(s)`);
  for (const rel of skills) {
    const skillDir = resolve(root, rel);
    check(
      `skill ${rel}`,
      existsSync(join(skillDir, 'SKILL.md')),
      join(skillDir, 'SKILL.md'),
    );
  }

  if (manifest.mcpServers) {
    const mcpPath = resolve(root, manifest.mcpServers);
    try {
      const mcp = readJson(mcpPath);
      check('mcp config', typeof mcp.mcpServers === 'object' && mcp.mcpServers !== null, mcpPath);
      check(
        'default MCP off',
        Object.keys(mcp.mcpServers ?? {}).length === 0,
        `${Object.keys(mcp.mcpServers ?? {}).length} plugin-scoped server(s)`,
      );
    } catch (error) {
      check('mcp config', false, `${mcpPath}: ${error.message}`);
    }
  }
}

const coordinatorServer = join(root, 'mcp', 'coordinator', 'server.mjs');
const coordinatorTools = join(root, 'mcp', 'coordinator', 'tools.mjs');
check('coordinator server', existsSync(coordinatorServer), coordinatorServer);
check('profile tool', existsSync(join(root, 'tools', 'omo-profile.mjs')), join(root, 'tools', 'omo-profile.mjs'));
check('dashboard server', existsSync(join(root, 'dashboard', 'server.mjs')), join(root, 'dashboard', 'server.mjs'));
check('status data', existsSync(join(root, 'tools', 'status-data.mjs')), join(root, 'tools', 'status-data.mjs'));
try {
  const { TOOL_DEFINITIONS } = await import(pathToFileURL(coordinatorTools).href);
  check(
    'coordinator tools',
    Array.isArray(TOOL_DEFINITIONS) && TOOL_DEFINITIONS.length === 13,
    `${TOOL_DEFINITIONS.length} tool(s)`,
  );
} catch (error) {
  check('coordinator tools', false, error.message);
}

const agentsDir = join(root, 'agents');
const agents = listFiles(agentsDir).filter((name) => name.endsWith('.md'));
check('agents dir', existsSync(agentsDir), agentsDir);
check('agents count', agents.length > 0, `${agents.length} agent(s)`);
const allowedColors = new Set(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']);
const allowedModels = new Set(['Auto', 'Fast', 'inherit']);
for (const file of agents) {
  const text = readFileSync(join(agentsDir, file), 'utf8');
  const hasName = /^---\r?\n[\s\S]*?^name:\s*\S+/m.test(text);
  const hasDescription = /^---\r?\n[\s\S]*?^description:\s*\S+/m.test(text);
  check(`agent ${file}`, hasName && hasDescription,
    hasName && hasDescription ? 'frontmatter ok' : 'missing name/description');
  const color = /^color:\s*(\S+)/m.exec(text)?.[1];
  check(`agent ${file} color`, !color || allowedColors.has(color), color ?? 'unset');
  const model = /^model:\s*(\S+)/m.exec(text)?.[1];
  check(`agent ${file} model`, !model || allowedModels.has(model), model ?? 'unset');
}

const hooksPath = join(root, 'hooks', 'hooks.json');
if (existsSync(hooksPath)) {
  try {
    readJson(hooksPath);
    check('hooks config', true, hooksPath);
  } catch (error) {
    check('hooks config', false, `${hooksPath}: ${error.message}`);
  }
} else {
  check('hooks config', true, 'absent (keyword gate off)');
}

const legacyState = ['.om', 'o'].join('');
const ownState = ['.om', 'q'].join('');
const runtimeDirs = ['agents', 'commands', 'skills', 'tools', 'hooks', 'mcp', 'dashboard'];
const leaks = [];
for (const rel of runtimeDirs) {
  for (const file of walk(join(root, rel))) {
    if (!/\.(md|mjs|cjs|js|json)$/.test(file)) continue;
    if (file.endsWith('omo-doctor.mjs')) continue;
    const text = readFileSync(file, 'utf8');
    if (text.includes(legacyState)) leaks.push(file);
  }
}
check('state isolation', leaks.length === 0,
  leaks.length ? `references upstream ${legacyState}: ${leaks.join(', ')}` : 'runtime surface uses .omq/ only');

const stateDirUsers = [
  'tools/status-data.mjs',
  'tools/omo-profile.mjs',
  'hooks/keyword-gate.mjs',
  'mcp/coordinator/server.mjs',
];
const stateDirMissing = stateDirUsers.filter(
  (rel) => !readFileSync(join(root, rel), 'utf8').includes(ownState),
);
check('state dir in use', stateDirMissing.length === 0,
  stateDirMissing.length ? `no ${ownState} reference in ${stateDirMissing.join(', ')}` : stateDirUsers.join(', '));

const project = process.env.QODER_PROJECT_DIR || process.cwd();
const gitignore = join(project, '.gitignore');
if (existsSync(gitignore)) {
  const text = readFileSync(gitignore, 'utf8');
  const ignored = /(^|\r?\n)\s*\.omq\/?\s*(\r?\n|$)/.test(text);
  check('project .omq ignored', ignored, gitignore);
} else {
  check('project .gitignore', true, 'no .gitignore in project; skipped');
}

const [major, minor] = process.versions.node.split('.').map(Number);
const nodeOk = major > 22 || (major === 22 && minor >= 13);
check('node >= 22.13', nodeOk, process.versions.node);

const failed = checks.filter((item) => !item.ok);
const result = {
  plugin: manifest?.name ?? null,
  version: manifest?.version ?? null,
  root,
  project,
  ok: failed.length === 0,
  checks,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const item of checks) {
    console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}: ${item.detail}`);
  }
  console.log(`\n${failed.length ? 'FAILED' : 'OK'} (${checks.length - failed.length}/${checks.length})`);
}

process.exit(failed.length ? 1 : 0);
