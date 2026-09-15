import { RunAnalytics } from './analytics';
import { dueCount, scheduledTime } from './schedule';
import { compileRunRequest, type PreparedRunRequest } from './templates';
import { measureRequest, type ResponseMeasurement } from './transport';
import { type RunPlan, type RunReport } from './model';

type Transport = (
  request: PreparedRunRequest,
  config: RunPlan['config'],
  signal: AbortSignal,
) => Promise<ResponseMeasurement>;
export class RunEngine {
  readonly analytics: RunAnalytics;
  private controllers = new Set<AbortController>();
  private timer?: ReturnType<typeof setTimeout>;
  private start = 0;
  private offered = 0;
  private lastNotice = -Infinity;
  private expectedWake = 0;
  private consecutiveFailures = 0;
  private resolve?: (report: RunReport) => void;
  private completed = false;
  private render: ReturnType<typeof compileRunRequest>['render'];
  constructor(
    readonly plan: RunPlan,
    readonly report: RunReport,
    private publish: (report: RunReport) => void,
    private transport: Transport = measureRequest,
  ) {
    this.render = compileRunRequest(plan).render;
    this.analytics = new RunAnalytics(report);
  }
  run(): Promise<RunReport> {
    if (this.resolve || this.completed) throw new Error('A run cannot be started twice.');
    this.start = performance.now();
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.tick();
    });
  }
  stop(reason = 'Stopped by user.') {
    if (this.completed || this.report.state === 'stopping') return;
    this.report.state = 'stopping';
    this.report.reason = reason;
    clearTimeout(this.timer);
    for (const controller of this.controllers) controller.abort();
    this.notify(true);
    if (!this.controllers.size) this.finish();
  }
  private elapsed() {
    return Math.max(0, performance.now() - this.start);
  }
  private notify(force = false) {
    const elapsed = this.elapsed();
    if (force || elapsed - this.lastNotice >= 500) {
      this.lastNotice = elapsed;
      this.publish(this.analytics.snapshot(elapsed));
    }
  }
  private finish() {
    if (this.completed) return;
    this.completed = true;
    clearTimeout(this.timer);
    this.report.state = this.report.state === 'stopping' ? 'stopped' : 'completed';
    this.notify(true);
    this.resolve?.(this.report);
  }
  private launch(index: number) {
    let request: PreparedRunRequest;
    try {
      request = this.render(index);
    } catch {
      this.stop('Template expansion failed. Check variable values and request limits.');
      return;
    }
    const now = this.elapsed();
    const scheduledMs = scheduledTime(index, this.plan.config);
    if (
      now >= this.plan.config.durationSeconds * 1000 ||
      now - scheduledMs > this.plan.config.maxStartDelayMs
    ) {
      this.report.missedDelay++;
      this.analytics.bucket(now).missed++;
      return;
    }
    const delayMs = Math.max(0, now - scheduledMs);
    const controller = new AbortController();
    this.controllers.add(controller);
    this.analytics.started(now, delayMs);
    void this.transport(request, this.plan.config, controller.signal)
      .catch((): ResponseMeasurement => ({
        durationMs: this.elapsed() - now,
        bytes: 0,
        outcome: 'network-error',
      }))
      .then((result) => {
        this.analytics.finished({
          ...result,
          index: index + 1,
          scheduledMs,
          startedMs: now,
          delayMs,
        });
        this.controllers.delete(controller);
        this.consecutiveFailures = result.outcome === 'ok' ? 0 : this.consecutiveFailures + 1;
        if (this.report.state === 'running' || this.report.state === 'draining') {
          if (result.status === 429 && this.plan.config.stopOn429)
            this.stop('Server returned HTTP 429. Run stopped; no automatic retries.');
          else if (
            this.plan.config.stopAfterFailures &&
            this.consecutiveFailures >= this.plan.config.stopAfterFailures
          )
            this.stop('Consecutive failure limit reached.');
        }
        if (this.report.state !== 'running' && !this.controllers.size) this.finish();
        else this.notify();
      });
  }
  private scheduling() {
    return this.report.state === 'running' || this.report.state === 'draining';
  }
  private tick = () => {
    if (this.completed || !this.scheduling()) return;
    const now = this.elapsed(),
      config = this.plan.config;
    if (this.expectedWake) this.analytics.lag.add(Math.max(0, now - this.expectedWake));
    if (now >= config.durationSeconds * 1000) {
      const missed = config.count - this.offered;
      this.report.missedDelay += missed;
      this.analytics.bucket(now).missed += missed;
      this.offered = config.count;
      this.report.state = 'draining';
      if (!this.controllers.size) {
        this.finish();
        return;
      }
    } else {
      const due = dueCount(now, config);
      const expired = Math.min(due, dueCount(now - config.maxStartDelayMs, config));
      const drop = Math.max(0, expired - this.offered);
      this.report.missedDelay += drop;
      this.offered += drop;
      this.analytics.bucket(now).missed += drop;
      // Leave eligible late slots for the next tick instead of discarding them
      // merely because this batch is full. Only expired slots are timing misses.
      let batch = 0;
      while (this.offered < due && this.report.state === 'running' && batch++ < 8) {
        const index = this.offered++;
        if (this.controllers.size >= config.concurrency) {
          this.report.missedCapacity++;
          this.analytics.bucket(now).missed++;
        } else this.launch(index);
      }
    }
    this.notify();
    if (this.completed || !this.scheduling()) return;
    const next =
      this.report.state === 'draining' || this.offered >= config.count
        ? config.durationSeconds * 1000
        : scheduledTime(this.offered, config);
    const minimumDelay = Math.min(
      4,
      Math.max(1, config.durationSeconds * 1000 - this.elapsed() - 1),
    );
    const delay =
      this.report.state === 'draining'
        ? 500
        : Math.max(minimumDelay, Math.min(500, next - this.elapsed()));
    this.expectedWake = this.elapsed() + delay;
    this.timer = setTimeout(this.tick, delay);
  };
}
