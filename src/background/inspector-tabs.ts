import { extensionPath } from '../shared/extension-path';
const opening = new Map<string, Promise<void>>();

/** Discover our own documents without requiring the broad tabs permission. */
function openView(hash: string): Promise<void> {
  const pending = opening.get(hash);
  if (pending) return pending;
  const task = (async () => {
    const url = chrome.runtime.getURL(extensionPath('inspector.html')) + hash;
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
    opening.delete(hash);
  });
  opening.set(hash, task);
  return task;
}
export const openInspector = () => openView('');
export const openSetup = () => openView('#/setup');
