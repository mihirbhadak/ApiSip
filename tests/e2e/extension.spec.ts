import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { resolve } from 'node:path';
import { stopExtensionWorker, expectRunningWorker } from './lifecycle';
import { mkdir, mkdtemp, readFile, cp, access } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import type { CapturedRequest } from '../../src/shared/model';
let context: BrowserContext, page: Page, inspector: Page, worker: Worker, extensionId: string;
let profile: string;
const base = 'http://127.0.0.1:4177';
const errors: string[] = [];
test.describe.configure({ mode: 'serial' });
async function state() {
  return inspector.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'state' });
    if (!response.ok) throw new Error(response.error);
    return response.data as {
      buildId?: string;
      captureQueue?: { pendingWrites: number; largestQueue: number };
      count: number;
      tabCount: number;
      attachedTabs: number[];
      settings: {
        activeTabId?: number;
        recording: boolean;
        sessionId: string;
        workspaceId: string;
      };
      diagnostics: { message: string }[];
    };
  });
}
async function records(): Promise<CapturedRequest[]> {
  return inspector.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('api-catcher', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['requests', 'bodies']);
    const get = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [rows, bodies] = await Promise.all([
      get(tx.objectStore('requests').getAll()) as Promise<CapturedRequest[]>,
      get(tx.objectStore('bodies').getAll()) as Promise<
        {
          id: string;
          request?: CapturedRequest['request']['body'];
          response?: NonNullable<CapturedRequest['response']>['body'];
          replays?: CapturedRequest['replayHistory'];
          messages?: CapturedRequest['metadata']['messages'];
        }[]
      >,
    ]);
    db.close();
    return rows.map((r) => {
      const body = bodies.find((b) => b.id === r.id);
      return {
        ...r,
        request: { ...r.request, body: body?.request },
        response: r.response && { ...r.response, body: body?.response },
        replayHistory: body?.replays,
        metadata: { ...r.metadata, messages: body?.messages },
      };
    });
  });
}
async function request(path: string, method = 'GET', body?: string) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        body,
        headers: body ? { 'Content-Type': 'application/json', 'X-Lab': 'original' } : undefined,
      });
      return { status: response.status, text: await response.text() };
    },
    { path, method, body },
  );
}
async function pasteClipboard() {
  await page.bringToFront();
  const scratch = page.getByLabel('Clipboard scratchpad');
  await scratch.fill('');
  await scratch.press('Control+V');
  await expect(scratch).not.toHaveValue('');
  const value = await scratch.inputValue();
  await inspector.bringToFront();
  return value;
}
test.beforeAll(async () => {
  await mkdir('test-results/visual', { recursive: true });
  await mkdir('.tmp', { recursive: true });
  await access(resolve('.browser-profile/Default/Preferences')).catch(() => {
    throw new Error(
      'Run npm run test:authorize once to grant site access in the isolated baseline profile.',
    );
  });
  profile = await mkdtemp(resolve('.tmp/browser-test-'));
  await cp(resolve('.browser-profile'), profile, {
    recursive: true,
    filter: (path) =>
      !/(?:^|[\\/])(History(?:-journal)?|Service Worker|Cache|Code Cache|GPUCache|Crashpad|SingletonLock|SingletonSocket|SingletonCookie)$/.test(
        path,
      ),
  });
  console.log('Isolated test profile', profile);
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
  page = await context.newPage();
  await page.goto(base);
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
  inspector = await context.newPage();
  inspector.on('pageerror', (error) => errors.push(error.message));
  await inspector.goto('chrome-extension://' + extensionId + '/inspector.html');
  await inspector.getByRole('heading', { name: 'Network requests' }).waitFor();
  const build = JSON.parse(await readFile('dist/build-info.json', 'utf8')) as { buildId: string };
  expect((await state()).buildId).toBe(build.buildId);
  console.log('Verified extension build', build.buildId);
  await inspector.getByLabel('Open settings').click();
  await inspector.getByRole('button', { name: 'Privacy & storage', exact: true }).click();
  await inspector.getByRole('button', { name: 'Clear all stored data', exact: true }).click();
  await inspector.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(async () => (await state()).count).toBe(0);
  await expect(inspector.getByRole('button', { name: 'First session', exact: true })).toBeVisible();
});
test.afterEach(async ({ browserName }, info) => {
  void browserName;
  if (info.status !== info.expectedStatus && inspector && !inspector.isClosed()) {
    await inspector.screenshot({ path: 'test-results/visual/failure.png' });
    console.log('Permissions', await inspector.evaluate(() => chrome.permissions.getAll()));
    console.log('Extension errors', errors);
    console.log('Failure state', await state());
  }
});
test.afterAll(async () => {
  await context?.close();
});

test('opens and focuses the full-page inspector through the real Chrome toolbar action', async () => {
  const session = await context.browser()!.newBrowserCDPSession();
  const { targetInfos } = await session.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const targetInfo = targetInfos.find((target) => target.url === page.url());
  expect(targetInfo).toBeDefined();
  await inspector.close();
  await page.bringToFront();
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    session.send('Extensions.triggerAction', { id: extensionId, targetId: targetInfo!.targetId }),
  ]);
  inspector = opened;
  inspector.on('pageerror', (error) => errors.push(error.message));
  await expect(inspector).toHaveURL('chrome-extension://' + extensionId + '/inspector.html');
  await expect(inspector.getByRole('heading', { name: 'Network requests' })).toBeVisible();
  const pages = context.pages().length;
  await page.bringToFront();
  await session.send('Extensions.triggerAction', {
    id: extensionId,
    targetId: targetInfo!.targetId,
  });
  await expect.poll(() => inspector.evaluate(() => document.visibilityState)).toBe('visible');
  expect(context.pages()).toHaveLength(pages);
  await session.detach();
});

test('loads the production MV3 extension, starts capture and counts real traffic', async () => {
  expect(await worker.evaluate(() => chrome.runtime.getManifest().manifest_version)).toBe(3);
  await inspector.screenshot({ path: 'test-results/visual/01-empty-light.png' });
  await inspector.getByRole('button', { name: 'Start capture', exact: true }).click();
  await expect(inspector.getByRole('button', { name: 'Recording', exact: true })).toBeVisible();
  await page.bringToFront();
  await expect.poll(async () => (await state()).settings.activeTabId).toBeDefined();
  const before = (await state()).count;
  await request('/api/users');
  await expect.poll(async () => (await state()).count).toBe(before + 1);
  await expect
    .poll(async () => worker.evaluate(() => chrome.action.getBadgeText({})))
    .toBe(String((await state()).tabCount));
  await page.getByRole('button', { name: '10 requests' }).click();
  await expect.poll(async () => (await state()).count).toBe(before + 11);
  const captured = (await records()).find((r) => r.request.url.endsWith('/api/users'))!;
  expect(captured.request.method).toBe('GET');
  expect(captured.response?.status).toBe(200);
  expect(captured.response?.body?.available).toBe(false);
  await inspector.bringToFront();
  await inspector.getByLabel('Search APIs').fill('/api/users');
  await expect(inspector.getByTestId('request-row')).toHaveCount(11);
});
test('attaches debugger and captures headers, JSON, forms, redirects, errors and WebSockets', async () => {
  await inspector.getByLabel('Capture response bodies').click();
  await expect(inspector.getByLabel('Capture response bodies')).toBeChecked();
  await expect.poll(async () => (await state()).attachedTabs.length).toBeGreaterThan(0);
  await request(
    '/api/json?original=1',
    'POST',
    '{"name":"Mihir","password":"private","nested":{"id":1}}',
  );
  await request('/api/error/400');
  await request('/api/error/500');
  await request('/api/slow?ms=100');
  await request('/api/headers');
  await request('/api/cookies');
  await request('/api/redirect');
  await request(
    '/api/graphql',
    'POST',
    '{"operationName":"Users","query":"query Users { users { id } }","variables":{"page":1}}',
  );
  await request('/api/html');
  await request('/api/malformed');
  await request('/api/large-response');
  await page.evaluate(async () => {
    await fetch('/api/form', {
      method: 'POST',
      body: new URLSearchParams({ name: 'Mihir', page: '1' }),
    });
    const form = new FormData();
    form.set('username', 'Mihir');
    form.set('avatar', new Blob(['file content'], { type: 'text/plain' }), 'avatar.txt');
    await fetch('/api/multipart', { method: 'POST', body: form });
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket('ws://127.0.0.1:4177/socket');
      socket.onerror = () => reject(new Error('WebSocket failed'));
      socket.onopen = () => socket.send('hello');
      socket.onmessage = (event) => {
        if (event.data === 'echo:hello') {
          socket.close();
          resolve();
        }
      };
    });
  });
  await expect
    .poll(
      async () =>
        (await records()).find((r) => r.request.url.includes('/api/json?original'))?.response?.body
          ?.available,
    )
    .toBe(true);
  const rows = await records(),
    json = rows.find((r) => r.request.url.includes('/api/json?original'))!;
  expect(json.metadata.provider).toBe('debugger');
  expect(json.request.body?.text).toContain('Mihir');
  expect(json.response?.headers.some((h) => h.name.toLowerCase() === 'x-test-server')).toBe(true);
  expect(JSON.parse(json.response!.body!.text!).body.name).toBe('Mihir');
  expect(json.timing?.total).toBeGreaterThanOrEqual(0);
  expect(rows.some((r) => r.response?.status === 302 && r.metadata.redirectUrl)).toBe(true);
  expect(rows.find((r) => r.request.url.endsWith('/api/graphql'))?.metadata.operationName).toBe(
    'Users',
  );
  await expect
    .poll(
      async () =>
        (await records()).find((r) => r.metadata.resourceType === 'WebSocket')?.metadata.messages
          ?.length ?? 0,
    )
    .toBeGreaterThanOrEqual(2);
  const large = (await records()).find((r) => r.request.url.endsWith('/api/large-response'))!;
  expect(large.response?.body?.truncated || !large.response?.body?.available).toBe(true);
  await inspector.getByLabel('Search APIs').fill('');
  await inspector.screenshot({ path: 'test-results/visual/02-traffic-light.png' });
});
test('searches, filters, selects details, and safely renders untrusted responses', async () => {
  await inspector
    .locator('.quick-filters')
    .getByRole('button', { name: 'Errors', exact: true })
    .click();
  await expect(inspector.getByTestId('request-row')).toHaveCount(2);
  await inspector.getByRole('button', { name: 'Filters', exact: true }).click();
  await inspector.getByRole('button', { name: 'Expression', exact: true }).click();
  await inspector
    .getByLabel('Filter expression')
    .fill('status >= 500 OR (method = POST AND url contains "json")');
  await inspector.getByRole('button', { name: 'Apply filter' }).click();
  await expect(inspector.getByTestId('request-row')).toHaveCount(2);
  await inspector.getByLabel('Clear filters').click();
  await inspector.getByLabel('Search APIs').fill('/api/json?original');
  await expect(inspector.getByTestId('request-row')).toHaveCount(1);
  await inspector.getByTestId('request-row').click();
  await expect(inspector.getByLabel('Request details')).toBeVisible();
  await inspector.getByRole('tab', { name: 'Response', exact: true }).click();
  await expect(inspector.getByRole('tabpanel')).toContainText('Mihir');
  await expect(inspector.getByRole('tabpanel')).not.toContainText('"private"');
  await inspector.screenshot({ path: 'test-results/visual/03-response-light.png' });
  await inspector.getByRole('tab', { name: 'Headers', exact: true }).click();
  await expect(inspector.getByRole('tabpanel')).toContainText('Request headers');
  await inspector.getByRole('tab', { name: 'Query', exact: true }).click();
  await expect(inspector.getByRole('tabpanel')).toContainText('original');
});
test('edits URL, headers, query and body, replays in both contexts, and compares results', async () => {
  await inspector.getByRole('tab', { name: 'Replay', exact: true }).click();
  await inspector.getByLabel('Request URL', { exact: true }).fill(base + '/api/json?edited=2');
  await inspector.getByLabel('Replay context', { exact: true }).selectOption('extension');
  await inspector.getByRole('button', { name: 'Body', exact: true }).click();
  await inspector.getByRole('button', { name: 'Reveal secrets', exact: true }).click();
  await inspector
    .getByLabel('Request body', { exact: true })
    .fill('{"name":"Updated","nested":{"id":2}}');
  await inspector.getByRole('button', { name: 'Headers ·', exact: false }).click();
  await inspector.getByRole('button', { name: 'Add row', exact: true }).click();
  await inspector
    .getByLabel(/Request headers key/)
    .last()
    .fill('X-Replayed');
  await inspector
    .getByLabel(/Request headers value/)
    .last()
    .fill('verified');
  await inspector.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(inspector.getByText(/Request replayed · 200/)).toBeVisible();
  let original = (await records()).find((r) => r.request.url.includes('/api/json?original'))!;
  let replay = original.replayHistory!.at(-1)!;
  expect(replay.context).toBe('extension');
  expect(replay.error).toBeUndefined();
  let echo = JSON.parse(replay.response!.body!.text!);
  expect(echo.url).toBe('/api/json?edited=2');
  expect(echo.headers['x-replayed']).toBe('verified');
  expect(echo.body.name).toBe('Updated');
  await inspector.getByLabel('Replay context', { exact: true }).selectOption('browser');
  await inspector.getByLabel('Request URL', { exact: true }).press('Control+Enter');
  await expect
    .poll(async () => (await records()).find((r) => r.id === original.id)?.replayHistory?.length)
    .toBe(2);
  original = (await records()).find((r) => r.id === original.id)!;
  replay = original.replayHistory!.at(-1)!;
  expect(replay.context).toBe('browser');
  expect(replay.error).toBeUndefined();
  echo = JSON.parse(replay.response!.body!.text!);
  expect(echo.headers.cookie).toContain('lab_session');
  await expect(inspector.getByText('Original → replay diff')).toBeVisible();
  await inspector.screenshot({ path: 'test-results/visual/04-replay-light.png' });
});
test('copies cURL and structured data, exports JSON/CSV/Markdown/HAR, and imports a round trip', async () => {
  await inspector.bringToFront();
  await inspector.getByRole('tab', { name: 'Code', exact: true }).click();
  await inspector.getByRole('button', { name: 'Copy code' }).click();
  await expect(inspector.getByText('Copied to clipboard', { exact: true })).toBeVisible();
  const curl = await pasteClipboard();
  expect(curl).toContain('curl');
  expect(curl).toContain('/api/json?original');
  expect(curl).not.toContain('"private"');
  await inspector.getByRole('button', { name: 'Copy everything' }).click();
  const all = JSON.parse(await pasteClipboard());
  expect(all.request.method).toBe('POST');
  let jsonPath = '';
  for (const format of ['JSON', 'CSV', 'Markdown', 'HAR']) {
    console.log('Exporting', format);
    await inspector.locator('.toolbar').getByRole('button', { name: 'Export' }).click();
    await inspector.getByLabel('Export format').selectOption(format);
    if (format === 'JSON') {
      expect(
        (
          await new AxeBuilder({ page: inspector })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await inspector.screenshot({ path: 'test-results/visual/11-export.png' });
    }
    const downloadPromise = inspector.waitForEvent('download');
    await inspector
      .getByRole('dialog')
      .getByRole('button', { name: 'Export', exact: true })
      .click();
    const download = await downloadPromise;
    const path = 'test-results/export.' + (format === 'Markdown' ? 'md' : format.toLowerCase());
    await download.saveAs(path);
    const text = await readFile(path, 'utf8');
    expect(text).not.toContain('"private"');
    if (format === 'JSON') {
      expect(JSON.parse(text).schemaVersion).toBe(1);
      jsonPath = path;
    }
    if (format === 'CSV') expect(text).toContain('"Method","URL"');
    if (format === 'Markdown') expect(text).toContain('| Method | URL |');
    if (format === 'HAR') expect(JSON.parse(text).log.version).toBe('1.2');
  }
  const before = (await state()).count;
  await inspector.getByLabel('Import file').setInputFiles(jsonPath);
  await expect.poll(async () => (await state()).count).toBe(before + 1);
});
test('persists favorites, collections, workspaces and sessions across inspector reloads', async () => {
  await inspector.getByLabel('Close details').click();
  await inspector.getByTestId('request-row').first().click();
  await inspector.getByRole('tab', { name: 'Overview', exact: true }).click();
  await inspector.getByLabel('Save selected request').click();
  await expect(inspector.getByLabel('Unsave selected request')).toBeVisible();
  await inspector.getByLabel('New collection').click();
  await inspector.getByLabel('Name', { exact: true }).fill('Authentication');
  await inspector.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await inspector
    .locator('[data-testid="request-row"][aria-selected="true"]')
    .click({ button: 'right' });
  await inspector.getByRole('menuitem', { name: 'Add to collection' }).click();
  await inspector.getByRole('dialog').getByRole('button', { name: 'Authentication' }).click();
  await expect(inspector.getByText('Requests added to collection', { exact: true })).toBeVisible();
  await inspector.reload();
  await inspector.getByRole('button', { name: 'Saved APIs', exact: true }).click();
  await expect(inspector.getByTestId('request-row')).toHaveCount(1);
  await inspector.getByRole('button', { name: 'New workspace', exact: true }).click();
  await inspector.getByLabel('Name', { exact: true }).fill('Project A');
  await inspector.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await inspector.getByLabel('New session').click();
  await inspector.getByLabel('Name', { exact: true }).fill('Integration session');
  await inspector.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await inspector.reload();
  await expect(inspector.getByLabel('Workspace')).toContainText('Project A');
  await expect(
    inspector.getByRole('button', { name: 'Integration session', exact: true }),
  ).toBeVisible();
});
test('follows the active source tab and excludes background traffic in current-tab mode', async () => {
  await inspector.getByLabel('Capture response bodies').click();
  await expect(inspector.getByLabel('Capture response bodies')).not.toBeChecked();
  const other = await context.newPage();
  await other.goto(base);
  await other.bringToFront();
  const source = await inspector.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0]!.id;
  });
  await expect.poll(async () => (await state()).settings.activeTabId).toBe(source);
  const before = (await state()).count;
  await Promise.all([
    request('/api/users?scope=excluded'),
    other.evaluate(async () => {
      await (await fetch('/api/users?scope=included')).text();
    }),
  ]);
  await expect.poll(async () => (await state()).count).toBe(before + 1);
  const rows = await records();
  expect(rows.some((r) => r.request.url.includes('scope=excluded'))).toBe(false);
  expect(rows.some((r) => r.request.url.includes('scope=included'))).toBe(true);
  await expect
    .poll(() => inspector.evaluate(() => chrome.action.getBadgeText({})))
    .toBe(String((await state()).tabCount));
  await other.close();
  await page.bringToFront();
  await inspector.bringToFront();
});

test('captures across tabs, restores passive capture after worker restart, and handles closed replay tabs', async () => {
  await expect(inspector.getByLabel('Capture response bodies')).not.toBeChecked();
  await inspector.getByRole('button', { name: 'All tabs', exact: true }).click();
  const other = await context.newPage();
  await other.goto(base + '/');
  const before = (await state()).count;
  await Promise.all([
    request('/api/users?tab=one'),
    other.evaluate(async () => {
      await (await fetch('/api/users?tab=two')).text();
    }),
  ]);
  await expect.poll(async () => (await state()).count).toBe(before + 2);
  await stopExtensionWorker(context, extensionId);
  await expect.poll(async () => (await state()).settings.recording).toBe(true);
  await request('/api/users?after=restart');
  await expect
    .poll(async () => (await records()).some((r) => r.request.url.includes('after=restart')))
    .toBe(true);
  const captured = (await records()).find((r) => r.request.url.includes('tab=two'))!;
  await other.close();
  const failure = await inspector.evaluate(
    async (r) =>
      chrome.runtime.sendMessage({
        type: 'replay',
        id: r.id,
        request: r.request,
        context: 'browser',
      }),
    captured,
  );
  expect(failure.ok).toBe(true);
  expect(failure.data.error).toBeTruthy();
  await expectRunningWorker(context, extensionId);
});
test('restores debugger body capture after worker termination', async () => {
  await inspector.getByLabel('Capture response bodies').click();
  await expect.poll(async () => (await state()).attachedTabs.length).toBeGreaterThan(0);
  await stopExtensionWorker(context, extensionId);
  await expect.poll(async () => (await state()).attachedTabs.length).toBeGreaterThan(0);
  await request('/api/json?cdp-worker-restart=1', 'POST', '{"recovered":true}');
  await expect
    .poll(
      async () =>
        (await records()).find((r) => r.request.url.includes('cdp-worker-restart'))?.response?.body
          ?.text,
    )
    .toContain('recovered');
  await inspector.getByLabel('Capture response bodies').click();
  await expect(inspector.getByLabel('Capture response bodies')).not.toBeChecked();
  await expectRunningWorker(context, extensionId);
});

test('renders light/dark/mobile layouts and passes automated accessibility checks', async () => {
  await inspector.getByLabel('Search APIs').fill('');
  await inspector.getByLabel('Open settings').click();
  await inspector.getByRole('button', { name: 'Appearance', exact: true }).click();
  await inspector.getByLabel('Theme', { exact: true }).selectOption('dark');
  await inspector.getByRole('button', { name: 'Save settings' }).click();
  await expect(inspector.locator('html')).toHaveAttribute('data-theme', 'dark');
  await inspector.screenshot({ path: 'test-results/visual/05-dark.png' });
  const accessibility = await new AxeBuilder({ page: inspector })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await inspector.getByRole('button', { name: 'Filters', exact: true }).click();
  expect(
    (
      await new AxeBuilder({ page: inspector })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await inspector.screenshot({ path: 'test-results/visual/06-filter.png' });
  await inspector.getByLabel('Close dialog').click();
  await inspector.getByLabel('Open settings').click();
  expect(
    (
      await new AxeBuilder({ page: inspector })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await inspector.screenshot({ path: 'test-results/visual/07-settings.png' });
  await inspector.getByLabel('Close dialog').click();
  await inspector.setViewportSize({ width: 640, height: 850 });
  await inspector.screenshot({ path: 'test-results/visual/08-mobile.png' });
  expect(await inspector.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await inspector.setViewportSize({ width: 1512, height: 982 });
  expect(errors).toEqual([]);
});
test('remains interactive at 1,000, 5,000 and 10,000 real requests', async () => {
  test.setTimeout(360000);
  if (!(await state()).settings.recording)
    await inspector.getByRole('button', { name: 'Start capture', exact: true }).click();

  const configured = await inspector.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'settings', patch: { maxRequests: 20000 } }),
  );
  expect(configured.ok).toBe(true);
  const before = (await state()).count;
  let generated = 0;
  for (const target of [1000, 5000, 10000]) {
    const started = Date.now();
    while (generated < target) {
      await page.evaluate(async (offset) => {
        await Promise.all(
          Array.from({ length: 50 }, (_, i) =>
            fetch('/api/users?load=' + (offset + i)).then((r) => r.text()),
          ),
        );
      }, generated);
      generated += 50;
    }
    await expect.poll(async () => (await state()).count, { timeout: 90000 }).toBe(before + target);
    await expect
      .poll(
        async () => {
          return inspector.evaluate(async () => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const open = indexedDB.open('api-catcher', 1);
              open.onsuccess = () => resolve(open.result);
              open.onerror = () => reject(open.error);
            });
            const rows = await new Promise<CapturedRequest[]>((resolve, reject) => {
              const all = db.transaction('requests').objectStore('requests').getAll();
              all.onsuccess = () => resolve(all.result);
              all.onerror = () => reject(all.error);
            });
            db.close();
            return rows.filter(
              (r) =>
                r.request.url.includes('/api/users?load=') &&
                r.metadata.state === 'complete' &&
                r.response?.status === 200,
            ).length;
          });
        },
        {
          timeout: 90000,
          message: 'Every generated request must persist its real completed response',
        },
      )
      .toBe(target);
    await inspector.getByLabel('Search APIs').fill('load=');
    await expect(inspector.locator('.status-bar')).toContainText(
      target.toLocaleString('en-US') + ' requests',
      { timeout: 30000 },
    );
    expect(await inspector.getByTestId('request-row').count()).toBeLessThan(50);
    const searchStart = Date.now();
    await inspector.getByLabel('Search APIs').fill('load=' + (target - 1));
    await expect(inspector.getByTestId('request-row')).toHaveCount(1, { timeout: 10000 });
    console.log('Real capture benchmark', {
      requests: target,
      batchMs: Date.now() - started,
      searchMs: Date.now() - searchStart,
    });
  }
  await inspector.getByLabel('Search APIs').fill('load=');
  await expect(inspector.locator('.status-bar')).toContainText('10,000 requests');
  await inspector.screenshot({ path: 'test-results/visual/09-large-session.png' });
});

test('restores workspaces, sessions, records and capture after a full browser restart', async () => {
  const before = (await state()).count;
  await context.close();
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
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  inspector = await context.newPage();
  inspector.on('pageerror', (error) => errors.push(error.message));
  await inspector.goto('chrome-extension://' + extensionId + '/inspector.html');
  await expect(inspector.getByLabel('Workspace')).toContainText('Project A');
  await expect(
    inspector.getByRole('button', { name: 'Integration session', exact: true }),
  ).toBeVisible();
  expect((await state()).count).toBe(before);
  expect((await state()).settings.recording).toBe(true);
  page = await context.newPage();
  await page.goto(base);
  const afterNavigation = (await state()).count;
  await request('/api/users?full-browser-restart=1');
  await expect.poll(async () => (await state()).count).toBe(afterNavigation + 1);
});

test('handles revoked optional site access without pretending capture or replay succeeded', async () => {
  await inspector.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'settings', patch: { recording: false } }),
  );
  const removed = await inspector.evaluate(() =>
    chrome.permissions.remove({ origins: ['http://*/*', 'https://*/*'] }),
  );
  expect(removed).toBe(true);
  const denied = await inspector.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'settings', patch: { recording: true } }),
  );
  expect(denied.ok).toBe(false);
  expect(denied.error).toContain('Grant site access');
  expect((await state()).settings.recording).toBe(false);
  const original = (await records()).find((r) => r.request.url.includes('/api/json?original'))!;
  const replay = await inspector.evaluate(
    async (r) =>
      chrome.runtime.sendMessage({
        type: 'replay',
        id: r.id,
        request: r.request,
        context: 'extension',
      }),
    original,
  );
  expect(replay.ok).toBe(true);
  expect(replay.data.error).toContain('Site access is required');
  expect(replay.data.response).toBeUndefined();
  await inspector.getByLabel('Search APIs').fill('');
  await inspector.getByLabel('Open settings').click();
  await inspector.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(inspector.getByRole('dialog')).toContainText('Site access');
  await inspector.screenshot({ path: 'test-results/visual/10-permission-error.png' });
  expect(errors).toEqual([]);
});
