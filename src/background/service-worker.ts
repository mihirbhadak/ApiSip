import { CaptureWriter } from './capture-writer';
import { DebuggerProvider } from '../capture/providers/debugger';
import { WebRequestProvider } from '../capture/providers/web-request';
import type { CaptureContext } from '../capture/types';
import { uid, type Diagnostic, type Settings } from '../shared/model';
import { commandSchema, type Envelope, type Replies } from '../shared/messages';
import {
  countRows,
  deleteRecords,
  getRecord,
  getSettings,
  initialize,
  interruptTab,
  listRows,
  mutateRecord,
  prune,
  updateSettings,
} from '../storage/repository';
import { compileFilter, needsBody } from '../filters/engine';
import { parseFilter } from '../filters/parser';
import { executeReplay } from '../replay/executor';
import { Badge } from './badge';

const diagnostics: Diagnostic[] = [];
let notificationTimer: ReturnType<typeof setTimeout> | undefined;
function report(message: string, level: Diagnostic['level'] = 'info') {
  diagnostics.push({ timestamp: Date.now(), message, level });
  if (diagnostics.length > 40) diagnostics.shift();
  notify();
}
function notify() {
  badge.schedule();
  if (notificationTimer) return;
  notificationTimer = setTimeout(
    () => {
      notificationTimer = undefined;
      void chrome.runtime.sendMessage({ type: 'database-changed' }).catch(() => {
        /* No inspector is open. */
      });
    },
    captureWriter.diagnostics.pendingWrites > 200 ? 1000 : 200,
  );
}
const ready = initialize();
const captureWriter = new CaptureWriter();
const epoch = chrome.storage.session.get('epoch').then(async (result) => {
  if (typeof result.epoch === 'string') return result.epoch;
  const value = uid();
  await chrome.storage.session.set({ epoch: value });
  return value;
});
const settings = async () => {
  await ready;
  return getSettings();
};
const context: CaptureContext = {
  settings,
  epoch,
  report,
  accepts: async (tabId) => {
    const s = await settings();
    return tabId >= 0 && s.recording && (s.scope === 'all' || s.activeTabId === tabId);
  },
  enqueue: (key, change) => {
    void context
      .update(key, change)
      .catch(() =>
        report('Capture event could not be stored. Check available local storage.', 'error'),
      );
  },
  update: async (key, change) => {
    await ready;
    const record = await captureWriter.update(key, change);
    if (record) notify();
    return record;
  },
};
const debuggerProvider = new DebuggerProvider(context);
const webRequestProvider = new WebRequestProvider(context, (id) =>
  debuggerProvider.attached.has(id),
);
const badge = new Badge(settings, (message) => report(message, 'error'));
// MV3 listeners must be registered before asynchronous initialization resolves.
webRequestProvider.register();
debuggerProvider.register();

async function reconcile(s?: Settings) {
  await debuggerProvider.reconcile(s ?? (await settings()));
  notify();
}
async function activeTab(id: number) {
  try {
    const tab = await chrome.tabs.get(id);
    if (!/^https?:/.test(tab.url ?? '')) {
      badge.schedule();
      return;
    }
    const s = await updateSettings({ activeTabId: id, activePageUrl: tab.url });
    await reconcile(s);
  } catch {
    report('The selected tab closed before capture could follow it.');
  }
}
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void ready
    .then(() => activeTab(tabId))
    .catch(() => report('Could not restore the current tab.', 'error'));
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void ready
    .then(async () => {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab?.id !== undefined) await activeTab(tab.id);
    })
    .catch(() => report('Could not follow the focused browser window.'));
});
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (!change.url && change.status !== 'loading') return;
  void (async () => {
    const s = await settings();
    if (tab.active && s.activeTabId !== id && /^https?:/.test(change.url ?? tab.url ?? ''))
      await activeTab(id);
    if (change.url && s.activeTabId === id) await updateSettings({ activePageUrl: change.url });
    if (change.status === 'loading' && s.resetOnNavigation) {
      const rows = await listRows({ tabId: id });
      await deleteRecords(
        rows
          .filter(
            (r) =>
              !r.isFavorite && !r.isPinned && !r.collectionId && r.metadata.state !== 'pending',
          )
          .map((r) => r.id),
      );
    }
    await reconcile();
  })().catch(() => report('Could not update capture after navigation.', 'error'));
});
chrome.tabs.onRemoved.addListener((id) => {
  void (async () => {
    await interruptTab(id, 'Source tab closed before Chrome exposed a completion event.');
    const s = await settings();
    if (s.activeTabId === id) {
      await updateSettings({ activeTabId: undefined, activePageUrl: undefined });
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id !== undefined) await activeTab(tab.id);
    }
    await reconcile();
  })().catch(() => report('Could not update capture after a tab closed.', 'error'));
});
chrome.action.onClicked.addListener((tab) => {
  void (async () => {
    await ready;
    if (tab.id !== undefined && /^https?:/.test(tab.url ?? '')) await activeTab(tab.id);
    const background = chrome.runtime.getManifest().background;
    const workerPath =
      background && 'service_worker' in background
        ? background.service_worker
        : 'service-worker.js';
    const url = chrome.runtime.getURL(workerPath.replace(/[^/]+$/, 'inspector.html'));
    const pages = await chrome.tabs.query({ url });
    if (pages[0]?.id !== undefined) {
      await chrome.tabs.update(pages[0].id, { active: true });
      if (pages[0].windowId !== undefined)
        await chrome.windows.update(pages[0].windowId, { focused: true });
    } else await chrome.tabs.create({ url });
  })().catch(() => report('Could not open the inspector.', 'error'));
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'retention') return;
  void settings()
    .then(prune)
    .then(notify)
    .catch(() => report('Retention cleanup could not finish. Check available storage.', 'error'));
});
chrome.permissions.onAdded.addListener(() => {
  webRequestProvider.register();
  void reconcile().catch(() =>
    report('Could not refresh capture after granting site access.', 'error'),
  );
});
chrome.permissions.onRemoved.addListener(() => {
  void (async () => {
    if (!(await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] }))) {
      await updateSettings({ recording: false });
      report('Site access was removed. Capture is paused.', 'error');
    }
    await reconcile();
  })().catch(() => report('Could not refresh permission state.', 'error'));
});
chrome.runtime.onStartup.addListener(() => {
  void reconcile().catch(() => report('Could not restore capture on startup.', 'error'));
});

const replaying = new Set<string>();
chrome.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  const parsed = commandSchema.safeParse(raw);
  if (!parsed.success) return;
  const cmd = parsed.data;
  const run = async (): Promise<Replies[keyof Replies]> => {
    await ready;
    if (cmd.type === 'state') {
      const s = await settings();
      const [count, tabCount, sessionCount, hostsGranted] = await Promise.all([
        countRows(),
        s.activeTabId === undefined ? 0 : countRows({ tabId: s.activeTabId }),
        countRows({ sessionId: s.sessionId }),
        chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] }),
      ]);
      return {
        buildId: __BUILD_ID__,
        captureQueue: captureWriter.diagnostics,
        settings: s,
        count,
        tabCount,
        sessionCount,
        attachedTabs: [...debuggerProvider.attached],
        diagnostics: [...diagnostics],
        hostsGranted,
      };
    }
    if (cmd.type === 'settings') {
      if (cmd.patch.badgeFilter !== undefined) {
        const ast = parseFilter(cmd.patch.badgeFilter);
        compileFilter(ast);
        if (needsBody(ast)) throw new Error('Badge filters support metadata only.');
      }
      if (
        cmd.patch.recording &&
        !(await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] }))
      )
        throw new Error('Grant site access before starting capture.');
      if (cmd.patch.recording) webRequestProvider.register();
      let s = await updateSettings(cmd.patch);
      if (s.recording && s.activeTabId === undefined) {
        const tabs = (await chrome.tabs.query({})).filter(
          (tab) => tab.id !== undefined && /^https?:/.test(tab.url ?? ''),
        );
        const target =
          tabs.find((tab) => tab.active) ??
          tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
        if (target?.id !== undefined)
          s = await updateSettings({ activeTabId: target.id, activePageUrl: target.url });
        else report('No supported web tab is available. Open a web page to begin capturing.');
      }
      await reconcile(s);
      return s;
    }
    if (cmd.type === 'retry-debugger') {
      debuggerProvider.retry();
      await reconcile();
      return null;
    }
    if (cmd.type === 'changed') {
      await reconcile();
      return null;
    }
    if (replaying.has(cmd.id)) throw new Error('This request is already being replayed.');
    if (replaying.size >= 4)
      throw new Error('Four replays are already running. Wait for one to finish.');
    const original = await getRecord(cmd.id);
    if (!original) throw new Error('The selected request was deleted.');
    replaying.add(cmd.id);
    try {
      const s = await settings(),
        result = await executeReplay(original, cmd.request, cmd.context, s.maxBodyBytes);
      await mutateRecord(cmd.id, (r) => ({
        ...r,
        replayHistory: [...(r.replayHistory ?? []), result].slice(-30),
      }));
      notify();
      return result;
    } finally {
      replaying.delete(cmd.id);
    }
  };
  void run()
    .then((data) => respond({ ok: true, data } satisfies Envelope<unknown>))
    .catch((error: unknown) =>
      respond({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'The operation failed. Check permissions and available storage.',
      } satisfies Envelope<unknown>),
    );
  return true;
});
void ready
  .then(async () => {
    await chrome.alarms.create('retention', { periodInMinutes: 5 });
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id !== undefined && /^https?:/.test(tab.url ?? '')) await activeTab(tab.id);
    else await reconcile();
  })
  .catch(() =>
    report(
      'Local storage initialization failed. Capture is unavailable until storage access is restored.',
      'error',
    ),
  );
