import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useLab } from '../src/ui/lab/use-lab';
import * as storage from '../src/storage/lab';
import { clearDatabase } from '../src/storage/repository';
import { newSuite } from '../src/lab/model';

it('locks edits and environment changes while saving the reviewed definition', async () => {
  await clearDatabase();
  const saved = await storage.saveSuite(newSuite('default'));
  const { result } = renderHook(() => useLab(saved.id));
  await waitFor(() => expect(result.current.loading).toBe(false));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const originalSave = storage.saveSuite;
  const writer = vi.spyOn(storage, 'saveSuite').mockImplementationOnce(async (input) => {
    await gate;
    return originalSave(input);
  });
  try {
    let reviewing!: Promise<void>;
    act(() => {
      reviewing = result.current.prepare();
    });
    expect(result.current.locked).toBe(true);
    act(() => {
      result.current.edit({ ...saved, name: 'Unreviewed change' });
      result.current.setEnvironmentId('unreviewed-environment');
      result.current.choose(newSuite('default'));
    });
    expect(result.current.suite?.name).toBe(saved.name);
    expect(result.current.environmentId).toBe('');
    await act(async () => {
      release();
      await reviewing;
    });
    expect(result.current.locked).toBe(false);
    expect(result.current.review?.[0]?.name).toBe(saved.steps[0]!.name);
    expect(result.current.suite?.revision).toBe(2);
    act(() => result.current.edit({ ...result.current.suite!, name: 'Next edit' }));
    expect(result.current.suite?.name).toBe('Next edit');
    expect(result.current.dirty).toBe(true);
    expect(result.current.review).toBeUndefined();
  } finally {
    release();
    writer.mockRestore();
  }
});
