import { CoordinatorError } from './db.mjs';

const taskProperties = {
  id: { type: 'string', description: 'Stable task id' },
  title: { type: 'string', description: 'Short task title' },
  role: { type: 'string', description: 'Assigned role agent' },
  objective: { type: 'string', description: 'What the task must achieve' },
  acceptance: { type: 'string', description: 'Observable acceptance check' },
  files: { type: 'array', items: { type: 'string' }, description: 'Files or surfaces in scope' },
};

export const TOOL_DEFINITIONS = [
  {
    name: 'coordinator_create_task',
    description: 'Create a pending task in the project coordinator.',
    inputSchema: {
      type: 'object',
      properties: taskProperties,
      required: ['id', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_get_task',
    description: 'Read one task with its dependencies and dependents.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_list_tasks',
    description: 'List tasks, optionally filtered by status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'active', 'done', 'failed', 'blocked'] },
        limit: { type: 'integer', minimum: 1, maximum: 500 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_update_task',
    description: 'Update task metadata, or mark a task blocked with a reason.',
    inputSchema: {
      type: 'object',
      properties: {
        ...taskProperties,
        status: { type: 'string', enum: ['blocked'] },
        reason: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_add_dependency',
    description: 'Add a dependency edge; rejects self-dependencies and cycles.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        dependsOn: { type: 'string' },
      },
      required: ['taskId', 'dependsOn'],
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_list_ready',
    description: 'List pending tasks whose dependencies are all done and whose lease is free.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 200 } },
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_claim_task',
    description: 'Atomically claim a ready task with a lease. Enforces maxParallel.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        owner: { type: 'string' },
        maxParallel: { type: 'integer', minimum: 1 },
        leaseMs: { type: 'integer', minimum: 1000 },
      },
      required: ['id', 'owner'],
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_release_task',
    description: 'Release an active task back to pending; the owner must match the lease.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        owner: { type: 'string' },
      },
      required: ['id', 'owner'],
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_complete_task',
    description: 'Mark an active task done and append evidence. Requires the lease owner; terminal-state guard applies.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        owner: { type: 'string' },
        evidence: {
          oneOf: [
            { type: 'object', additionalProperties: true },
            { type: 'string' },
          ],
        },
      },
      required: ['id', 'owner'],
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_fail_task',
    description: 'Mark a task failed with a reason. An active task requires the lease owner; terminal-state guard applies.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        owner: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['id', 'owner'],
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_send_message',
    description: 'Append a message to the coordinator mailbox.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['body'],
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_read_mailbox',
    description: 'Read mailbox messages, optionally marking them read.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        unreadOnly: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        markRead: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'coordinator_status',
    description: 'Return task counts, unread messages, active leases, WAL mode, and schema version.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

export function callTool(coordinator, name, args = {}) {
  switch (name) {
    case 'coordinator_create_task':
      return coordinator.createTask(args);
    case 'coordinator_get_task':
      return coordinator.getTask(args.id) ?? { ok: false, reason: 'not_found', id: args.id };
    case 'coordinator_list_tasks':
      return coordinator.listTasks(args);
    case 'coordinator_update_task':
      return coordinator.updateTask(args);
    case 'coordinator_add_dependency':
      return coordinator.addDependency(args);
    case 'coordinator_list_ready':
      return coordinator.listReady(args);
    case 'coordinator_claim_task':
      return coordinator.claimTask(args);
    case 'coordinator_release_task':
      return coordinator.releaseTask(args);
    case 'coordinator_complete_task':
      return coordinator.completeTask(args);
    case 'coordinator_fail_task':
      return coordinator.failTask(args);
    case 'coordinator_send_message':
      return coordinator.sendMessage(args);
    case 'coordinator_read_mailbox':
      return coordinator.readMailbox(args);
    case 'coordinator_status':
      return coordinator.status();
    default:
      throw new CoordinatorError(`unknown tool: ${name}`);
  }
}
