#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const qodercn = process.platform === 'win32' ? 'qodercn.cmd' : 'qodercn';
const reuseAuth = process.env.OMO_E2E_REUSE_AUTH === '1';
const realConfig = process.env.QODER_CONFIG_DIR || join(homedir(), '.qoder-cn');
const configDir = mkdtempSync(join(tmpdir(), 'omo-e2e-'));
const projects = [];

function cleanup() {
  for (const project of projects) {
    try {
      rmSync(project, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
  try {
    rmSync(configDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

function quoted(args) {
  return args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg));
}

function runQoder(args, options = {}) {
  const env = { ...process.env, ...(options.env ?? {}) };
  if (options.cleanSdkEnv) {
    delete env.QODER_AGENT_SDK_ENTRYPOINT;
    delete env.QODER_AGENT_SDK_DAEMON;
    delete env.QODER_SDK_AUTH_PAYLOAD_FILE;
  }
  const result = spawnSync(qodercn, quoted(args), {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: options.timeout ?? 180000,
    env,
  });
  if (result.error) throw result.error;
  return result;
}

function mustQoder(args, label, options) {
  const result = runQoder(args, options);
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function mustNode(args, label, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    timeout: options.timeout ?? 180000,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function qoderArgs(...args) {
  return ['--config-dir', configDir, ...args];
}

function tempProject(prefix) {
  const project = mkdtempSync(join(tmpdir(), prefix));
  projects.push(project);
  return project;
}

function copyAuth() {
  const authDir = join(realConfig, '.auth');
  mkdirSync(join(configDir, '.auth'), { recursive: true });
  for (const file of ['user', 'machine_id']) {
    const source = join(authDir, file);
    if (existsSync(source)) cpSync(source, join(configDir, '.auth', file));
  }
  const model = join(realConfig, '.models', 'default');
  if (existsSync(model)) {
    mkdirSync(join(configDir, '.models'), { recursive: true });
    cpSync(model, join(configDir, '.models', 'default'));
  }
}

async function main() {
  console.log(`E2E config: ${configDir}`);
  if (reuseAuth) {
    copyAuth();
    console.log('Auth: temporary copy of local login state; deleted at exit.');
  } else {
    console.log('Auth: skipped (set OMO_E2E_REUSE_AUTH=1 for the 9/9 spawn ping).');
  }

  const install = JSON.parse(
    mustQoder(qoderArgs('plugins', 'install', root, '--scope', 'user', '--json'), 'install'),
  );
  assert.equal(install.pluginId, 'omo-qoder@local');

  const validation = JSON.parse(
    mustQoder(['plugins', 'validate', root, '--strict', '--json'], 'validate'),
  );
  assert.equal(validation.report.valid, true);
  assert.equal(validation.report.summary.errorCount, 0);
  assert.equal(validation.report.summary.warningCount, 0);

  const list = JSON.parse(mustQoder(qoderArgs('plugins', 'list', '--json'), 'plugins list'));
  assert.ok(!JSON.stringify(list).includes('oh-my-qoder'), 'oh-my-qoder leaked');
  const plugin = list.find((item) => item.id === 'omo-qoder@local');
  assert.ok(plugin && plugin.enabled, 'omo-qoder is not enabled');
  assert.equal(plugin.resources.agents.length, 9);
  assert.equal(plugin.resources.commands.length, 5);
  assert.equal(plugin.resources.skills.length, 4);
  assert.equal(plugin.resources.mcpServers.length, 0);
  assert.equal(plugin.resources.hooks.length, 1);
  console.log('Discovery: 9 agents / 5 commands / 4 skills / 0 default MCP / 1 hook; oh-my-qoder absent');

  const agents = mustQoder(qoderArgs('agents', 'list'), 'agents list');
  assert.equal(agents.split(/\r?\n/).filter((line) => line.includes('omo-qoder:')).length, 9);
  const skills = mustQoder(qoderArgs('skills', 'list'), 'skills list');
  assert.equal(skills.split(/\r?\n/).filter((line) => line.includes('omo-qoder:')).length, 4);
  console.log('Agents/skills lists: 9 / 4');

  if (reuseAuth) {
    const roles = ['planner', 'critic', 'deep', 'junior', 'atlas', 'oracle', 'reviewer', 'librarian', 'looker'];
    for (const role of roles) {
      const upper = role.toUpperCase();
      const output = mustQoder(
        qoderArgs(
          '--agent',
          `omo-qoder:omo-${role}`,
          '-p',
          `Reply with exactly: ISO-${upper}-OK`,
          '--max-output-tokens',
          '32',
          '--no-session-persistence',
          '--permission-mode',
          'dont_ask',
        ),
        `spawn ${role}`,
        { cleanSdkEnv: true, timeout: 180000 },
      );
      assert.match(output, new RegExp(`ISO-${upper}-OK`));
      console.log(`spawn ${role}: OK`);
    }
  } else {
    console.log('spawn ping: skipped');
  }

  const orchestrationProject = tempProject('omo-e2e-orch-');
  mustNode(['tools/omo-profile.mjs', 'enable', 'orchestration', '--json'], 'profile orchestration', {
    env: { QODER_PROJECT_DIR: orchestrationProject, CLAUDE_PROJECT_DIR: orchestrationProject },
  });
  const coordinator = mustQoder(
    qoderArgs('--cwd', orchestrationProject, 'mcp', 'get', 'omo-coordinator'),
    'mcp get coordinator',
  );
  assert.match(coordinator, /Connected/);
  console.log('profile orchestration: Connected');

  const graphProject = tempProject('omo-e2e-graph-');
  mkdirSync(join(graphProject, '.codegraph'), { recursive: true });
  mustNode(['tools/omo-profile.mjs', 'enable', 'graph', '--json'], 'profile graph', {
    env: { QODER_PROJECT_DIR: graphProject, CLAUDE_PROJECT_DIR: graphProject },
  });
  const codegraph = mustQoder(
    qoderArgs('--cwd', graphProject, 'mcp', 'get', 'omo-codegraph'),
    'mcp get codegraph',
  );
  assert.match(codegraph, /Connected/);
  console.log('profile graph: Connected');

  const dashboardProject = tempProject('omo-e2e-dash-');
  mustNode(['tools/omo-profile.mjs', 'enable', 'dashboard', '--json'], 'profile dashboard', {
    env: { QODER_PROJECT_DIR: dashboardProject, CLAUDE_PROJECT_DIR: dashboardProject },
  });
  const dashboardConfig = JSON.parse(
    readFileSync(join(dashboardProject, '.omq', 'config.json'), 'utf8'),
  );
  assert.equal(dashboardConfig.profiles.dashboard, true);
  console.log('profile dashboard: flag on');

  const smoke = mustNode(['scripts/dashboard-smoke.mjs'], 'dashboard smoke');
  console.log(smoke);

  const tests = mustNode(['--test'], 'tests', { timeout: 180000 });
  assert.match(tests, /fail 0/);
  const doctor = mustNode(['tools/omo-doctor.mjs'], 'doctor');
  assert.match(doctor, /OK \(/);
  console.log('Regression: tests pass, doctor OK');

  console.log('E2E PASS');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
