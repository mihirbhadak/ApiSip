export interface SearchJob {
  revision: number;
  scope: { workspaceId?: string; sessionId?: string };
  search: string;
  expression: string;
}
/** New queries preempt old queries; live data changes queue one refresh without starving visible results. */
export class SearchScheduler {
  private latest = 0;
  private active?: SearchJob;
  private pending?: SearchJob;
  constructor(private dispatch: (job: SearchJob) => void) {}
  private key(job: SearchJob) {
    return JSON.stringify([job.scope, job.search, job.expression]);
  }
  request(input: Omit<SearchJob, 'revision'>) {
    const job = { ...input, revision: ++this.latest };
    if (this.active && this.key(this.active) === this.key(job)) {
      this.pending = job;
      return;
    }
    this.pending = undefined;
    this.active = job;
    this.dispatch(job);
  }
  complete(revision: number, accept: () => void) {
    if (this.active?.revision !== revision) return;
    accept();
    this.active = undefined;
    if (this.pending) {
      const next = this.pending;
      this.pending = undefined;
      this.active = next;
      this.dispatch(next);
    }
  }
}
