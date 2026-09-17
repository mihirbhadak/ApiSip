import type { Settings } from '../shared/model';
import { hasCaptureAccess } from '../shared/permissions';
import { listEntities, updateSettings } from '../storage/repository';
import { compileFilter, needsBody } from '../filters/engine';
import { parseFilter } from '../filters/parser';

/** The UI and browser command use the same serialized, authoritative recording state. */
export class CaptureControl {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    private settings: () => Promise<Settings>,
    private reconcile: (settings: Settings) => Promise<void>,
    private report: (message: string) => void,
  ) {}
  change(
    patch: Partial<Settings> | ((settings: Settings) => Partial<Settings>),
  ): Promise<Settings> {
    const result = this.pending
      .catch(() => {})
      .then(async () => {
        const current = await this.settings();
        const next = typeof patch === 'function' ? patch(current) : patch;
        if (next.badgeFilter !== undefined) {
          const ast = parseFilter(next.badgeFilter);
          compileFilter(ast);
          if (needsBody(ast)) throw new Error('Badge filters support metadata only.');
        }
        if (next.recording) {
          if (!(await hasCaptureAccess()))
            throw new Error('Grant site access before starting capture.');
          const sessionId = next.sessionId ?? current.sessionId;
          if ((await listEntities()).find((entity) => entity.id === sessionId)?.archived)
            throw new Error('Create or select an unarchived session before recording.');
        }
        let settings = await updateSettings(next);
        if (settings.recording) {
          const tabs = (await chrome.tabs.query({})).filter(
            (tab) => tab.id !== undefined && /^https?:/.test(tab.url ?? ''),
          );
          const target =
            tabs.find((tab) => tab.id === settings.activeTabId) ??
            tabs.find((tab) => tab.active) ??
            tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
          if (target?.id !== undefined && target.id !== settings.activeTabId)
            settings = await updateSettings({ activeTabId: target.id, activePageUrl: target.url });
          else if (!target)
            this.report('No supported web tab is available. Open a web page to begin capturing.');
        }
        await this.reconcile(settings);
        return settings;
      });
    this.pending = result;
    return result;
  }
  toggle(tab?: chrome.tabs.Tab) {
    return this.change((settings) => ({
      recording: !settings.recording,
      ...(tab?.id !== undefined && /^https?:/.test(tab.url ?? '')
        ? { activeTabId: tab.id, activePageUrl: tab.url }
        : {}),
    }));
  }
}
