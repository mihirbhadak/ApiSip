import { beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useManagement } from '../src/ui/use-management';
import {
  clearDatabase,
  getSettings,
  listEntities,
  listRows,
  saveRecords,
  updateSettings,
} from '../src/storage/repository';
import { fixture } from './fixtures';

beforeEach(clearDatabase);
async function manager() {
  await updateSettings({ recording: true, provider: 'debugger' });
  const settings = await getSettings();
  const update = vi.fn(async (patch) => {
    await updateSettings(patch);
  });
  const hook = renderHook(() =>
    useManagement({
      settings,
      entities: [],
      updateSettings: update,
      changed: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      notify: vi.fn(),
    }),
  );
  return { ...hook, update };
}

it.each(['Current session', 'Current workspace', 'All captured requests', 'All stored data'])(
  'keeps recording enabled when clearing %s',
  async (scope) => {
    const { result, update } = await manager();
    await saveRecords([fixture()]);
    act(() => result.current.clear(scope));
    await act(() => result.current.confirmation!.action());
    expect((await getSettings()).recording).toBe(true);
    expect((await listRows()).length).toBe(0);
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ recording: false }));
  },
);

it.each(['workspace', 'session'])(
  'switches to a valid capture destination when deleting the active %s',
  async (kind) => {
    const { result, update } = await manager();
    const entity = (await listEntities()).find((item) => item.kind === kind)!;
    act(() => result.current.remove(entity));
    await act(() => result.current.confirmation!.action());
    const settings = await getSettings();
    const remaining = await listEntities();
    expect(settings.recording).toBe(true);
    expect(remaining.some((item) => item.id === settings.sessionId)).toBe(true);
    expect(remaining.some((item) => item.id === settings.workspaceId)).toBe(true);
    expect(remaining.some((item) => item.id === entity.id)).toBe(false);
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ recording: false }));
  },
);
