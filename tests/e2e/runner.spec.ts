import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { access, cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { stopExtensionWorker } from './lifecycle';
import {
  defaultRunConfig,
  type RunConfig,
  type RunPlan,
  type RunReport,
} from '../../src/runner/model';
import type { CapturedRequest } from '../../src/shared/model';
let context: BrowserContext,
  inspector: Page,
  editor: Page,
  source: CapturedRequest,
  extensionId: string;
const base = 'http://127.0.0.1:4177';
const errors: string[] = [];
test.describe.configure({ mode: 'serial' });
async function capturedSource(): Promise<CapturedRequest> {
  return inspector.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const open = indexedDB.open('api-catcher');
      open.onsuccess = () => resolve(open.result);
    });
    const records = await new Promise<CapturedRequest[]>((resolve) => {
      const get = db.transaction('requests').objectStore('requests').getAll();
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return records.find((row) => row.request.url.includes('runner-source'))!;
  });
}
async function reports(): Promise<RunReport[]> {
  return inspector.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('api-catcher');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const result = await new Promise<RunReport[]>((resolve, reject) => {
      const get = db.transaction('runs').objectStore('runs').getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return result;
  });
}
async function waitRun(id: string) {
  await expect
    .poll(async () => (await reports()).find((run) => run.id === id)?.state, { timeout: 150000 })
    .toMatch(/completed|stopped|interrupted/);
  return (await reports()).find((run) => run.id === id)!;
}
async function stats(id: string) {
  return (await fetch(base + '/api/load-stats?id=' + id)).json();
}
function planFor(path: string, config: Partial<RunConfig> = {}): RunPlan {
  return {
    sourceId: source.id,
    request: { method: 'GET', url: base + path, headers: [], query: [] },
    config: { ...defaultRunConfig, count: 10, durationSeconds: 1, ...config },
    variables: [],
    rows: [],
    seed: 1,
  };
}
async function start(plan: RunPlan) {
  const result = await inspector.evaluate(
    (plan) => chrome.runtime.sendMessage({ type: 'runner-start', plan }),
    plan,
  );
  expect(result.ok, result.error).toBe(true);
  return result.data as RunReport;
}

test.beforeAll(async () => {
  await access('.browser-profile/Default/Preferences');
  await mkdir('.tmp', { recursive: true });
  await mkdir('test-results/visual', { recursive: true });
  const profile = await mkdtemp(resolve('.tmp/runner-test-'));
  await cp(resolve('.browser-profile'), profile, {
    recursive: true,
    filter: (path) =>
      !/(?:^|[\\/])(History(?:-journal)?|Service Worker|Cache|Code Cache|GPUCache|Crashpad|SingletonLock|SingletonSocket|SingletonCookie)$/.test(
        path,
      ),
  });
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    executablePath: process.env.API_CATCHER_CHROME,
    headless: false,
    viewport: { width: 1512, height: 982 },
    args: [
      '--enable-unsafe-extension-debugging',
      '--disable-extensions-except=' + resolve('dist'),
      '--load-extension=' + resolve('dist'),
    ],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
  inspector = await context.newPage();
  inspector.on('pageerror', (error) => errors.push(error.message));
  await inspector.goto('chrome-extension://' + extensionId + '/inspector.html');
  const build = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  const state = await inspector.evaluate(() => chrome.runtime.sendMessage({ type: 'state' }));
  expect(state.data.buildId).toBe(build.buildId);
  // Clearing history preserves recording. Start this runner fixture from a known paused state.
  if (state.data.settings.recording) {
    await inspector.getByRole('button', { name: 'Recording', exact: true }).click();
    await expect(
      inspector.getByRole('button', { name: 'Start capture', exact: true }),
    ).toBeVisible();
  }
  await inspector.getByLabel('Open settings').click();
  await inspector.getByRole('tab', { name: 'Privacy & storage', exact: true }).click();
  await inspector.getByRole('button', { name: 'Clear all stored data', exact: true }).click();
  await inspector.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(inspector.getByRole('dialog')).toHaveCount(0);
  // Runner tests observe metadata; response-capture defaults are covered separately.
  const responseCapture = inspector.getByLabel('Capture response bodies');
  if (await responseCapture.isChecked()) await responseCapture.click();
  await expect(responseCapture).not.toBeChecked();
  await inspector.getByLabel('Open settings').click();
  await inspector.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await inspector.getByRole('combobox', { name: 'Theme' }).click();
  await inspector.getByRole('option', { name: 'Light', exact: true }).click();
  await inspector.getByRole('button', { name: 'Save settings' }).click();
  const page = await context.newPage();
  await page.goto(base);
  await page.bringToFront();
  // Tab activation and its persisted capture target are asynchronous. Establish the source
  // before switching to the inspector and emitting the single request used by this fixture.
  const sourceTab = await inspector.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return { id: tab?.id, url: tab?.url };
  });
  expect(sourceTab.url).toBe(base + '/');
  expect(sourceTab.id).toBeDefined();
  await expect
    .poll(
      async () =>
        (await inspector.evaluate(() => chrome.runtime.sendMessage({ type: 'state' }))).data
          .settings.activeTabId,
    )
    .toBe(sourceTab.id);
  await inspector.bringToFront();
  if (await inspector.getByRole('button', { name: 'Start capture', exact: true }).count())
    await inspector.getByRole('button', { name: 'Start capture', exact: true }).click();
  await expect(inspector.getByRole('button', { name: 'Recording', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await fetch('/api/json?runner-source=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Original': 'yes' },
      body: '{"name":"source"}',
    });
  });
  await inspector.getByLabel('Search APIs').fill('runner-source');
  try {
    await expect(inspector.getByTestId('request-row')).toHaveCount(1);
  } catch (error) {
    console.log(
      'Runner capture setup',
      await inspector.evaluate(async () => {
        const { data } = await chrome.runtime.sendMessage({ type: 'state' });
        return {
          settings: {
            recording: data.settings.recording,
            provider: data.settings.provider,
            scope: data.settings.scope,
            activeTabId: data.settings.activeTabId,
            sessionId: data.settings.sessionId,
          },
          count: data.count,
          tabCount: data.tabCount,
          sessionCount: data.sessionCount,
          hostsGranted: data.hostsGranted,
          diagnostics: data.diagnostics,
          tabs: (await chrome.tabs.query({})).map(({ id, active, url }) => ({
            id,
            active,
            origin: url ? new URL(url).origin : undefined,
          })),
        };
      }),
    );
    console.log('Runner source stored', Boolean(await capturedSource()), 'UI errors', errors);
    await inspector.screenshot({ path: 'test-results/visual/runner-capture-setup-failure.png' });
    throw error;
  }
  await inspector.getByTestId('request-row').click();
  await inspector.getByRole('tab', { name: 'Replay', exact: true }).click();
  [editor] = await Promise.all([
    context.waitForEvent('page'),
    inspector.getByRole('button', { name: 'Open in new tab', exact: true }).click(),
  ]);
  editor.on('pageerror', (error) => errors.push(error.message));
  await expect(editor.getByLabel('Request URL', { exact: true })).toBeVisible();
  source = await capturedSource();
});
test.afterEach(async ({ browserName }, info) => {
  void browserName;
  if (info.status !== info.expectedStatus) {
    console.log('Runner errors', errors);
    console.log(
      'Run reports',
      (await reports()).map(
        ({ id, state, reason, started, finished, missedCapacity, missedDelay }) => ({
          id,
          state,
          reason,
          started,
          finished,
          missedCapacity,
          missedDelay,
        }),
      ),
    );
    await (editor && !editor.isClosed() ? editor : inspector).screenshot({
      path: 'test-results/visual/runner-failure.png',
    });
  }
});
test.afterAll(async () => {
  await context?.close();
});

test('sends a paced API run with body/header variables, exposes truthful timings and exports bounded analytics', async () => {
  await editor
    .getByLabel('Request URL', { exact: true })
    .fill(base + '/api/load/variables?index={{index}}&delay=20&bodyDelay=30');
  await editor.getByRole('button', { name: 'Add row', exact: true }).click();
  await editor
    .getByLabel(/Request headers key/)
    .last()
    .fill('X-Run-Index');
  await editor
    .getByLabel(/Request headers value/)
    .last()
    .fill('{{index}}');
  await editor.getByRole('tab', { name: 'Body', exact: true }).click();
  await editor
    .getByLabel('Request body', { exact: true })
    .fill('{"index":"{{index}}","name":"{{name}}","random":"{{randomInt}}","uuid":"{{uuid}}"}');
  await editor.getByRole('button', { name: 'Timed run', exact: true }).click();
  await editor.getByLabel('Requests to schedule').fill('10');
  await editor.getByLabel('Run duration').fill('2');
  await editor.getByLabel('Maximum concurrency').fill('4');
  await editor.locator('summary').filter({ hasText: 'Variables & data rows' }).click();
  // Use JSON serialization to preserve the quoted fixture value exactly.
  await editor
    .getByLabel('Data rows', { exact: true })
    .fill(JSON.stringify([{ name: 'Mihir "test"' }, { name: 'Ada' }]));
  await editor.getByRole('button', { name: 'Review run', exact: true }).click();
  await expect(editor.getByRole('dialog', { name: 'Start timed run' })).toBeVisible();
  expect((await stats('variables')).count).toBe(0);
  await editor.getByRole('button', { name: 'Start run', exact: true }).click();
  await expect(editor.getByTestId('run-state')).toHaveText('completed', { timeout: 15000 });
  await expect(editor.getByTestId('run-started')).toHaveText('10');
  await expect(editor.getByTestId('run-passed')).toHaveText('10');
  const actual = await stats('variables');
  expect(actual.count).toBe(10);
  expect(actual.indices).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  expect(actual.samples[0].headers['x-run-index']).toBe('1');
  expect(actual.samples[0].headers.cookie).toBeUndefined();
  const body = JSON.parse(actual.samples[0].raw);
  expect(body.index).toBe(1);
  expect(body.name).toBe('Mihir "test"');
  expect(body.uuid).toMatch(/^[\w-]{36}$/);
  const result = (await reports()).at(-1)!;
  expect(result.finished).toBe(10);
  expect(result.latency.count).toBe(10);
  expect(result.headers.mean).toBeGreaterThanOrEqual(15);
  expect(result.body.mean).toBeGreaterThanOrEqual(20);
  expect(result.latency.p95).toBeUndefined();
  const [download] = await Promise.all([
    editor.waitForEvent('download'),
    editor.getByRole('button', { name: 'Report JSON' }).click(),
  ]);
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.report.started).toBe(10);
  expect(exported.report).not.toHaveProperty('request');
  expect(exported.report.recent[0]).not.toHaveProperty('body');
  const [csv] = await Promise.all([
    editor.waitForEvent('download'),
    editor.getByRole('button', { name: 'Sample CSV' }).click(),
  ]);
  expect((await readFile((await csv.path())!, 'utf8')).split('\r\n')).toHaveLength(11);
  await editor.locator('summary').filter({ hasText: 'Variables & data rows' }).click();
  await editor.screenshot({ path: 'test-results/visual/30-runner-light.png' });
  expect(
    (await new AxeBuilder({ page: editor }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await inspector.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'settings', patch: { theme: 'dark' } }),
  );
  await expect(editor.locator('html')).toHaveAttribute('data-theme', 'dark');
  await editor.screenshot({ path: 'test-results/visual/31-runner-dark.png' });
  expect(
    (await new AxeBuilder({ page: editor }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await editor.setViewportSize({ width: 640, height: 850 });
  expect(await editor.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    640,
  );
  await editor.screenshot({ path: 'test-results/visual/32-runner-mobile.png' });
  await editor.setViewportSize({ width: 1512, height: 982 });
  await editor.getByRole('button', { name: 'Back to editor' }).click();
  await expect(editor.getByLabel('Request body', { exact: true })).toHaveValue(
    '{"index":"{{index}}","name":"{{name}}","random":"{{randomInt}}","uuid":"{{uuid}}"}',
  );
});
test('continues after editor close and service worker termination, and stops from the dashboard', async () => {
  const report = await start(
    planFor('/api/load/background?delay=150', { count: 200, durationSeconds: 10, concurrency: 8 }),
  );
  await editor.close();
  await expect.poll(async () => (await stats('background')).count).toBeGreaterThan(4);
  await stopExtensionWorker(context, extensionId);
  await inspector.getByRole('button', { name: 'Timed runs', exact: true }).click();
  await expect(inspector.getByRole('dialog', { name: 'Timed runs', exact: true })).toBeVisible();
  await expect(inspector.getByTestId('run-state')).toHaveText('running');
  await inspector.getByRole('button', { name: 'Stop run' }).click();
  const result = await waitRun(report.id);
  expect(result.state).toBe('stopped');
  expect(result.inFlight).toBe(0);
  expect(result.started).toBeLessThan(200);
  const count = (await stats('background')).count;
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect((await stats('background')).count).toBe(count);
  await inspector
    .getByRole('dialog', { name: 'Timed runs' })
    .getByRole('button', { name: 'Close dialog' })
    .click();
  await expect
    .poll(() =>
      inspector.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
            })
          ).length,
      ),
    )
    .toBe(0);
});
test('handles saturation, timeout, failure limits, response limits and redirects without retrying', async () => {
  let report = await start(
    planFor('/api/load/overload?delay=250', { count: 100, concurrency: 1, stopAfterFailures: 0 }),
  );
  let result = await waitRun(report.id);
  expect(result.missedCapacity).toBeGreaterThan(90);
  expect(result.started).toBe((await stats('overload')).count);
  expect(result.started + result.missedCapacity + result.missedDelay).toBe(100);
  expect(result.peakConcurrency).toBe(1);
  report = await start(
    planFor('/api/load/timeout?delay=500', { count: 3, timeoutMs: 100, stopAfterFailures: 0 }),
  );
  result = await waitRun(report.id);
  expect(result.outcomes.timeout).toBe(3);
  expect(result.outcomes.ok).toBe(0);
  report = await start(
    planFor('/api/load/failures?status=500', { count: 50, stopAfterFailures: 2 }),
  );
  result = await waitRun(report.id);
  expect(result.state).toBe('stopped');
  expect(result.outcomes['http-error']).toBeGreaterThanOrEqual(2);
  expect(result.started).toBeLessThan(50);
  report = await start(
    planFor('/api/load/large?size=1500000', {
      count: 2,
      maxResponseBytes: 1048576,
      stopAfterFailures: 0,
    }),
  );
  result = await waitRun(report.id);
  expect(result.outcomes['body-limit']).toBe(2);
  expect(result.bytes).toBeGreaterThan(2 * 1048576);
  expect(result.recent.every((item) => !('body' in item))).toBe(true);
  report = await start(planFor('/api/redirect', { count: 1, stopAfterFailures: 0 }));
  result = await waitRun(report.id);
  expect(result.outcomes['redirect-blocked']).toBe(1);
  report = await start(planFor('/api/load/rate-limit?status=429', { count: 50 }));
  result = await waitRun(report.id);
  expect(result.reason).toContain('429');
  expect(result.started).toBeLessThan(50);
});
test('rejects overlapping runs and recovers a lost offscreen worker without repeating requests', async () => {
  const plan = planFor('/api/load/interrupted?delay=10', { count: 100, durationSeconds: 10 });
  const attempts = await inspector.evaluate(
    (plan) =>
      Promise.all([
        chrome.runtime.sendMessage({ type: 'runner-start', plan }),
        chrome.runtime.sendMessage({ type: 'runner-start', plan }),
      ]),
    plan,
  );
  expect(attempts.filter((item) => item.ok)).toHaveLength(1);
  expect(attempts.find((item) => !item.ok)?.error).toContain('active');
  const id = attempts.find((item) => item.ok)!.data.id;
  await expect
    .poll(async () => (await reports()).find((item) => item.id === id)?.finished)
    .toBeGreaterThan(5);
  await inspector.evaluate(() => chrome.offscreen.closeDocument());
  await inspector.evaluate(() => chrome.runtime.sendMessage({ type: 'runner-status' }));
  const result = await waitRun(id);
  expect(result.state).toBe('interrupted');
  expect(result.reason).toContain('unknown');
  const count = (await stats('interrupted')).count;
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect((await stats('interrupted')).count).toBe(count);
});
test('executes ten thousand real requests over one minute with bounded reports and a responsive inspector', async () => {
  test.setTimeout(150000);
  const report = await start(
    planFor('/api/load/ten-thousand?index={{index}}', {
      count: 10000,
      durationSeconds: 60,
      concurrency: 32,
      maxStartDelayMs: 1000,
      stopAfterFailures: 0,
    }),
  );
  const browser = await context.browser()!.newBrowserCDPSession();
  const cpuStart = await browser.send('SystemInfo.getProcessInfo');
  const clock = Date.now();
  await inspector.getByRole('button', { name: 'Timed runs', exact: true }).click();
  await expect
    .poll(async () => (await stats('ten-thousand')).count, { timeout: 30000 })
    .toBeGreaterThan(1000);
  console.log(
    'Inspector visibility before interaction',
    await inspector.evaluate(() => ({
      visibility: document.visibilityState,
      focused: document.hasFocus(),
    })),
  );
  await inspector.bringToFront();
  await expect
    .poll(() =>
      inspector.evaluate(() => document.visibilityState === 'visible' && document.hasFocus()),
    )
    .toBe(true);
  const responsive = Date.now();
  await inspector.getByRole('combobox', { name: 'Run history' }).click();
  const clickMs = Date.now() - responsive;
  await expect(inspector.getByRole('listbox', { name: 'Run history options' })).toBeVisible();
  const visibleMs = Date.now() - responsive;
  await inspector.keyboard.press('Escape');
  console.log('Runner UI interaction', { clickMs, visibleMs, totalMs: Date.now() - responsive });
  expect(Date.now() - responsive).toBeLessThan(1500);
  const inspectorMetrics = await context.newCDPSession(inspector);
  const heapEarly = await inspectorMetrics.send('Runtime.getHeapUsage');
  await expect
    .poll(async () => (await stats('ten-thousand')).count, { timeout: 90000 })
    .toBeGreaterThan(8000);
  const heapLate = await inspectorMetrics.send('Runtime.getHeapUsage');
  await inspectorMetrics.detach();
  const result = await waitRun(report.id);
  const actual = await stats('ten-thousand');
  expect(result.state).toBe('completed');
  expect(result.started).toBe(10000);
  expect(result.finished).toBe(10000);
  expect(result.outcomes.ok).toBe(10000);
  expect(actual.count).toBe(10000);
  expect(actual.indices).toHaveLength(10000);
  expect(actual.lastAt - actual.firstAt).toBeGreaterThan(59000);
  expect(result.peakConcurrency).toBeLessThanOrEqual(32);
  expect(result.recent).toHaveLength(100);
  expect(result.timeline.length).toBeLessThanOrEqual(241);
  expect(JSON.stringify(result).length).toBeLessThan(100000);
  const cpuEnd = await browser.send('SystemInfo.getProcessInfo');
  const baseline = new Map(cpuStart.processInfo.map((item) => [item.id, item.cpuTime]));
  const cpuSeconds = cpuEnd.processInfo.reduce(
    (sum, item) => sum + Math.max(0, item.cpuTime - (baseline.get(item.id) ?? 0)),
    0,
  );
  console.log('Timed runner benchmark', {
    started: result.started,
    elapsedMs: result.elapsedMs,
    missed: result.missedCapacity + result.missedDelay,
    p95: result.latency.p95,
    maxStartDelay: result.delay.max,
    reportBytes: new TextEncoder().encode(JSON.stringify(result)).byteLength,
    inspectorJsHeapBytes: { after1000: heapEarly, after8000: heapLate },
    measuredChromeCpuSeconds: cpuSeconds,
    sampleWallMs: Date.now() - clock,
    cpuScope: 'all surviving processes in isolated test browser; not whole-computer CPU',
  });
  await expect(inspector.getByTestId('run-started')).toHaveText('10,000');
  await inspector.screenshot({ path: 'test-results/visual/33-runner-10000.png' });
  await inspector
    .getByRole('dialog', { name: 'Timed runs' })
    .getByRole('button', { name: 'Close dialog' })
    .click();
  await browser.detach();
  expect(errors).toEqual([]);
});
test('stops an active run when its source is deleted and never resurrects deleted reports', async () => {
  await start(planFor('/api/load/deletion?delay=100', { count: 100, durationSeconds: 10 }));
  await expect.poll(async () => (await stats('deletion')).count).toBeGreaterThan(1);
  await inspector.getByTestId('request-row').click({ button: 'right' });
  await inspector.getByRole('menuitem', { name: 'Delete request', exact: true }).click();
  await inspector
    .getByRole('dialog', { name: 'Delete request?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(inspector.getByTestId('request-row')).toHaveCount(0);
  await expect
    .poll(() =>
      inspector.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
            })
          ).length,
      ),
    )
    .toBe(0);
  const count = (await stats('deletion')).count;
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect((await stats('deletion')).count).toBe(count);
  expect(await reports()).toEqual([]);
  const page = await context.newPage();
  await page.goto(base);
  await page.bringToFront();
  await expect
    .poll(async () => {
      const state = await inspector.evaluate(() => chrome.runtime.sendMessage({ type: 'state' }));
      return state.data.settings.activePageUrl;
    })
    .toBe(base + '/');
  await page.evaluate(() =>
    fetch('/api/json?runner-source=2', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    }),
  );
  await expect(inspector.getByTestId('request-row')).toHaveCount(1);
  source = await capturedSource();
});

test('stops when site access is revoked and rejects a new run with a clear permission error', async () => {
  const report = await start(
    planFor('/api/load/revoke?delay=100', { count: 100, durationSeconds: 10 }),
  );
  await expect.poll(async () => (await stats('revoke')).count).toBeGreaterThan(1);
  expect(
    await inspector.evaluate(() =>
      chrome.permissions.remove({ origins: ['http://*/*', 'https://*/*'] }),
    ),
  ).toBe(true);
  const result = await waitRun(report.id);
  expect(result.state).toBe('stopped');
  expect(result.reason).toContain('Site access');
  const rejected = await inspector.evaluate(
    (plan) => chrome.runtime.sendMessage({ type: 'runner-start', plan }),
    planFor('/api/load/denied'),
  );
  expect(rejected.ok).toBe(false);
  expect(rejected.error).toContain('site access');
  expect((await stats('denied')).count).toBe(0);
});
