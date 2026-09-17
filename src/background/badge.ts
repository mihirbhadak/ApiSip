import { CoalescedTask } from '../shared/coalesced-task';
import { countRows, listRows } from '../storage/repository';
import { compileFilter, needsBody } from '../filters/engine';
import { parseFilter } from '../filters/parser';
import type { Settings } from '../shared/model';
import { extensionPath } from '../shared/extension-path';
export const badgeText = (count: number) => (count > 999 ? '999+' : String(count));
export class Badge {
  private refresh = new CoalescedTask(() =>
    this.update().catch(() => this.report('Could not update the extension badge.')),
  );
  private timer?: ReturnType<typeof setTimeout>;
  private iconRecording?: boolean;
  constructor(
    private settings: () => Promise<Settings>,
    private report: (message: string) => void,
  ) {}
  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh.run();
    }, 150);
  }
  async update() {
    const s = await this.settings();
    let count = 0;
    if (s.badge === 'tab')
      count = s.activeTabId === undefined ? 0 : await countRows({ tabId: s.activeTabId });
    else if (s.badge === 'session') count = await countRows({ sessionId: s.sessionId });
    else if (s.badge === 'all') count = await countRows();
    else {
      const ast = parseFilter(s.badgeFilter);
      if (needsBody(ast)) throw new Error('Body filters are unavailable for badge counts.');
      count = (await listRows({ sessionId: s.sessionId })).filter(compileFilter(ast)).length;
    }
    await chrome.action.setBadgeText({ text: badgeText(count) });
    await chrome.action.setBadgeBackgroundColor({ color: s.recording ? '#0d766e' : '#64748b' });
    if (this.iconRecording !== s.recording) {
      await chrome.action.setIcon({
        path: Object.fromEntries(
          [16, 32, 48, 128].map((size) => [
            size,
            extensionPath(`icons/${s.recording ? '' : 'paused/'}${size}.png`),
          ]),
        ),
      });
      this.iconRecording = s.recording;
    }
    await chrome.action.setTitle({
      title: 'ApiSip · ' + count + ' requests · ' + (s.recording ? 'Recording' : 'Paused'),
    });
  }
}
