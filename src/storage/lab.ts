import { getDB } from './database';
import {
  environmentSchema,
  suiteSchema,
  type Environment,
  type SuiteReport,
  type TestSuite,
} from '../lab/model';

export async function listLab(workspaceId: string) {
  const db = await getDB();
  const summaries: (Pick<TestSuite, 'id' | 'name' | 'workspaceId' | 'updatedAt'> & {
    stepCount: number;
  })[] = [];
  let cursor = await db.transaction('suites').store.index('workspaceId').openCursor(workspaceId);
  while (cursor) {
    const { id, name, workspaceId, updatedAt, steps } = cursor.value;
    summaries.push({ id, name, workspaceId, updatedAt, stepCount: steps.length });
    cursor = await cursor.continue();
  }
  const [environments, reports] = await Promise.all([
    db.getAllFromIndex('environments', 'workspaceId', workspaceId),
    db.getAllFromIndex('suiteReports', 'workspaceId', workspaceId),
  ]);
  return {
    suites: summaries.sort((a, b) => b.updatedAt - a.updatedAt),
    environments,
    reports: reports.sort((a, b) => b.timestamp - a.timestamp),
  };
}
export async function getSuite(id: string) {
  return (await getDB()).get('suites', id);
}
export async function saveSuite(input: TestSuite): Promise<TestSuite> {
  const suite = suiteSchema.parse(input),
    db = await getDB();
  const tx = db.transaction(['suites', 'entities'], 'readwrite');
  const previous = await tx.objectStore('suites').get(suite.id);
  if (!previous && suite.revision > 0)
    throw new Error('This suite was deleted. Create a new suite to keep these edits.');
  if (!(await tx.objectStore('entities').get(suite.workspaceId)))
    throw new Error('The workspace was deleted.');
  if (
    previous &&
    (previous.workspaceId !== suite.workspaceId || previous.revision !== suite.revision)
  )
    throw new Error('This suite changed in another tab. Reload before saving.');
  if (
    !previous &&
    (await tx.objectStore('suites').index('workspaceId').count(suite.workspaceId)) >= 100
  )
    throw new Error('This workspace already has 100 suites. Export or remove unused suites first.');
  const next = { ...suite, revision: (previous?.revision ?? 0) + 1, updatedAt: Date.now() };
  await tx.objectStore('suites').put(next);
  await tx.done;
  return next;
}
export async function saveEnvironment(input: Environment): Promise<Environment> {
  const env = environmentSchema.parse(input),
    db = await getDB();
  const tx = db.transaction(['environments', 'entities'], 'readwrite');
  const previous = await tx.objectStore('environments').get(env.id);
  if (!previous && env.revision > 0)
    throw new Error('This environment was deleted. Create a new environment to keep these edits.');
  if (!(await tx.objectStore('entities').get(env.workspaceId)))
    throw new Error('The workspace was deleted.');
  if (previous && (previous.workspaceId !== env.workspaceId || previous.revision !== env.revision))
    throw new Error('This environment changed in another tab. Reload before saving.');
  if (
    !previous &&
    (await tx.objectStore('environments').index('workspaceId').count(env.workspaceId)) >= 30
  )
    throw new Error('Environment limit reached (30 per workspace).');
  const next = { ...env, revision: (previous?.revision ?? 0) + 1, updatedAt: Date.now() };
  await tx.objectStore('environments').put(next);
  await tx.done;
  return next;
}
export async function saveSuiteReport(report: SuiteReport) {
  const db = await getDB(),
    tx = db.transaction(['suiteReports', 'suites'], 'readwrite');
  if (!(await tx.objectStore('suites').get(report.suiteId)))
    throw new Error('The suite was deleted. Run stopped.');
  await tx.objectStore('suiteReports').put(report);
  const reports = (
    await tx.objectStore('suiteReports').index('workspaceId').getAll(report.workspaceId)
  ).sort((a, b) => b.timestamp - a.timestamp);
  for (const old of reports.slice(25)) await tx.objectStore('suiteReports').delete(old.id);
  await tx.done;
}
export async function deleteLabItem(store: 'suites' | 'environments', id: string) {
  const db = await getDB(),
    tx = db.transaction([store, 'suiteReports'], 'readwrite');
  await tx.objectStore(store).delete(id);
  if (store === 'suites') {
    for (const report of await tx.objectStore('suiteReports').index('suiteId').getAll(id))
      await tx.objectStore('suiteReports').delete(report.id);
  }
  await tx.done;
}
