#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function noop() {
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
  process.exit(0);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    const project =
      process.env.QODER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const omqConfig = readJson(join(project, '.omq', 'config.json'));
    const qoderConfig = readJson(join(project, '.qoder', 'config.json'));
    const enabled =
      omqConfig?.keyword_hook === true ||
      qoderConfig?.keyword_hook === true ||
      qoderConfig?.omq?.keyword_hook === true;

    if (!enabled) noop();

    const payload = input.trim() ? JSON.parse(input) : {};
    const prompt = String(payload.prompt ?? payload.user_prompt ?? payload.message ?? '');
    if (!prompt.trim() || prompt.trim().startsWith('/')) noop();

    const rules = [
      [/\b(ultrawork|ulw)\b/i, '/omo-qoder:ulw'],
      [/\b(team mode|parallel team)\b/i, '/omo-qoder:team'],
      [/\b(hyperplan|plan this|plan the)\b/i, '/omo-qoder:hyperplan'],
    ];
    const hit = rules.find(([pattern]) => pattern.test(prompt));
    if (!hit) noop();

    const context =
      `Keyword gate: the prompt matches ${hit[0]}. ` +
      `If the user wants this workflow, use ${hit[1]}. ` +
      'Do not start it without an explicit request.';

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: context,
        },
      }),
    );
    process.exit(0);
  } catch {
    noop();
  }
});
