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
  private timer?: ReturnType<typeof setTimeout>;
  update(key: string, change: CaptureMutation['change']): Promise<CapturedRequest | undefined> {
    const promise = new Promise<CapturedRequest | undefined>((resolve, reject) =>
      this.queue.push({ key, change, resolve, reject }),
    );
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
        const batch = this.queue.splice(0, 100);
        try {
          const results = await captureBatch(batch);
          batch.forEach((item, i) => item.resolve(results[i]));
        } catch (error) {
          batch.forEach((item) => item.reject(error));
        }
      }
    } finally {
      this.running = false;
    }
  }
}
