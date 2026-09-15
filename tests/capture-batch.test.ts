import { beforeEach, describe, expect, it } from 'vitest';
import { CaptureWriter } from '../src/background/capture-writer';
import {
  captureBatch,
  clearDatabase,
  countRows,
  getRecord,
  listEntities,
} from '../src/storage/repository';
import { fixture } from './fixtures';
describe('durable capture batching', () => {
  beforeEach(clearDatabase);
  it('acknowledges simultaneous captures only after their data is readable', async () => {
    const writer = new CaptureWriter();
    await Promise.all(
      Array.from({ length: 250 }, (_, i) =>
        writer.update('request-' + i, () => fixture({ id: 'request-' + i })),
      ),
    );
    expect(await countRows()).toBe(250);
    expect((await getRecord('request-249'))!.response!.body!.text).toContain('Mihir');
  });
  it('preserves event order for updates sharing a capture key', async () => {
    await captureBatch([
      { key: 'same', change: () => fixture() },
      { key: 'same', change: (r) => r && { ...r, notes: 'Finished' } },
    ]);
    expect(await countRows()).toBe(1);
    expect((await getRecord('test-1'))!.notes).toBe('Finished');
  });
  it('retains all session tabs and redirect hops when a batch updates shared entities', async () => {
    await captureBatch([
      { key: 'hop', change: () => fixture({ id: 'first', tabId: 1 }) },
      { key: 'hop', change: () => fixture({ id: 'redirect', tabId: 1 }) },
      { key: 'hop', change: (r) => r && { ...r, notes: 'Final hop' } },
      { key: 'second', change: () => fixture({ id: 'second', tabId: 2 }) },
    ]);
    expect(await countRows()).toBe(3);
    expect((await getRecord('first'))?.id).toBe('first');
    expect((await getRecord('redirect'))?.notes).toBe('Final hop');
    expect((await listEntities()).find((e) => e.id === fixture().sessionId)?.tabIds).toEqual([
      1, 2,
    ]);
    await captureBatch([{ key: 'hop', change: (r) => r && { ...r, notes: 'Later event' } }]);
    expect((await getRecord('redirect'))?.notes).toBe('Later event');
    expect((await getRecord('first'))?.notes).not.toBe('Later event');
  });
  it('rolls back the entire batch when a mutation is invalid', async () => {
    await expect(
      captureBatch([
        { key: 'good', change: () => fixture() },
        {
          key: 'bad',
          change: () => ({
            ...fixture({ id: 'bad' }),
            request: { ...fixture().request, url: 'invalid' },
          }),
        },
      ]),
    ).rejects.toThrow();
    expect(await countRows()).toBe(0);
  });
});
