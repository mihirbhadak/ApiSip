import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Histogram } from '../src/runner/distribution';
import { dueCount, scheduledTime } from '../src/runner/schedule';
import { defaultRunConfig, runPlanSchema, type RunPlan } from '../src/runner/model';
import { compileRunRequest } from '../src/runner/templates';
import { RunEngine } from '../src/runner/engine';
import { createRunReport, RunAnalytics } from '../src/runner/analytics';
import { runCsv, runJson } from '../src/runner/export';
import { makeBody } from '../src/shared/parse';
import { fixture } from './fixtures';
import type { ResponseMeasurement } from '../src/runner/transport';

const plan = (patch: Partial<RunPlan['config']> = {}): RunPlan => ({
  sourceId: 'test-1',
  request: { ...fixture().request, url: 'https://example.com/api/run' },
  config: { ...defaultRunConfig, count: 20, durationSeconds: 1, ...patch },
  variables: [],
  rows: [],
  seed: 7,
});
const reportFor = (p: RunPlan) =>
  createRunReport(p, 'https://example.com', 'default', 'initial', []);
describe('paced run configuration and scheduling', () => {
  it('accepts ten thousand requests per minute and rejects unsafe or impossible configuration values', () => {
    expect(
      runPlanSchema.safeParse(plan({ count: 10000, durationSeconds: 60, concurrency: 32 })).success,
    ).toBe(true);
    for (const patch of [
      { count: 0 },
      { count: 1000001 },
      { concurrency: 129 },
      { timeoutMs: 0 },
      { durationSeconds: NaN },
      { count: 2000, durationSeconds: 1 },
      { rampSeconds: 2 },
      { expectedStatusMin: 500, expectedStatusMax: 200 },
    ])
      expect(runPlanSchema.safeParse(plan(patch)).success).toBe(false);
  });
  it('inverts uniform and ramped schedules without an array of pending requests', () => {
    for (const rampSeconds of [0, 0.25, 1]) {
      const config = plan({ count: 1000, rampSeconds }).config;
      for (const index of [0, 1, 25, 200, 999]) {
        const when = scheduledTime(index, config);
        expect(dueCount(when, config)).toBe(index + 1);
        expect(when).toBeLessThan(1000);
        if (index) expect(when).toBeGreaterThan(scheduledTime(index - 1, config));
      }
      expect(dueCount(-1, config)).toBe(0);
      expect(dueCount(2000, config)).toBe(1000);
    }
  });
});
describe('run templates', () => {
  it('encodes URL values, preserves numeric JSON placeholders and escapes embedded strings', () => {
    const p = plan();
    p.request.url += '/{{userId}}?q=%7B%7Bname%7D%7D&i={{index}}';
    p.request.headers = [{ name: 'X-Run', value: '{{index}}-{{name}}' }];
    p.request.body = makeBody(
      '{"id":"{{userId}}","message":"Hello {{name}}","active":"{{enabled}}","index":"{{index}}"}',
      'application/json',
      1024,
    );
    p.rows = [{ userId: 42, name: 'a"&/#', enabled: true }];
    const output = compileRunRequest(p).render(3, 123, 'test');
    expect(output.url).toContain('/42?q=a%22%26%2F%23&i=4');
    expect(JSON.parse(output.body!)).toEqual({
      id: 42,
      message: 'Hello a"&/#',
      active: true,
      index: 4,
    });
    expect(output.headers).toEqual([['X-Run', '4-a"&/#']]);
  });
  it('cycles data rows, reserves built-ins and produces reproducible seeded values', () => {
    const p = plan();
    p.request.headers = [
      { name: 'X-Run', value: '{{userId}}-{{randomInt}}-{{uuid}}-{{timestamp}}' },
    ];
    p.variables = [{ name: 'userId', value: 'fallback' }];
    p.rows = [{ userId: 10 }, { userId: 11 }];
    const render = compileRunRequest(p).render;
    expect(render(0, 123, 'abc').headers[0]![1]).toMatch(/^10-\d+-abc-123$/);
    expect(render(2, 123, 'abc').headers[0]![1]).toMatch(/^10-/);
    expect(render(2, 123, 'abc')).toEqual(render(2, 123, 'abc'));
    p.variables.push({ name: 'index', value: 'secret' });
    expect(() => compileRunRequest(p)).toThrow('built-ins');
  });
  it('rejects missing variables, malformed JSON, changed origins and header injection before sending', () => {
    const p = plan();
    p.request.headers = [{ name: 'X-Run', value: '{{name}}' }];
    expect(() => compileRunRequest(p)).toThrow('Unknown variable');
    p.variables = [{ name: 'name', value: 'value\r\nInjected: bad' }];
    expect(() => compileRunRequest(p)).toThrow();
    p.request.headers = [];
    p.request.url = 'https://{{host}}/api';
    expect(() => compileRunRequest(p)).toThrow('fixed');
    p.request.url = 'https://user:pass@example.com/api';
    expect(() => compileRunRequest(p)).toThrow('credentials');
    p.request.url = 'https://example.com/api';
    p.request.body = makeBody('{"broken":', 'application/json', 1024);
    expect(() => compileRunRequest(p)).toThrow('valid JSON');
  });
  it('omits restricted headers and GET bodies, rejects unreproducible bodies, and escapes form substitutions', () => {
    const p = plan();
    p.request.method = 'GET';
    p.request.headers = [
      { name: 'Cookie', value: 'secret' },
      { name: 'X-Test', value: 'yes' },
    ];
    const prepared = compileRunRequest(p);
    expect(prepared.render(0).headers).toEqual([['X-Test', 'yes']]);
    expect(prepared.render(0).body).toBeUndefined();
    expect(prepared.warnings.length).toBeGreaterThan(0);
    p.request.body = { ...p.request.body!, truncated: true };
    expect(() => compileRunRequest(p)).toThrow('incomplete');
    p.request.method = 'POST';
    p.request.body = makeBody('name={{name}}', 'application/x-www-form-urlencoded', 1024);
    p.variables = [{ name: 'name', value: 'a&b c' }];
    expect(compileRunRequest(p).render(0).body).toBe('name=a%26b%20c');
  });
  it('validates every data row and bounds template expansion before any run starts', () => {
    const p = plan();
    p.request.body = makeBody('{"name":"{{name}}"}', 'application/json', 1024);
    p.rows = [{ name: 'valid' }, { different: 'missing name' }];
    expect(() => compileRunRequest(p)).toThrow('Unknown variable: name');
    p.rows = [{ name: 'x'.repeat(10000) }];
    p.request.body = makeBody(
      JSON.stringify(Array(200).fill('{{name}}')),
      'application/json',
      10000,
    );
    expect(() => compileRunRequest(p)).toThrow('may exceed 1 MB');
    p.request.body = makeBody('['.repeat(34) + '0' + ']'.repeat(34), 'application/json', 1024);
    expect(() => compileRunRequest(p)).toThrow('32 levels');
  });
});
describe('bounded run measurements', () => {
  it('allocates distinct bounded time buckets through the full permitted drain window', () => {
    const p = plan({ durationSeconds: 180, timeoutMs: 120000 });
    const stats = new RunAnalytics(reportFor(p));
    const firstTail = stats.bucket(245000);
    const lastTail = stats.bucket(299000);
    expect(firstTail).not.toBe(lastTail);
    expect(stats.report.timeline.length).toBeLessThanOrEqual(241);
    expect(lastTail.fromMs + stats.report.bucketMs).toBeGreaterThan(299000);
  });
  it('retains accurate count/mean/range with bounded approximate percentiles', () => {
    const histogram = new Histogram();
    for (let i = 1; i <= 10000; i++) histogram.add(i);
    histogram.add(NaN);
    histogram.add(-1);
    const result = histogram.summary();
    expect(result.count).toBe(10000);
    expect(result.mean).toBeCloseTo(5000.5);
    expect(result.min).toBe(1);
    expect(result.max).toBe(10000);
    expect(result.p50).toBeGreaterThanOrEqual(5000);
    expect(result.p50).toBeLessThan(5100);
    expect(result.p95).toBeGreaterThanOrEqual(9500);
    expect(result.p95).toBeLessThan(9690);
    const empty = new Histogram();
    expect(empty.summary()).toEqual({ count: 0 });
    empty.add(10);
    expect(empty.summary().p95).toBeUndefined();
  });
  it('aggregates every result but bounds samples, timeline and export content at ten thousand requests', () => {
    const r = reportFor(plan({ count: 10000, durationSeconds: 60 })),
      stats = new RunAnalytics(r);
    for (let i = 0; i < 10000; i++) {
      stats.started(i * 6, 0);
      stats.finished({
        index: i + 1,
        scheduledMs: i * 6,
        startedMs: i * 6,
        delayMs: 0,
        durationMs: 30,
        headersMs: 10,
        bodyMs: 20,
        bytes: 100,
        status: i % 5 ? 200 : 500,
        outcome: i % 5 ? 'ok' : 'http-error',
      });
    }
    const report = stats.snapshot(60000);
    expect(report.finished).toBe(10000);
    expect(report.bytes).toBe(1000000);
    expect(report.outcomes['http-error']).toBe(2000);
    expect(report.recent).toHaveLength(100);
    expect(report.failures).toHaveLength(20);
    expect(report.timeline.length).toBeLessThanOrEqual(241);
    expect(report.latencyBands.reduce((sum, band) => sum + band.count, 0)).toBe(10000);
    const json = runJson(report);
    expect(json.length).toBeLessThan(100000);
    expect(JSON.parse(json).report.latency.count).toBe(10000);
    expect(json).not.toContain('Authorization');
    expect(runCsv(report).split('\r\n').length).toBeLessThanOrEqual(121);
    expect(runCsv(report)).toContain('"durationMs"');
  });
});
describe('scheduler execution', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const response = (ms: number, status = 200): Promise<ResponseMeasurement> =>
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            durationMs: ms,
            headersMs: ms,
            bodyMs: 0,
            status,
            bytes: 10,
            outcome: status === 200 ? 'ok' : 'http-error',
          }),
        ms,
      ),
    );
  it('paces all slots without unbounded concurrent promises and throttles UI publications', async () => {
    const p = plan({ count: 1000, durationSeconds: 1, concurrency: 20 });
    const send = vi.fn(() => response(8)),
      publish = vi.fn();
    const engine = new RunEngine(p, reportFor(p), publish, send),
      running = engine.run();
    await vi.advanceTimersByTimeAsync(1200);
    const result = await running;
    expect(result.started).toBe(1000);
    expect(result.finished).toBe(1000);
    expect(result.state).toBe('completed');
    expect(result.peakConcurrency).toBeLessThanOrEqual(20);
    expect(result.notStarted).toBe(0);
    expect(publish.mock.calls.length).toBeLessThan(6);
  });
  it('counts missed concurrency slots and drains requests after the start window', async () => {
    const p = plan({ count: 10, concurrency: 1 });
    const engine = new RunEngine(p, reportFor(p), vi.fn(), () => response(750));
    const running = engine.run();
    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.report.state).toBe('draining');
    expect(engine.report.started).toBe(2);
    expect(engine.report.missedCapacity).toBe(8);
    await vi.advanceTimersByTimeAsync(800);
    const result = await running;
    expect(result.finished).toBe(2);
    expect(result.elapsedMs).toBeGreaterThan(1000);
  });
  it('sends every planned slot within one minute when the browser clock advances in 16 ms steps', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const p = plan({ count: 10000, durationSeconds: 60, concurrency: 32 });
    const send = vi.fn(async (): Promise<ResponseMeasurement> => ({
      durationMs: 1,
      bytes: 11,
      status: 200,
      outcome: 'ok',
    }));
    const engine = new RunEngine(p, reportFor(p), vi.fn(), send);
    const running = engine.run();
    for (now = 16; now <= 60016; now += 16) await vi.advanceTimersByTimeAsync(16);
    const result = await running;
    expect(send).toHaveBeenCalledTimes(10000);
    expect(result.finished).toBe(10000);
    expect(result.missedDelay + result.missedCapacity).toBe(0);
    expect(result.recent.at(-1)!.startedMs).toBeLessThan(60000);
  });
  it('drops stale starts after a timer stall rather than issuing a catch-up flood', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const p = plan({ count: 1000, concurrency: 128 });
    const engine = new RunEngine(p, reportFor(p), vi.fn(), async () => ({
      durationMs: 1,
      bytes: 0,
      status: 200,
      outcome: 'ok',
    }));
    const running = engine.run();
    now = 500;
    await vi.advanceTimersByTimeAsync(4);
    expect(engine.report.started).toBeLessThanOrEqual(9);
    expect(engine.report.missedDelay).toBeGreaterThan(400);
    now = 1001;
    await vi.advanceTimersByTimeAsync(500);
    const result = await running;
    expect(result.started + result.missedDelay + result.missedCapacity).toBe(1000);
    expect(result.schedulerLag.max).toBeGreaterThan(400);
  });
  it('yields between batches while preserving late slots that are still within the configured tolerance', async () => {
    const clock = performance.now.bind(performance);
    let stall = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock() + stall);
    const p = plan({ count: 200, concurrency: 32, maxStartDelayMs: 100 });
    const send = vi.fn(async (): Promise<ResponseMeasurement> => ({
      durationMs: 1,
      bytes: 0,
      outcome: 'ok',
    }));
    const engine = new RunEngine(p, reportFor(p), vi.fn(), send);
    const running = engine.run();
    stall = 60;
    await vi.advanceTimersByTimeAsync(5);
    expect(engine.report.started).toBeLessThanOrEqual(9);
    expect(engine.report.missedDelay).toBe(0);
    await vi.advanceTimersByTimeAsync(1100);
    const result = await running;
    expect(result.started).toBe(200);
    expect(result.missedDelay).toBe(0);
    expect(result.delay.max).toBeLessThanOrEqual(100);
  });
  it('rechecks the start deadline after template preparation consumes time', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const p = plan({ count: 1, maxStartDelayMs: 100 });
    const send = vi.fn(() => response(1));
    const engine = new RunEngine(p, reportFor(p), vi.fn(), send);
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      now = 200;
      return '00000000-0000-4000-8000-000000000000';
    });
    const running = engine.run();
    expect(send).not.toHaveBeenCalled();
    now = 1001;
    await vi.advanceTimersByTimeAsync(1000);
    const result = await running;
    expect(result.started).toBe(0);
    expect(result.missedDelay).toBe(1);
    expect(result.state).toBe('completed');
  });
  it('stops immediately, aborts in-flight work and never launches later slots', async () => {
    const p = plan({ count: 100, concurrency: 3 });
    const send = vi.fn(
      (_r, _c, signal: AbortSignal): Promise<ResponseMeasurement> =>
        new Promise((resolve) =>
          signal.addEventListener('abort', () =>
            resolve({ durationMs: 50, bytes: 0, outcome: 'cancelled' }),
          ),
        ),
    );
    const engine = new RunEngine(p, reportFor(p), vi.fn(), send),
      running = engine.run();
    await vi.advanceTimersByTimeAsync(50);
    engine.stop();
    expect(engine.report.state).toBe('stopping');
    engine.stop('A duplicate stop must not change the reason.');
    expect(engine.report.reason).toBe('Stopped by user.');
    const result = await running;
    const sent = send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(send.mock.calls.length).toBe(sent);
    expect(result.state).toBe('stopped');
    expect(result.outcomes.cancelled).toBe(3);
    expect(result.inFlight).toBe(0);
  });
  it('stops on rate limiting without retrying or filling the remaining count', async () => {
    const p = plan({ count: 100 });
    const engine = new RunEngine(p, reportFor(p), vi.fn(), () => response(5, 429));
    const running = engine.run();
    await vi.advanceTimersByTimeAsync(1000);
    const result = await running;
    expect(result.state).toBe('stopped');
    expect(result.started).toBe(1);
    expect(result.reason).toContain('429');
    expect(result.notStarted).toBe(99);
  });
});
