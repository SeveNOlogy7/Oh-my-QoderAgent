import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCoordinator } from '../mcp/coordinator/db.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'omo-coord-'));
  const coordinator = openCoordinator(join(dir, 'coordinator.sqlite'));
  t.after(async () => {
    try {
      coordinator.close();
    } catch {
      // already closed
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        rmSync(dir, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  });
  return coordinator;
}

test('coordinator opens in WAL mode with an empty schema', (t) => {
  const coordinator = setup(t);
  const status = coordinator.status();
  assert.equal(status.journalMode, 'wal');
  assert.equal(status.schemaVersion, 1);
  assert.deepEqual(status.tasks, {
    pending: 0,
    active: 0,
    done: 0,
    failed: 0,
    blocked: 0,
  });
});

test('tasks can be created, read, listed, and updated', (t) => {
  const coordinator = setup(t);
  const task = coordinator.createTask({
    id: 'T1',
    title: 'One',
    role: 'omo-junior',
    acceptance: 'npm test',
    files: ['a.js'],
  });
  assert.equal(task.status, 'pending');
  assert.deepEqual(task.files, ['a.js']);
  assert.deepEqual(task.dependsOn, []);

  coordinator.updateTask({ id: 'T1', title: 'Renamed' });
  assert.equal(coordinator.getTask('T1').title, 'Renamed');
  assert.equal(coordinator.listTasks().length, 1);
  assert.throws(() => coordinator.createTask({ id: 'T1', title: 'duplicate' }), /cannot create/);
});

test('dependencies gate readiness and completion unlocks dependents', (t) => {
  const coordinator = setup(t);
  coordinator.createTask({ id: 'A', title: 'A' });
  coordinator.createTask({ id: 'B', title: 'B' });
  coordinator.addDependency({ taskId: 'A', dependsOn: 'B' });

  assert.deepEqual(coordinator.listReady().map((task) => task.id), ['B']);
  const claim = coordinator.claimTask({ id: 'B', owner: 'w1' });
  assert.equal(claim.ok, true);
  const complete = coordinator.completeTask({
    id: 'B',
    owner: 'w1',
    evidence: { command: 'true', exitCode: 0 },
  });
  assert.equal(complete.ok, true);
  assert.deepEqual(coordinator.listReady().map((task) => task.id), ['A']);
});

test('claim enforces maxParallel and is reentrant for the same owner', (t) => {
  const coordinator = setup(t);
  coordinator.createTask({ id: 'A', title: 'A' });
  coordinator.createTask({ id: 'B', title: 'B' });
  assert.equal(coordinator.claimTask({ id: 'A', owner: 'w1', maxParallel: 1 }).ok, true);
  const second = coordinator.claimTask({ id: 'B', owner: 'w2', maxParallel: 1 });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'max_parallel');
  const reentrant = coordinator.claimTask({ id: 'A', owner: 'w1' });
  assert.equal(reentrant.ok, true);
  assert.equal(reentrant.reentrant, true);
  const other = coordinator.claimTask({ id: 'A', owner: 'w2' });
  assert.equal(other.ok, false);
  assert.equal(other.reason, 'leased');
});

test('terminal-state guard blocks a second completion', (t) => {
  const coordinator = setup(t);
  coordinator.createTask({ id: 'A', title: 'A' });
  coordinator.claimTask({ id: 'A', owner: 'w1' });
  assert.equal(coordinator.completeTask({ id: 'A', owner: 'w1', evidence: 'done' }).ok, true);
  const again = coordinator.completeTask({ id: 'A', owner: 'w1', evidence: 'again' });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'terminal');
});

test('dependency cycles and self-dependencies are rejected', (t) => {
  const coordinator = setup(t);
  coordinator.createTask({ id: 'A', title: 'A' });
  coordinator.createTask({ id: 'B', title: 'B' });
  coordinator.addDependency({ taskId: 'A', dependsOn: 'B' });
  assert.throws(
    () => coordinator.addDependency({ taskId: 'B', dependsOn: 'A' }),
    /cycle/,
  );
  assert.throws(
    () => coordinator.addDependency({ taskId: 'A', dependsOn: 'A' }),
    /itself/,
  );
});

test('release and fail transition an active task', (t) => {
  const coordinator = setup(t);
  coordinator.createTask({ id: 'A', title: 'A' });
  coordinator.claimTask({ id: 'A', owner: 'w1' });
  assert.equal(coordinator.releaseTask({ id: 'A', owner: 'w1' }).ok, true);
  assert.equal(coordinator.getTask('A').status, 'pending');

  coordinator.claimTask({ id: 'A', owner: 'w1' });
  assert.equal(coordinator.failTask({ id: 'A', owner: 'w1', reason: 'boom' }).ok, true);
  assert.equal(coordinator.getTask('A').status, 'failed');
  const complete = coordinator.completeTask({ id: 'A', owner: 'w1', evidence: 'late' });
  assert.equal(complete.reason, 'terminal');
});

test('mailbox reads unread messages and marks them read', (t) => {
  const coordinator = setup(t);
  coordinator.sendMessage({ from: 'main', to: 'w1', body: 'hello' });
  const unread = coordinator.readMailbox({ to: 'w1', unreadOnly: true, markRead: true });
  assert.equal(unread.length, 1);
  assert.equal(unread[0].body, 'hello');
  assert.ok(unread[0].readAt, 'markRead should return the new read timestamp');
  const again = coordinator.readMailbox({ to: 'w1', unreadOnly: true });
  assert.equal(again.length, 0);
  const all = coordinator.readMailbox({ to: 'w1', unreadOnly: false });
  assert.equal(all.length, 1);

  coordinator.sendMessage({ from: 'main', to: 'w2', body: 'second' });
  const unmarked = coordinator.readMailbox({ to: 'w2', unreadOnly: true, markRead: false });
  assert.equal(unmarked.length, 1);
  assert.equal(unmarked[0].readAt, null);
  const stillUnread = coordinator.readMailbox({ to: 'w2', unreadOnly: true, markRead: false });
  assert.equal(stillUnread.length, 1);
});

test('expired leases can be taken over by another owner', async (t) => {
  const coordinator = setup(t);
  coordinator.createTask({ id: 'A', title: 'A' });
  assert.equal(
    coordinator.claimTask({ id: 'A', owner: 'w1', leaseMs: 1000 }).ok,
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.deepEqual(coordinator.listReady().map((task) => task.id), ['A']);
  const takeover = coordinator.claimTask({ id: 'A', owner: 'w2', leaseMs: 1000 });
  assert.equal(takeover.ok, true);
  assert.equal(takeover.task.lease_owner, 'w2');
  assert.equal(takeover.task.attempts, 2);
});

test('reentrant claim refreshes the lease', async (t) => {
  const coordinator = setup(t);
  coordinator.createTask({ id: 'A', title: 'A' });
  const first = coordinator.claimTask({ id: 'A', owner: 'w1', leaseMs: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = coordinator.claimTask({ id: 'A', owner: 'w1', leaseMs: 5000 });
  assert.equal(second.ok, true);
  assert.equal(second.reentrant, true);
  assert.ok(Date.parse(second.task.lease_until) > Date.parse(first.task.lease_until));
});

test('terminal transitions require the lease owner', (t) => {
  const coordinator = setup(t);
  coordinator.createTask({ id: 'A', title: 'A' });
  coordinator.claimTask({ id: 'A', owner: 'w1' });

  const wrongComplete = coordinator.completeTask({ id: 'A', owner: 'w2', evidence: 'x' });
  assert.equal(wrongComplete.ok, false);
  assert.equal(wrongComplete.reason, 'lease_owner_mismatch');
  const wrongFail = coordinator.failTask({ id: 'A', owner: 'w2', reason: 'x' });
  assert.equal(wrongFail.ok, false);
  assert.equal(wrongFail.reason, 'lease_owner_mismatch');
  assert.equal(coordinator.completeTask({ id: 'A', owner: 'w1', evidence: 'ok' }).ok, true);
});

test('blocked status is reachable through updateTask', (t) => {
  const coordinator = setup(t);
  coordinator.createTask({ id: 'A', title: 'A' });
  const blocked = coordinator.updateTask({
    id: 'A',
    status: 'blocked',
    reason: 'waiting on input',
  });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.last_error, 'waiting on input');
  const claim = coordinator.claimTask({ id: 'A', owner: 'w1' });
  assert.equal(claim.ok, false);
  assert.equal(claim.reason, 'not_pending');
});

test('coordinator writes an atomic waves.json mirror', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'omo-mirror-'));
  writeFileSync(
    join(dir, 'waves.json'),
    JSON.stringify({ plan: '.omq/plans/x.md', wave: 2, tasks: [] }),
  );
  const coordinator = openCoordinator(join(dir, 'coordinator.sqlite'));
  t.after(async () => {
    try {
      coordinator.close();
    } catch {
      // already closed
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        rmSync(dir, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  });

  coordinator.createTask({ id: 'A', title: 'A' });
  coordinator.claimTask({ id: 'A', owner: 'w1' });
  coordinator.completeTask({ id: 'A', owner: 'w1', evidence: { command: 'true' } });

  const mirror = JSON.parse(readFileSync(join(dir, 'waves.json'), 'utf8'));
  assert.equal(mirror.plan, '.omq/plans/x.md');
  assert.equal(mirror.wave, 2);
  assert.equal(mirror.source, 'coordinator');
  assert.equal(mirror.tasks.length, 1);
  assert.equal(mirror.tasks[0].status, 'done');
  assert.equal(mirror.tasks[0].evidence.length, 1);
  assert.equal(coordinator.status().mirrorPath, join(dir, 'waves.json'));
});

test('status reports counts and active leases', (t) => {
  const coordinator = setup(t);
  coordinator.createTask({ id: 'A', title: 'A' });
  coordinator.createTask({ id: 'B', title: 'B' });
  coordinator.claimTask({ id: 'A', owner: 'w1' });
  coordinator.completeTask({ id: 'B', owner: 'w1', evidence: 'not active' });
  const status = coordinator.status();
  assert.equal(status.tasks.pending, 1);
  assert.equal(status.tasks.active, 1);
  assert.equal(status.activeLeases, 1);
});
