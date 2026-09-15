import { captureBatch, type CaptureMutation } from '../storage/repository';
import type { CapturedRequest } from '../shared/model';
type Pending = CaptureMutation & {
  resolve: (record?: CapturedRequest) => void;
  reject: (error: unknown) => void;
};
/** Coalesce independent capture events into short durable transactions; never acknowledge before commit. */
export class CaptureWriter {
  private queue: Pending[] = [];
  private running = false;
  private activeBatch = 0;
  private largestQueue = 0;
  get diagnostics() {
    return { pendingWrites: this.queue.length + this.activeBatch, largestQueue: this.largestQueue };
  }
  private timer?: ReturnType<typeof setTimeout>;
  update(key: string, change: CaptureMutation['change']): Promise<CapturedRequest | undefined> {
    const promise = new Promise<CapturedRequest | undefined>((resolve, reject) =>
      this.queue.push({ key, change, resolve, reject }),
    );
    this.largestQueue = Math.max(this.largestQueue, this.queue.length);
    if (!this.running && !this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush();
      }, 8);
    return promise;
  }
  private async flush() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        // Bound transactions by independent requests, not by the number of lifecycle events.
        // Pull all queued mutations for those keys so interleaved fast requests commit once.
        const keys = new Set<string>();
        for (const item of this.queue) {
          keys.add(item.key);
          if (keys.size === 100) break;
        }
        const batch: Pending[] = [],
          remaining: Pending[] = [];
        for (const item of this.queue) (keys.has(item.key) ? batch : remaining).push(item);
        this.queue = remaining;
        this.activeBatch = batch.length;
        try {
          const results = await captureBatch(batch);
          batch.forEach((item, i) => item.resolve(results[i]));
        } catch (error) {
          batch.forEach((item) => item.reject(error));
        }
      }
    } finally {
      this.activeBatch = 0;
      this.running = false;
    }
  }
}
