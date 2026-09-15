/** Collapse overlapping refreshes to one active read and one trailing refresh. */
export class CoalescedTask {
  private active?: Promise<void>;
  private dirty = false;
  constructor(private task: () => Promise<void>) {}
  run(): Promise<void> {
    this.dirty = true;
    this.active ??= this.drain().finally(() => {
      this.active = undefined;
    });
    return this.active;
  }
  private async drain() {
    while (this.dirty) {
      this.dirty = false;
      await this.task();
    }
  }
}
