import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SCHEMA_VERSION = 1;
const VALID_STATUSES = new Set(['pending', 'active', 'done', 'failed', 'blocked']);

function nowIso() {
  return new Date().toISOString();
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function mapTask(row) {
  if (!row) return null;
  const { files_json, evidence_json, ...rest } = row;
  return {
    ...rest,
    files: parseJson(files_json || '[]', []),
    evidence: parseJson(evidence_json || '[]', []),
  };
}

export class CoordinatorError extends Error {}

export function openCoordinator(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      role TEXT,
      objective TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'done', 'failed', 'blocked')),
      acceptance TEXT,
      files_json TEXT NOT NULL DEFAULT '[]',
      evidence_json TEXT NOT NULL DEFAULT '[]',
      last_error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      lease_owner TEXT,
      lease_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deps (
      task_id TEXT NOT NULL,
      depends_on TEXT NOT NULL,
      PRIMARY KEY (task_id, depends_on),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on) REFERENCES tasks(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS mailbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT,
      from_agent TEXT,
      to_agent TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_deps_task ON deps(task_id);
    CREATE INDEX IF NOT EXISTS idx_deps_depends_on ON deps(depends_on);
    CREATE INDEX IF NOT EXISTS idx_mailbox_to ON mailbox(to_agent, read_at);
  `);
  db.prepare('INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)').run(
    'schema_version',
    String(SCHEMA_VERSION),
  );
  const coordinator = new Coordinator(db, dbPath);
  coordinator.writeMirror();
  return coordinator;
}

class Coordinator {
  constructor(db, dbPath) {
    this.db = db;
    this.dbPath = dbPath;
    this.mirrorPath = join(dirname(dbPath), 'waves.json');
    this.lastMirrorError = null;
  }

  close() {
    this.db.close();
  }

  writeMirror() {
    try {
      const tasks = this.db
        .prepare('SELECT * FROM tasks ORDER BY created_at ASC')
        .all()
        .map((row) => {
          const task = mapTask(row);
          task.dependsOn = this.db
            .prepare('SELECT depends_on AS id FROM deps WHERE task_id = ? ORDER BY depends_on')
            .all(task.id)
            .map((item) => item.id);
          return {
            id: task.id,
            role: task.role,
            status: task.status,
            acceptance: task.acceptance,
            evidence: task.evidence,
            dependsOn: task.dependsOn,
            leaseOwner: task.lease_owner,
            leaseUntil: task.lease_until,
          };
        });
      let existing = {};
      try {
        existing = JSON.parse(readFileSync(this.mirrorPath, 'utf8'));
      } catch {
        existing = {};
      }
      const mirror = {
        plan: existing?.plan ?? null,
        wave: existing?.wave ?? 1,
        tasks,
        generatedAt: nowIso(),
        source: 'coordinator',
      };
      const temp = `${this.mirrorPath}.tmp-${process.pid}`;
      writeFileSync(temp, `${JSON.stringify(mirror, null, 2)}\n`, 'utf8');
      renameSync(temp, this.mirrorPath);
      this.lastMirrorError = null;
    } catch (error) {
      this.lastMirrorError = error.message;
    }
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback failure
      }
      throw error;
    }
  }

  row(id) {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  }

  getTask(id) {
    const task = mapTask(this.row(id));
    if (!task) return null;
    task.dependsOn = this.db
      .prepare('SELECT depends_on AS id FROM deps WHERE task_id = ? ORDER BY depends_on')
      .all(id)
      .map((item) => item.id);
    task.dependents = this.db
      .prepare('SELECT task_id AS id FROM deps WHERE depends_on = ? ORDER BY task_id')
      .all(id)
      .map((item) => item.id);
    return task;
  }

  createTask(input) {
    const id = String(input.id ?? '').trim();
    const title = String(input.title ?? '').trim();
    if (!id) throw new CoordinatorError('id is required');
    if (!title) throw new CoordinatorError('title is required');
    const now = nowIso();
    try {
      this.db
        .prepare(
          `INSERT INTO tasks
             (id, title, role, objective, status, acceptance, files_json, evidence_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, '[]', ?, ?)`,
        )
        .run(
          id,
          title,
          input.role ?? null,
          input.objective ?? null,
          input.acceptance ?? null,
          JSON.stringify(Array.isArray(input.files) ? input.files : []),
          now,
          now,
        );
    } catch (error) {
      throw new CoordinatorError(`cannot create task ${id}: ${error.message}`);
    }
    this.writeMirror();
    return this.getTask(id);
  }

  updateTask(input) {
    const id = String(input.id ?? '').trim();
    if (!id) throw new CoordinatorError('id is required');
    const task = this.row(id);
    if (!task) throw new CoordinatorError(`task not found: ${id}`);
    if (input.status !== undefined) {
      if (input.status !== 'blocked') {
        throw new CoordinatorError('status may only be set to blocked');
      }
      if (task.status === 'done' || task.status === 'failed') {
        throw new CoordinatorError(`task is terminal: ${task.status}`);
      }
      this.db
        .prepare(
          `UPDATE tasks
           SET status = 'blocked', last_error = ?, lease_owner = NULL, lease_until = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(String(input.reason ?? 'blocked'), nowIso(), id);
      this.writeMirror();
      return this.getTask(id);
    }
    const fields = [];
    const values = [];
    for (const [key, column] of [
      ['title', 'title'],
      ['role', 'role'],
      ['objective', 'objective'],
      ['acceptance', 'acceptance'],
    ]) {
      if (input[key] !== undefined) {
        fields.push(`${column} = ?`);
        values.push(input[key]);
      }
    }
    if (input.files !== undefined) {
      fields.push('files_json = ?');
      values.push(JSON.stringify(Array.isArray(input.files) ? input.files : []));
    }
    if (fields.length === 0) return this.getTask(id);
    fields.push('updated_at = ?');
    values.push(nowIso());
    values.push(id);
    this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    this.writeMirror();
    return this.getTask(id);
  }

  listTasks(input = {}) {
    const limit = Math.max(1, Math.min(Number(input.limit ?? 100) || 100, 500));
    let rows;
    if (input.status !== undefined) {
      if (!VALID_STATUSES.has(input.status)) {
        throw new CoordinatorError(`invalid status: ${input.status}`);
      }
      rows = this.db
        .prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC LIMIT ?')
        .all(input.status, limit);
    } else {
      rows = this.db
        .prepare('SELECT * FROM tasks ORDER BY created_at ASC LIMIT ?')
        .all(limit);
    }
    return rows.map((row) => this.getTask(row.id));
  }

  listReady(input = {}) {
    const limit = Math.max(1, Math.min(Number(input.limit ?? 50) || 50, 200));
    const now = nowIso();
    const rows = this.db
      .prepare(
        `SELECT t.* FROM tasks t
         WHERE (
             (t.status = 'pending' AND t.lease_owner IS NULL)
             OR (t.status = 'active' AND (t.lease_until IS NULL OR t.lease_until < ?))
           )
           AND NOT EXISTS (
             SELECT 1 FROM deps d
             JOIN tasks p ON p.id = d.depends_on
             WHERE d.task_id = t.id AND p.status != 'done'
           )
         ORDER BY t.created_at ASC
         LIMIT ?`,
      )
      .all(now, limit);
    return rows.map((row) => this.getTask(row.id));
  }

  addDependency(input) {
    const taskId = String(input.taskId ?? '').trim();
    const dependsOn = String(input.dependsOn ?? '').trim();
    if (!taskId || !dependsOn) throw new CoordinatorError('taskId and dependsOn are required');
    if (taskId === dependsOn) throw new CoordinatorError('a task cannot depend on itself');
    if (!this.row(taskId)) throw new CoordinatorError(`task not found: ${taskId}`);
    if (!this.row(dependsOn)) throw new CoordinatorError(`task not found: ${dependsOn}`);
    const cycle = this.db
      .prepare(
        `WITH RECURSIVE reach(id) AS (
           SELECT depends_on FROM deps WHERE task_id = ?
           UNION
           SELECT d.depends_on FROM deps d JOIN reach r ON d.task_id = r.id
         )
         SELECT 1 AS hit FROM reach WHERE id = ? LIMIT 1`,
      )
      .get(dependsOn, taskId);
    if (cycle) throw new CoordinatorError('dependency would create a cycle');
    this.db
      .prepare('INSERT OR IGNORE INTO deps(task_id, depends_on) VALUES (?, ?)')
      .run(taskId, dependsOn);
    this.writeMirror();
    return this.getTask(taskId);
  }

  claimTask(input) {
    const id = String(input.id ?? '').trim();
    const owner = String(input.owner ?? '').trim();
    if (!id) throw new CoordinatorError('id is required');
    if (!owner) throw new CoordinatorError('owner is required');
    const maxParallel = Math.max(1, Number(input.maxParallel ?? 4) || 4);
    const leaseMs = Math.max(1000, Number(input.leaseMs ?? 900000) || 900000);
    const now = nowIso();

    const result = this.transaction(() => {
      const existing = this.row(id);
      if (!existing) return { ok: false, reason: 'not_found' };
      if (existing.status === 'active' && existing.lease_owner === owner) {
        const until = new Date(Date.now() + leaseMs).toISOString();
        this.db
          .prepare('UPDATE tasks SET lease_until = ?, updated_at = ? WHERE id = ?')
          .run(until, now, id);
        return { ok: true, reentrant: true };
      }
      const expired =
        existing.status === 'active' &&
        (existing.lease_until === null || existing.lease_until < now);
      if (existing.status !== 'pending' && !expired) {
        return {
          ok: false,
          reason: existing.status === 'active' ? 'leased' : 'not_pending',
          status: existing.status,
          leaseOwner: existing.lease_owner,
          leaseUntil: existing.lease_until,
        };
      }
      const active = this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM tasks
           WHERE status = 'active' AND lease_until IS NOT NULL AND lease_until >= ?`,
        )
        .get(now).n;
      if (active >= maxParallel) {
        return { ok: false, reason: 'max_parallel', active, maxParallel };
      }
      const blocking = this.db
        .prepare(
          `SELECT p.id AS id FROM deps d
           JOIN tasks p ON p.id = d.depends_on
           WHERE d.task_id = ? AND p.status != 'done'
           LIMIT 1`,
        )
        .get(id);
      if (blocking) return { ok: false, reason: 'dependencies', blocking: blocking.id };
      const until = new Date(Date.now() + leaseMs).toISOString();
      this.db
        .prepare(
          `UPDATE tasks
           SET status = 'active', lease_owner = ?, lease_until = ?, attempts = attempts + 1,
               last_error = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(owner, until, now, id);
      return { ok: true };
    });

    if (!result.ok) return result;
    this.writeMirror();
    return { ...result, task: this.getTask(id) };
  }

  releaseTask(input) {
    const id = String(input.id ?? '').trim();
    const owner = String(input.owner ?? '').trim();
    if (!id) throw new CoordinatorError('id is required');
    if (!owner) throw new CoordinatorError('owner is required');
    const result = this.transaction(() => {
      const task = this.row(id);
      if (!task) return { ok: false, reason: 'not_found' };
      if (task.status !== 'active') return { ok: false, reason: 'not_active', status: task.status };
      if (task.lease_owner !== owner) {
        return { ok: false, reason: 'lease_owner_mismatch', leaseOwner: task.lease_owner };
      }
      this.db
        .prepare(
          `UPDATE tasks
           SET status = 'pending', lease_owner = NULL, lease_until = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(nowIso(), id);
      return { ok: true };
    });
    if (!result.ok) return result;
    this.writeMirror();
    return { ...result, task: this.getTask(id) };
  }

  completeTask(input) {
    const id = String(input.id ?? '').trim();
    const owner = String(input.owner ?? '').trim();
    if (!id) throw new CoordinatorError('id is required');
    if (!owner) throw new CoordinatorError('owner is required');
    const result = this.transaction(() => {
      const task = this.row(id);
      if (!task) return { ok: false, reason: 'not_found' };
      if (task.status === 'done' || task.status === 'failed') {
        return { ok: false, reason: 'terminal', status: task.status };
      }
      if (task.status !== 'active') {
        return { ok: false, reason: 'not_active', status: task.status };
      }
      if (task.lease_owner !== owner) {
        return { ok: false, reason: 'lease_owner_mismatch', leaseOwner: task.lease_owner };
      }
      const evidence = parseJson(task.evidence_json || '[]', []);
      evidence.push({
        ...(input.evidence && typeof input.evidence === 'object'
          ? input.evidence
          : { summary: String(input.evidence ?? '') }),
        at: nowIso(),
      });
      this.db
        .prepare(
          `UPDATE tasks
           SET status = 'done', evidence_json = ?, lease_owner = NULL, lease_until = NULL,
               last_error = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(JSON.stringify(evidence), nowIso(), id);
      return { ok: true };
    });
    if (!result.ok) return result;
    this.writeMirror();
    return { ...result, task: this.getTask(id) };
  }

  failTask(input) {
    const id = String(input.id ?? '').trim();
    const owner = String(input.owner ?? '').trim();
    if (!id) throw new CoordinatorError('id is required');
    if (!owner) throw new CoordinatorError('owner is required');
    const result = this.transaction(() => {
      const task = this.row(id);
      if (!task) return { ok: false, reason: 'not_found' };
      if (task.status === 'done' || task.status === 'failed') {
        return { ok: false, reason: 'terminal', status: task.status };
      }
      if (task.status === 'active' && task.lease_owner !== owner) {
        return { ok: false, reason: 'lease_owner_mismatch', leaseOwner: task.lease_owner };
      }
      this.db
        .prepare(
          `UPDATE tasks
           SET status = 'failed', last_error = ?, lease_owner = NULL, lease_until = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(String(input.reason ?? 'failed'), nowIso(), id);
      return { ok: true };
    });
    if (!result.ok) return result;
    this.writeMirror();
    return { ...result, task: this.getTask(id) };
  }

  sendMessage(input) {
    const body = String(input.body ?? '').trim();
    if (!body) throw new CoordinatorError('body is required');
    const result = this.db
      .prepare(
        'INSERT INTO mailbox(task_id, from_agent, to_agent, body, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(input.taskId ?? null, input.from ?? null, input.to ?? null, body, nowIso());
    return {
      id: Number(result.lastInsertRowid),
      taskId: input.taskId ?? null,
      from: input.from ?? null,
      to: input.to ?? null,
      body,
    };
  }

  readMailbox(input = {}) {
    const limit = Math.max(1, Math.min(Number(input.limit ?? 50) || 50, 200));
    const unreadOnly = input.unreadOnly !== false;
    const markRead = input.markRead !== false;
    const clauses = [];
    const values = [];
    if (input.to !== undefined) {
      clauses.push('to_agent = ?');
      values.push(input.to);
    }
    if (unreadOnly) clauses.push('read_at IS NULL');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM mailbox ${where} ORDER BY id ASC LIMIT ?`)
      .all(...values, limit);
    const readAt = markRead ? nowIso() : null;
    if (markRead && rows.length > 0) {
      const statement = this.db.prepare('UPDATE mailbox SET read_at = ? WHERE id = ?');
      for (const row of rows) statement.run(readAt, row.id);
    }
    return rows.map((row) => ({
      id: Number(row.id),
      taskId: row.task_id,
      from: row.from_agent,
      to: row.to_agent,
      body: row.body,
      createdAt: row.created_at,
      readAt: markRead ? readAt : row.read_at,
    }));
  }

  status() {
    const counts = { pending: 0, active: 0, done: 0, failed: 0, blocked: 0 };
    for (const row of this.db
      .prepare('SELECT status, COUNT(*) AS n FROM tasks GROUP BY status')
      .all()) {
      counts[row.status] = Number(row.n);
    }
    const unread = this.db
      .prepare('SELECT COUNT(*) AS n FROM mailbox WHERE read_at IS NULL')
      .get().n;
    const schemaVersion = this.db
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get()?.value;
    const journalMode = this.db.prepare('PRAGMA journal_mode').get()?.journal_mode;
    return {
      dbPath: this.dbPath,
      journalMode,
      schemaVersion: Number(schemaVersion ?? 0),
      tasks: counts,
      unreadMessages: Number(unread),
      activeLeases: this.db
        .prepare("SELECT COUNT(*) AS n FROM tasks WHERE status = 'active' AND lease_owner IS NOT NULL")
        .get().n,
      mirrorPath: this.mirrorPath,
      mirrorError: this.lastMirrorError,
    };
  }
}
