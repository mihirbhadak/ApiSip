import { beforeEach, expect, it } from 'vitest';
import { clearDatabase, deleteEntity } from '../src/storage/repository';
import { getDB } from '../src/storage/database';
import { newSuite, type Environment, type SuiteReport } from '../src/lab/model';
import {
  deleteLabItem,
  listLab,
  saveEnvironment,
  saveSuite,
  saveSuiteReport,
} from '../src/storage/lab';
beforeEach(async () => {
  await clearDatabase();
});
it('persists suites and environments with optimistic revision conflicts and deletion protection', async () => {
  const initial = newSuite('default'),
    saved = await saveSuite(initial);
  expect(saved.revision).toBe(1);
  await expect(saveSuite(initial)).rejects.toThrow('another tab');
  expect((await listLab('default')).suites).toHaveLength(1);
  const env: Environment = {
    id: 'e',
    workspaceId: 'default',
    name: 'Stage',
    origin: 'https://staging.example.com',
    variables: [{ name: 'apiToken', value: 'local-secret' }],
    revision: 0,
    updatedAt: 0,
  };
  const savedEnv = await saveEnvironment(env);
  await expect(saveEnvironment(env)).rejects.toThrow('another tab');
  await deleteLabItem('environments', 'e');
  await expect(saveEnvironment(savedEnv)).rejects.toThrow('deleted');
  await deleteLabItem('suites', saved.id);
  await expect(saveSuite(saved)).rejects.toThrow('deleted');
});
it('bounds reports to 25 and prevents checkpoints resurrecting a deleted suite', async () => {
  const suite = await saveSuite(newSuite('default'));
  const report: SuiteReport = {
    id: 'r',
    suiteId: suite.id,
    suiteName: suite.name,
    workspaceId: 'default',
    environment: '',
    timestamp: 0,
    duration: 0,
    state: 'interrupted',
    steps: [],
    planned: 1,
    origins: [],
  };
  for (let i = 0; i < 30; i++) await saveSuiteReport({ ...report, id: 'r' + i, timestamp: i });
  expect((await listLab('default')).reports).toHaveLength(25);
  await deleteLabItem('suites', suite.id);
  expect((await listLab('default')).reports).toHaveLength(0);
  await expect(saveSuiteReport(report)).rejects.toThrow('deleted');
});
it('removes lab data with its workspace and during all-data deletion', async () => {
  await saveSuite(newSuite('default'));
  await deleteEntity('default');
  expect((await listLab('default')).suites).toHaveLength(0);
  await clearDatabase();
  await saveSuite(newSuite('default'));
  await clearDatabase();
  const db = await getDB();
  expect(await db.count('suites')).toBe(0);
  expect(await db.count('environments')).toBe(0);
  expect(await db.count('suiteReports')).toBe(0);
});
