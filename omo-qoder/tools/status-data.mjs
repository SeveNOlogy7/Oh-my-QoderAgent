import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function resolveProject() {
  return process.env.QODER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function readStatus(project = resolveProject()) {
  const omq = join(project, '.omq');
  const config = readJson(join(omq, 'config.json'), {});
  const waves = readJson(join(omq, 'runtime', 'waves.json'), null);
  const evidenceDir = join(omq, 'evidence');
  const evidenceFiles = existsSync(evidenceDir)
    ? readdirSync(evidenceDir).filter((name) => name.endsWith('.json')).length
    : 0;

  const tasks = Array.isArray(waves?.tasks)
    ? waves.tasks.map((task) => ({
        id: task.id ?? '?',
        role: task.role ?? '?',
        status: task.status ?? 'unknown',
        acceptance: task.acceptance ?? '',
        evidence: Array.isArray(task.evidence) ? task.evidence.length : 0,
      }))
    : [];

  return {
    project,
    plan: waves?.plan ?? null,
    wave: waves?.wave ?? null,
    tasks,
    evidenceFiles,
    profiles: {
      orchestration: Boolean(config?.profiles?.orchestration),
      graph: Boolean(config?.profiles?.graph),
      dashboard: Boolean(config?.profiles?.dashboard),
      keywordHook: Boolean(config?.keyword_hook),
    },
    generatedAt: new Date().toISOString(),
  };
}
