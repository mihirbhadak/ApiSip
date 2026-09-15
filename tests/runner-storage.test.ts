import { beforeEach, expect, it } from 'vitest';
import { deleteDB, openDB } from 'idb';
import {
  beginRun,
  checkpointRun,
  deleteRun,
  listRuns,
  recoverInterruptedRuns,
} from '../src/storage/runs';
import { clearDatabase, deleteRecords, prune, saveRecords } from '../src/storage/repository';
import { closeDB, getDB } from '../src/storage/database';
import { createRunReport } from '../src/runner/analytics';
import { defaultRunConfig } from '../src/runner/model';
import { defaultSettings } from '../src/shared/model';
import { fixture } from './fixtures';
import { splitRecord } from '../src/storage/repository';
import { getDraft } from '../src/storage/drafts';
const report = () =>
  createRunReport(
    {
      sourceId: 'test-1',
      request: fixture().request,
      config: defaultRunConfig,
      variables: [],
      rows: [],
      seed: 1,
    },
    'https://example.com',
    'default',
    'initial',
    [],
  );
beforeEach(async () => {
  await clearDatabase();
  await saveRecords([fixture()]);
});
it('migrates version-two history and editor drafts without clearing existing data', async () => {
  await closeDB();
  await deleteDB('api-catcher');
  const legacy = await openDB('api-catcher', 2, {
    upgrade(db) {
      for (const name of ['requests', 'bodies', 'entities', 'state', 'drafts']) {
        const store = db.createObjectStore(name, name === 'state' ? undefined : { keyPath: 'id' });
        const indexes =
          name === 'requests'
            ? [
                'workspaceId',
                'sessionId',
                'timestamp',
                'tabId',
                'method',
                'status',
                'domain',
                'captureKey',
              ]
            : name === 'entities'
              ? ['workspaceId', 'kind']
              : name === 'drafts'
                ? ['sourceId']
                : [];
        for (const index of indexes) store.createIndex(index, index);
      }
    },
  });
  const [row, body] = splitRecord(fixture());
  await legacy.put('requests', row);
  await legacy.put('bodies', body);
  await legacy.put('drafts', {
    id: 'old-draft',
    sourceId: 'test-1',
    request: fixture().request,
    context: 'browser',
    revision: 4,
    updatedAt: 1,
  });
  await legacy.put('state', { ...defaultSettings, theme: 'dark' }, 'settings');
  legacy.close();
  const upgraded = await getDB();
  expect(upgraded.version).toBe(3);
  expect(upgraded.objectStoreNames.contains('runs')).toBe(true);
  expect(await getDraft('old-draft')).toMatchObject({ revision: 4, request: fixture().request });
  expect((await upgraded.get('state', 'settings'))?.theme).toBe('dark');
  expect(await upgraded.count('requests')).toBe(1);
});
it('persists checkpoints, recovers interruption honestly and never resumes traffic', async () => {
  const r = report();
  await beginRun(r);
  r.started = 10;
  r.finished = 8;
  r.inFlight = 2;
  await checkpointRun(r);
  await recoverInterruptedRuns();
  const saved = (await listRuns())[0]!;
  expect(saved.state).toBe('interrupted');
  expect(saved.started).toBe(10);
  expect(saved.finished).toBe(8);
  expect(saved.inFlight).toBe(2);
  expect(saved.reason).toContain('unknown');
});
it('protects active source requests from retention and removes run reports with explicit source deletion', async () => {
  const r = report();
  await beginRun(r);
  await prune({ ...defaultSettings, retentionDays: 7 });
  expect(await (await getDB()).count('requests')).toBe(1);
  await expect(deleteRun(r.id)).rejects.toThrow('Stop');
  r.state = 'stopping';
  await checkpointRun(r);
  await deleteRecords(['test-1'], true);
  expect(await (await getDB()).count('requests')).toBe(1);
  await deleteRecords(['test-1']);
  expect(await listRuns()).toEqual([]);
  await expect(checkpointRun(r)).rejects.toThrow('deleted');
  expect(await listRuns()).toEqual([]);
});
it('retains only the latest fifty reports and preserves captured request data', async () => {
  for (let i = 0; i < 55; i++) {
    const r = report();
    r.createdAt += i;
    await beginRun(r);
    r.state = 'completed';
    await checkpointRun(r);
  }
  expect(await listRuns()).toHaveLength(50);
  expect(await (await getDB()).count('requests')).toBe(1);
  await clearDatabase();
  expect(await listRuns()).toEqual([]);
});
