#!/usr/bin/env node
import { readStatus, resolveProject } from './status-data.mjs';

const asJson = process.argv.includes('--json');
const result = readStatus(resolveProject());

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const lines = [
  `Project: ${result.project}`,
  `Plan: ${result.plan ?? 'none'}`,
  `Wave: ${result.wave ?? 'none'}`,
];

if (result.tasks.length === 0) {
  lines.push('Tasks: none');
} else {
  lines.push(`Tasks (${result.tasks.length}):`);
  for (const task of result.tasks) {
    if (lines.length >= 36) {
      lines.push(`  ... ${result.tasks.length - (lines.length - 4)} more`);
      break;
    }
    lines.push(`  [${task.status}] ${task.id} (${task.role}) — ${task.acceptance}`);
  }
}

lines.push(`Evidence files: ${result.evidenceFiles}`);
lines.push(
  `Profiles: orchestration=${result.profiles.orchestration ? 'on' : 'off'} ` +
    `graph=${result.profiles.graph ? 'on' : 'off'} ` +
    `dashboard=${result.profiles.dashboard ? 'on' : 'off'} ` +
    `keyword=${result.profiles.keywordHook ? 'on' : 'off'}`,
);

console.log(lines.slice(0, 40).join('\n'));
