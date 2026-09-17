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
import { executeReplay } from '../replay/executor';
import { Badge } from './badge';
import { openInspector, openSetup } from './inspector-tabs';
import { startRun, runnerStatus, stopRun, releaseRunner, stopOrphanedRun } from './runner';
import { hasCaptureAccess } from '../shared/permissions';
import { CaptureControl } from './capture-control';
import { UpdateChecker } from './updates';

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
// The optional API namespace allows synchronous registration after capture access
// has been granted, without registering invalid listeners on a fresh installation.
webRequestProvider.register();
debuggerProvider.register();

async function reconcile(s?: Settings) {
  await webRequestProvider.reconcile();
  await debuggerProvider.reconcile(s ?? (await settings()));
  notify();
}
const captureControl = new CaptureControl(settings, reconcile, report);
const updater = new UpdateChecker(settings, () => {
  void chrome.runtime.sendMessage({ type: 'update-changed' }).catch(() => {});
});
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
        true,
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
    await openInspector();
  })().catch(() => report('Could not open the inspector.', 'error'));
});
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install')
    void openSetup().catch(() => report('Open ApiSip to review website access.', 'error'));
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-recording') return;
  void (async () => {
    await ready;
    if (!(await hasCaptureAccess())) {
      await openSetup();
      return;
    }
    await captureControl.toggle(tab);
  })().catch((error: unknown) =>
    report(error instanceof Error ? error.message : 'Could not change recording state.', 'error'),
  );
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'updates') {
    void updater.check().catch(() => report('Update check could not access local preferences.'));
    return;
  }
  if (alarm.name !== 'retention') return;
  void settings()
    .then(prune)
    .then(notify)
    .catch(() => report('Retention cleanup could not finish. Check available storage.', 'error'));
});
chrome.permissions.onAdded.addListener(() => {
  void reconcile().catch(() =>
    report('Could not refresh capture after granting site access.', 'error'),
  );
});
chrome.permissions.onRemoved.addListener(() => {
  void (async () => {
    await stopRun('Site access changed. Run stopped; grant access before starting again.');
    if (!(await hasCaptureAccess())) {
      await captureControl.change({ recording: false });
      // Keep the optional API and its hosts paired for the next cold worker start.
      await chrome.permissions.remove({ permissions: ['webRequest'] });
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
    if (cmd.type === 'update-status') return updater.status();
    if (cmd.type === 'check-updates') return updater.check(true);
    if (cmd.type === 'dismiss-update') return updater.dismiss(cmd.version);
    if (cmd.type === 'runner-start') return startRun(cmd.plan);
    if (cmd.type === 'runner-status') return runnerStatus();
    if (cmd.type === 'runner-stop') return stopRun();
    if (cmd.type === 'runner-release') {
      await releaseRunner();
      return null;
    }
    if (cmd.type === 'open-inspector') {
      await openInspector();
      return null;
    }
    if (cmd.type === 'state') {
      const s = await settings();
      const [count, tabCount, sessionCount, hostsGranted] = await Promise.all([
        countRows(),
        s.activeTabId === undefined ? 0 : countRows({ tabId: s.activeTabId }),
        countRows({ sessionId: s.sessionId }),
        hasCaptureAccess(),
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
        passiveReady: webRequestProvider.subscribed,
      };
    }
    if (cmd.type === 'settings') return captureControl.change(cmd.patch);
    if (cmd.type === 'toggle-capture') return captureControl.toggle();
    if (cmd.type === 'retry-debugger') {
      debuggerProvider.retry();
      await reconcile();
      return null;
    }
    if (cmd.type === 'changed') {
      await stopOrphanedRun();
      await captureControl.change({});
      return null;
    }
    if (replaying.has(cmd.id)) throw new Error('This request is already being replayed.');
    if (replaying.size >= 4)
      throw new Error('Four replays are already running. Wait for one to finish.');
    replaying.add(cmd.id);
    try {
      const original = await getRecord(cmd.id);
      if (!original) throw new Error('The selected request was deleted.');
      const s = await settings(),
        result = await executeReplay(
          original,
          cmd.request,
          cmd.context,
          s.maxBodyBytes,
          cmd.cookies,
        );
      await mutateRecord(cmd.id, (r) => ({
        ...r,
        replayHistory: [...(r.replayHistory ?? []), result].slice(-30),
      }));
      void chrome.runtime.sendMessage({ type: 'replay-complete', id: cmd.id }).catch(() => {
        /* No editor is open. */
      });
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
    await chrome.alarms.create('updates', { periodInMinutes: 24 * 60 });
    void updater.check().catch(() => report('Update check could not access local preferences.'));
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id !== undefined && /^https?:/.test(tab.url ?? '')) await activeTab(tab.id);
    else await captureControl.change({});
  })
  .catch(() =>
    report(
      'Local storage initialization failed. Capture is unavailable until storage access is restored.',
      'error',
    ),
  );
