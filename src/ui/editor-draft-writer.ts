import type { EditorDraft } from '../shared/editor';
import type { RequestData, Settings } from '../shared/model';
import { updateDraft } from '../storage/drafts';

/** Coalesce keystrokes, serialize commits, and reject edits based on a stale revision. */
export class EditorDraftWriter {
  private next: { request: RequestData; context: Settings['replayContext'] } | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private failure: unknown;
  constructor(
    private draft: EditorDraft,
    private status: (message: string, failed?: boolean) => void,
  ) {}
  get dirty() {
    return !!this.next || !!this.running;
  }
  change(request: RequestData, context: Settings['replayContext']) {
    this.next = { request, context };
    clearTimeout(this.timer);
    if (this.failure) return;
    this.status('Unsaved changes');
    this.timer = setTimeout(() => {
      void this.flush().catch(() => undefined);
    }, 250);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.failure) throw this.failure;
    if (this.running) {
      await this.running;
      if (this.next) await this.flush();
      return;
    }
    if (!this.next) return;
    this.status('Saving draft...');
    this.running = (async () => {
      while (this.next) {
        const next = this.next;
        this.next = undefined;
        try {
          this.draft = await updateDraft(
            this.draft.id,
            this.draft.revision,
            next.request,
            next.context,
          );
        } catch (error) {
          this.next ??= next;
          this.failure = error;
          this.status(
            error instanceof Error
              ? error.message
              : 'Draft could not be saved. Check available storage.',
            true,
          );
          throw error;
        }
      }
      this.status('Draft saved locally');
    })();
    try {
      await this.running;
    } finally {
      this.running = undefined;
    }
  }
  dispose() {
    clearTimeout(this.timer);
    this.status = () => undefined;
    void this.flush().catch(() => undefined);
  }
  async stop() {
    clearTimeout(this.timer);
    this.next = undefined;
    await this.running?.catch(() => undefined);
    this.failure = new Error('This editor draft is closed.');
  }
}
