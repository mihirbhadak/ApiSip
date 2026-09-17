import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WebRequestProvider } from '../src/capture/providers/web-request';
import type { CaptureContext } from '../src/capture/types';
import { CaptureControl } from '../src/background/capture-control';
import { Badge } from '../src/background/badge';
import { defaultSettings } from '../src/shared/model';
import { clearDatabase, getSettings, listEntities, saveEntity } from '../src/storage/repository';

afterEach(() => vi.unstubAllGlobals());
beforeEach(clearDatabase);

function passiveHarness() {
  const contains = vi.fn().mockResolvedValue(false);
  const events = Array.from({ length: 6 }, () => ({
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
  vi.stubGlobal('chrome', {
    permissions: { contains },
    webRequest: Object.fromEntries(
      [
        'onBeforeRequest',
        'onBeforeSendHeaders',
        'onHeadersReceived',
        'onCompleted',
        'onBeforeRedirect',
        'onErrorOccurred',
      ].map((name, index) => [name, events[index]]),
    ),
  });
  const context: CaptureContext = {
    settings: async () => defaultSettings,
    accepts: async () => true,
    update: vi.fn(),
    enqueue: vi.fn(),
    report: vi.fn(),
    epoch: Promise.resolve('epoch'),
  };
  return { contains, events, context, provider: new WebRequestProvider(context, () => false) };
}

it('never subscribes before host permission approval and detaches after revocation', async () => {
  const { provider, contains, events } = passiveHarness();
  await provider.reconcile();
  expect(provider.subscribed).toBe(false);
  for (const event of events) expect(event.addListener).not.toHaveBeenCalled();
  contains.mockResolvedValue(true);
  await Promise.all([provider.reconcile(), provider.reconcile(), provider.reconcile()]);
  expect(provider.subscribed).toBe(true);
  for (const event of events) expect(event.addListener).toHaveBeenCalledTimes(1);
  contains.mockResolvedValue(false);
  await provider.reconcile();
  expect(provider.subscribed).toBe(false);
  for (const event of events) expect(event.removeListener).toHaveBeenCalledTimes(1);
  contains.mockResolvedValue(true);
  await provider.reconcile();
  for (const event of events) expect(event.addListener).toHaveBeenCalledTimes(2);
});

it('registers synchronously after optional API approval so a cold worker can receive its wake event', async () => {
  const { provider, contains, events } = passiveHarness();
  contains.mockResolvedValue(true);
  provider.register();
  for (const event of events) expect(event.addListener).toHaveBeenCalledTimes(1);
  await provider.reconcile();
  for (const event of events) expect(event.addListener).toHaveBeenCalledTimes(1);
});

it('does not touch the absent optional API on a fresh installation', async () => {
  const { provider, events } = passiveHarness();
  Object.defineProperty(chrome, 'webRequest', { value: undefined, configurable: true });
  provider.register();
  await provider.reconcile();
  for (const event of events) expect(event.addListener).not.toHaveBeenCalled();
});

it('repairs an orphaned optional API grant left by legacy upgrades or host revocation', async () => {
  const { provider, contains } = passiveHarness();
  contains.mockImplementation(
    async (permission: chrome.permissions.Permissions) => !permission.origins,
  );
  const remove = vi.fn().mockResolvedValue(true);
  Object.assign(chrome.permissions, { remove });
  await provider.reconcile();
  expect(provider.subscribed).toBe(false);
  expect(remove).toHaveBeenCalledWith({ permissions: ['webRequest'] });
});

it('does not install listeners when the permission check fails and can recover', async () => {
  const { provider, contains, events } = passiveHarness();
  contains.mockRejectedValueOnce(new Error('Chrome unavailable'));
  await expect(provider.reconcile()).rejects.toThrow('Chrome unavailable');
  for (const event of events) expect(event.addListener).not.toHaveBeenCalled();
  contains.mockResolvedValue(true);
  await provider.reconcile();
  expect(provider.subscribed).toBe(true);
});

it('cleans up partial listener registration before retrying', async () => {
  const { provider, contains, events } = passiveHarness();
  contains.mockResolvedValue(true);
  events[1]!.addListener.mockImplementationOnce(() => {
    throw new Error('Access changed');
  });
  await expect(provider.reconcile()).rejects.toThrow('Access changed');
  expect(events[0]!.removeListener).toHaveBeenCalledTimes(1);
  expect(provider.subscribed).toBe(false);
  await provider.reconcile();
  expect(provider.subscribed).toBe(true);
});

it('serializes rapid toggles and validates host access and archived sessions centrally', async () => {
  const contains = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('chrome', {
    permissions: { contains },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 7, url: 'https://example.test/', active: true }]),
    },
  });
  const reconcile = vi.fn().mockResolvedValue(undefined);
  const control = new CaptureControl(getSettings, reconcile, vi.fn());
  const results = await Promise.all([control.toggle(), control.toggle()]);
  expect(results.map((settings) => settings.recording)).toEqual([true, false]);
  expect((await getSettings()).activeTabId).toBe(7);
  contains.mockResolvedValue(false);
  await expect(control.toggle()).rejects.toThrow('Grant site access');
  expect((await getSettings()).recording).toBe(false);
  contains.mockResolvedValue(true);
  const session = (await listEntities()).find((entity) => entity.kind === 'session')!;
  await saveEntity({ ...session, archived: true });
  await expect(control.toggle()).rejects.toThrow('unarchived');
  expect((await getSettings()).recording).toBe(false);
});

it('updates toolbar icon on recording transitions, preserving root-install asset paths', async () => {
  const action = {
    setIcon: vi.fn().mockResolvedValue(undefined),
    setBadgeText: vi.fn().mockResolvedValue(undefined),
    setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    setTitle: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal('chrome', {
    action,
    runtime: { getManifest: () => ({ background: { service_worker: 'dist/service-worker.js' } }) },
  });
  let settings = { ...defaultSettings };
  const badge = new Badge(async () => settings, vi.fn());
  await badge.update();
  expect(action.setIcon).toHaveBeenLastCalledWith({
    path: expect.objectContaining({ 16: 'dist/icons/paused/16.png' }),
  });
  settings = { ...settings, recording: true };
  await badge.update();
  await badge.update();
  expect(action.setIcon).toHaveBeenCalledTimes(2);
  expect(action.setIcon).toHaveBeenLastCalledWith({
    path: expect.objectContaining({ 32: 'dist/icons/32.png' }),
  });
  expect(action.setTitle).toHaveBeenLastCalledWith({ title: expect.stringContaining('Recording') });
  settings = { ...settings, recording: false };
  await badge.update();
  expect(action.setIcon).toHaveBeenCalledTimes(3);
  expect(action.setTitle).toHaveBeenLastCalledWith({ title: expect.stringContaining('Paused') });
});
