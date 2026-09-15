import { expect, it, vi } from 'vitest';
import { CoalescedTask } from '../src/shared/coalesced-task';
it('coalesces a burst of refresh requests without concurrent reads or losing the trailing change', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let active = 0,
    peak = 0;
  const work = vi.fn(async () => {
    peak = Math.max(peak, ++active);
    await blocked;
    active--;
  });
  const task = new CoalescedTask(work);
  const results = Array.from({ length: 50 }, () => task.run());
  expect(work).toHaveBeenCalledTimes(1);
  release();
  await Promise.all(results);
  expect(work).toHaveBeenCalledTimes(2);
  expect(peak).toBe(1);
  await task.run();
  expect(work).toHaveBeenCalledTimes(3);
});
it('can recover after a refresh fails', async () => {
  const work = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  const task = new CoalescedTask(work);
  await expect(task.run()).rejects.toThrow('offline');
  await expect(task.run()).resolves.toBeUndefined();
  expect(work).toHaveBeenCalledTimes(2);
});
