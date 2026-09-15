let opening: Promise<void> | undefined;

/** Discover our own documents without requiring the broad tabs permission. */
export function openInspector(): Promise<void> {
  if (opening) return opening;
  opening = (async () => {
    const background = chrome.runtime.getManifest().background;
    const workerPath =
      background && 'service_worker' in background
        ? background.service_worker
        : 'service-worker.js';
    const url = chrome.runtime.getURL(workerPath.replace(/[^/]+$/, 'inspector.html'));
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.TAB],
    });
    const existing = contexts.find(
      (context) =>
        context.frameId === 0 &&
        context.tabId >= 0 &&
        (context.documentUrl === url || context.documentUrl === url + '#'),
    );
    if (existing) {
      await chrome.tabs.update(existing.tabId, { active: true });
      if (existing.windowId >= 0) await chrome.windows.update(existing.windowId, { focused: true });
    } else await chrome.tabs.create({ url });
  })().finally(() => {
    opening = undefined;
  });
  return opening;
}
