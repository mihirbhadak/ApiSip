import { parseRelease, updateStatusSchema, type UpdateStatus } from '../shared/updates';
import type { Settings } from '../shared/model';

const key = 'releaseUpdates';
const day = 86400000;
const endpoint = 'https://api.github.com/repos/mihirbhadak/ApiSip/releases/latest';

export class UpdateChecker {
  private pending?: Promise<UpdateStatus>;
  constructor(
    private settings: () => Promise<Settings>,
    private notify: () => void,
  ) {}
  async status(): Promise<UpdateStatus> {
    const parsed = updateStatusSchema.safeParse((await chrome.storage.local.get(key))[key] ?? {});
    return parsed.success ? parsed.data : {};
  }
  async dismiss(version: string) {
    const status = await this.status();
    if (status.latest?.version === version) {
      await chrome.storage.local.set({ [key]: { ...status, dismissedVersion: version } });
      this.notify();
    }
    return this.status();
  }
  check(manual = false): Promise<UpdateStatus> {
    if (this.pending) return this.pending;
    this.pending = this.run(manual).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async run(manual: boolean) {
    const previous = await this.status();
    if (
      !manual &&
      (!(await this.settings()).checkForUpdates || Date.now() - (previous.checkedAt ?? 0) < day)
    )
      return previous;
    const checkedAt = Date.now();
    // Record an attempt before the request, so worker interruption cannot create a retry loop.
    await chrome.storage.local.set({ [key]: { ...previous, checkedAt } });
    let next: UpdateStatus;
    try {
      const response = await fetch(endpoint, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-cache',
        signal: AbortSignal.timeout(10000),
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) throw new Error('Release check unavailable');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Empty release response');
      let bytes = 0,
        text = '';
      const decoder = new TextDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 131072) throw new Error('Release response too large');
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      next = { ...previous, checkedAt, latest: parseRelease(JSON.parse(text)), error: undefined };
    } catch {
      next = {
        ...previous,
        checkedAt,
        error: 'Could not check GitHub for updates. Try again later; capture still works offline.',
      };
    }
    // A visitor may dismiss the current notice while the network request is in progress.
    next.dismissedVersion = (await this.status()).dismissedVersion;
    await chrome.storage.local.set({ [key]: next });
    this.notify();
    return next;
  }
}
