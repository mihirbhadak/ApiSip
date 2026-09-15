import type { IDBPObjectStore, StoreNames } from 'idb';
import { getDB, type InspectorDB } from './database';
import { isRunActive, type RunReport } from '../runner/model';

export async function beginRun(report: RunReport) {
  const db = await getDB(),
    tx = db.transaction(['runs', 'requests'], 'readwrite');
  const source = await tx.objectStore('requests').get(report.sourceId);
  if (
    !source ||
    source.workspaceId !== report.workspaceId ||
    source.sessionId !== report.sessionId
  ) {
    await tx.done;
    throw new Error('The source request was deleted or moved.');
  }
  const store = tx.objectStore('runs');
  await store.add(report);
  let excess = (await store.count()) - 50;
  let cursor = await store.index('createdAt').openCursor();
  while (cursor && excess > 0) {
    if (!isRunActive(cursor.value.state)) {
      await cursor.delete();
      excess--;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}
export async function checkpointRun(report: RunReport) {
  const db = await getDB(),
    tx = db.transaction(['runs', 'requests'], 'readwrite');
  if (
    !(await tx.objectStore('runs').count(report.id)) ||
    !(await tx.objectStore('requests').count(report.sourceId))
  ) {
    await tx.done;
    throw new Error('Run history or its source request was deleted.');
  }
  await tx.objectStore('runs').put(report);
  await tx.done;
}
export async function listRuns(sourceId?: string) {
  const db = await getDB();
  const rows = sourceId
    ? await db.getAllFromIndex('runs', 'sourceId', sourceId)
    : await db.getAll('runs');
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteRun(id: string) {
  const db = await getDB(),
    tx = db.transaction('runs', 'readwrite');
  const row = await tx.store.get(id);
  if (row && isRunActive(row.state)) {
    await tx.done;
    throw new Error('Stop the run before deleting its report.');
  }
  await tx.store.delete(id);
  await tx.done;
}
export async function recoverInterruptedRuns() {
  const db = await getDB(),
    tx = db.transaction('runs', 'readwrite');
  for (const state of ['running', 'draining', 'stopping']) {
    for (const report of await tx.store.index('state').getAll(state)) {
      await tx.store.put({
        ...report,
        state: 'interrupted',
        updatedAt: Date.now(),
        reason:
          'Runner was closed or Chrome restarted. Last checkpoint only; in-flight outcomes are unknown. No requests were retried.',
      });
    }
  }
  await tx.done;
}
export async function removeRelatedRuns<Names extends StoreNames<InspectorDB>[]>(
  store: IDBPObjectStore<InspectorDB, Names, 'runs', 'readwrite'>,
  ids: Set<string>,
) {
  let cursor = await store.index('sourceId').openKeyCursor();
  while (cursor) {
    if (ids.has(cursor.key)) await store.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
}
export async function activeRunSources() {
  const db = await getDB();
  const reports = [
    ...(await db.getAllFromIndex('runs', 'state', 'running')),
    ...(await db.getAllFromIndex('runs', 'state', 'draining')),
    ...(await db.getAllFromIndex('runs', 'state', 'stopping')),
  ];
  return new Set(reports.map((report) => report.sourceId));
}
