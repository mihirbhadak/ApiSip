import { Histogram } from './distribution';
import type { Measurement, RunPlan, RunReport, TimelineBucket } from './model';

export function createRunReport(
  plan: RunPlan,
  origin: string,
  workspaceId: string,
  sessionId: string,
  warnings: string[],
): RunReport {
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    sourceId: plan.sourceId,
    workspaceId,
    sessionId,
    createdAt: now,
    updatedAt: now,
    method: plan.request.method,
    origin,
    config: plan.config,
    state: 'running',
    elapsedMs: 0,
    started: 0,
    finished: 0,
    inFlight: 0,
    peakConcurrency: 0,
    missedCapacity: 0,
    missedDelay: 0,
    notStarted: plan.config.count,
    bytes: 0,
    outcomes: {
      ok: 0,
      'http-error': 0,
      'latency-failed': 0,
      timeout: 0,
      'network-error': 0,
      cancelled: 0,
      'body-limit': 0,
      'redirect-blocked': 0,
    },
    statuses: {},
    latency: { count: 0 },
    headers: { count: 0 },
    body: { count: 0 },
    delay: { count: 0 },
    schedulerLag: { count: 0 },
    timeline: [],
    bucketMs: Math.max(
      1000,
      Math.ceil((plan.config.durationSeconds * 1000) / 180),
      Math.ceil((plan.config.durationSeconds * 1000 + plan.config.timeoutMs) / 240),
    ),
    recent: [],
    failures: [],
    warnings,
    latencyBands: [10, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 30000, null].map((upperMs) => ({
      upperMs,
      count: 0,
    })),
  };
}
export class RunAnalytics {
  readonly latency = new Histogram();
  readonly headers = new Histogram();
  readonly body = new Histogram();
  readonly delay = new Histogram();
  readonly lag = new Histogram();
  constructor(readonly report: RunReport) {}
  bucket(at: number): TimelineBucket {
    // At most 241 buckets, including a bounded drain tail.
    const index = Math.min(240, Math.floor(Math.max(0, at) / this.report.bucketMs));
    while (this.report.timeline.length <= index)
      this.report.timeline.push({
        fromMs: this.report.timeline.length * this.report.bucketMs,
        starts: 0,
        finished: 0,
        failures: 0,
        durationSum: 0,
        maxDuration: 0,
        bytes: 0,
        missed: 0,
      });
    return this.report.timeline[index]!;
  }
  started(at: number, delay: number) {
    const r = this.report;
    r.started++;
    r.inFlight++;
    r.notStarted = r.config.count - r.started;
    r.peakConcurrency = Math.max(r.peakConcurrency, r.inFlight);
    this.delay.add(delay);
    this.bucket(at).starts++;
  }
  finished(result: Measurement) {
    const r = this.report;
    r.finished++;
    r.inFlight--;
    r.bytes += result.bytes;
    r.outcomes[result.outcome]++;
    if (result.status !== undefined)
      r.statuses[result.status] = (r.statuses[result.status] ?? 0) + 1;
    this.latency.add(result.durationMs);
    const band = r.latencyBands.find(
      (item) => item.upperMs === null || result.durationMs <= item.upperMs,
    );
    if (band) band.count++;
    if (result.headersMs !== undefined) this.headers.add(result.headersMs);
    if (result.bodyMs !== undefined) this.body.add(result.bodyMs);
    const bucket = this.bucket(result.startedMs + result.durationMs);
    bucket.finished++;
    bucket.durationSum += result.durationMs;
    bucket.bytes += result.bytes;
    bucket.maxDuration = Math.max(bucket.maxDuration, result.durationMs);
    if (result.outcome !== 'ok') {
      bucket.failures++;
      if (r.failures.length < 20) r.failures.push(result);
    }
    r.recent.push(result);
    if (r.recent.length > 100) r.recent.shift();
  }
  snapshot(elapsedMs: number): RunReport {
    Object.assign(this.report, {
      elapsedMs,
      updatedAt: Date.now(),
      latency: this.latency.summary(),
      headers: this.headers.summary(),
      body: this.body.summary(),
      delay: this.delay.summary(),
      schedulerLag: this.lag.summary(),
    });
    return this.report;
  }
}
