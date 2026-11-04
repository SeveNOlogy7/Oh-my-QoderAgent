#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { openCoordinator } from './db.mjs';
import { TOOL_DEFINITIONS, callTool } from './tools.mjs';

const project = process.env.QODER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const dbPath =
  process.env.OMO_COORDINATOR_DB || join(project, '.omq', 'runtime', 'coordinator.sqlite');

let coordinator;
try {
  coordinator = openCoordinator(dbPath);
} catch (error) {
  process.stderr.write(`omo-coordinator: cannot open ${dbPath}: ${error.message}\n`);
  process.exit(1);
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

input.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    sendError(null, -32700, 'Parse error');
    return;
  }
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    if (message?.id !== undefined) sendError(message.id, -32600, 'Invalid Request');
    return;
  }

  const { id, method, params } = message;

  try {
    if (method === 'initialize') {
      sendResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'omo-coordinator', version: '1.1.0' },
      });
      return;
    }
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      return;
    }
    if (method === 'ping') {
      sendResult(id, {});
      return;
    }
    if (method === 'tools/list') {
      sendResult(id, { tools: TOOL_DEFINITIONS });
      return;
    }
    if (method === 'tools/call') {
      const toolName = params?.name;
      if (typeof toolName !== 'string') {
        sendError(id, -32602, 'Missing tool name');
        return;
      }
      try {
        const result = callTool(coordinator, toolName, params?.arguments ?? {});
        sendResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (error) {
        sendResult(id, {
          content: [{ type: 'text', text: error.message }],
          isError: true,
        });
      }
      return;
    }
    if (id !== undefined) sendError(id, -32601, `Method not found: ${method}`);
  } catch (error) {
    if (id !== undefined) sendError(id, -32603, error.message);
  }
});

function shutdown() {
  try {
    coordinator.close();
  } catch {
    // ignore close failure
  }
  process.exit(0);
}

input.on('close', shutdown);
process.stdin.on('end', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
