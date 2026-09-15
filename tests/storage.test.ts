import { beforeEach, describe, expect, it } from 'vitest';
import { fixture } from './fixtures';
import {
  captureUpdate,
  clearDatabase,
  countRows,
  getRecord,
  getSettings,
  initialize,
  listRows,
  mutateRecord,
  prune,
  saveRecords,
  updateSettings,
} from '../src/storage/repository';
describe('IndexedDB repository integration', () => {
  beforeEach(async () => {
    await clearDatabase();
  });
  it('initializes durable state and separates bodies from summaries', async () => {
    await initialize();
    await saveRecords([fixture()]);
    expect(await countRows({ tabId: 7 })).toBe(1);
    expect((await listRows())[0]!.request.body!.text).toBeUndefined();
    expect((await getRecord('test-1'))!.request.body!.text).toContain('Mihir');
    await updateSettings({ recording: true });
    expect((await getSettings()).recording).toBe(true);
  });
  it('keeps concurrent metadata and replay edits atomic', async () => {
    await saveRecords([fixture()]);
    await Promise.all([
      mutateRecord('test-1', (r) => ({ ...r, tags: [...r.tags, 'new'] })),
      mutateRecord('test-1', (r) => ({ ...r, isFavorite: true })),
    ]);
    expect(await getRecord('test-1')).toMatchObject({ tags: ['auth', 'new'], isFavorite: true });
  });
  it('keeps redirect hops and associates subsequent events with the new hop', async () => {
    await captureUpdate('key', () => fixture());
    await captureUpdate('key', () => fixture({ id: 'hop-2' }));
    await captureUpdate('key', (r) => r && { ...r, notes: 'finished' });
    expect(await countRows()).toBe(2);
    expect((await getRecord('test-1'))!.notes).toBe('A note');
    expect((await getRecord('hop-2'))!.notes).toBe('finished');
  });
  it('retains saved requests while enforcing age and count limits', async () => {
    await saveRecords([fixture(), fixture({ id: 'saved', isFavorite: true })]);
    expect(await prune({ ...(await getSettings()), retentionDays: 7 })).toBe(1);
    expect(await getRecord('saved')).toBeDefined();
    expect(await countRows()).toBe(1);
  });
  it('handles 1,000, 5,000 and 10,000 indexed summaries without body hydration', async () => {
    const started = performance.now();
    const rows = Array.from({ length: 10000 }, (_, i) =>
      fixture({ id: 'perf-' + i, timestamp: Date.now() + i }),
    );
    await saveRecords(rows);
    for (const count of [1000, 5000, 10000]) {
      const results = (await listRows({ sessionId: 'initial' })).slice(0, count);
      expect(results).toHaveLength(count);
      expect(results.every((r) => r.response?.body?.text === undefined)).toBe(true);
    }
    expect(await countRows()).toBe(10000);
    expect(performance.now() - started).toBeLessThan(15000);
  }, 20000);
});
