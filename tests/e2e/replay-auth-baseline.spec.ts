import { test, expect, chromium, type Page } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { CapturedRequest, ReplayResult } from '../../src/shared/model';

async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('api-catcher');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const tx = db.transaction(['requests', 'bodies']);
      const read = <T>(input: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          input.onsuccess = () => resolve(input.result);
          input.onerror = () => reject(input.error);
        });
      const rows = (await read(tx.objectStore('requests').getAll())) as CapturedRequest[];
      const bodies = (await read(tx.objectStore('bodies').getAll())) as {
        id: string;
        replays?: ReplayResult[];
      }[];
      return rows.map((r) => ({ ...r, replayHistory: bodies.find((b) => b.id === r.id)?.replays }));
    } finally {
      db.close();
    }
  });
}
async function choose(page: Page, label: string, value: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}
async function launch() {
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(resolve('.tmp/replay-auth-'));
  await cp(resolve('.browser-profile'), profile, {
    recursive: true,
    filter: (path) =>
      !/(?:^|[\\/])(History(?:-journal)?|Service Worker|Cache|Code Cache|GPUCache|Crashpad|SingletonLock|SingletonSocket|SingletonCookie)$/.test(
        path,
      ),
  });
  return chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    executablePath: process.env.API_CATCHER_CHROME,
    headless: process.env.API_CATCHER_HEADLESS === '1',
    viewport: { width: 1512, height: 982 },
    args: ['--disable-extensions-except=' + resolve('dist'), '--load-extension=' + resolve('dist')],
  });
}
test('real cookie login, hidden headers, both contexts, opt-in persistence, token auth and origin binding', async () => {
  test.setTimeout(120000);
  const context = await launch();
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host,
      inspector = await context.newPage();
    await inspector.goto(`chrome-extension://${id}/inspector.html`);
    await inspector.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'settings', patch: { recording: false } }),
    );
    const website = await context.newPage();
    await website.goto('http://127.0.0.1:4177');
    // Login is performed by the test website; never inject cookie storage or captured events.
    expect(
      await website.evaluate(async () => {
        const r = await fetch('/api/auth/login');
        await r.text();
        return r.status;
      }),
    ).toBe(200);
    expect(await website.evaluate(() => document.cookie)).not.toContain('apisip_test_login');
    await inspector.getByRole('button', { name: 'Start capture', exact: true }).click();
    await expect
      .poll(() =>
        inspector.evaluate(
          async () =>
            (await chrome.runtime.sendMessage({ type: 'state' })).data.attachedTabs.length,
        ),
      )
      .toBeGreaterThan(0);
    expect(
      await website.evaluate(async () => {
        const r = await fetch('/api/auth/me?auth-source=1');
        await r.text();
        return r.status;
      }),
    ).toBe(200);
    const original = async () =>
      (await records(inspector)).find((r) => r.request.url.endsWith('/api/auth/me?auth-source=1'));
    await expect.poll(async () => (await original())?.metadata.state).toBe('complete');
    await inspector.getByRole('button', { name: 'Recording', exact: true }).click();
    await inspector.getByLabel('Search APIs').fill('auth-source=1');
    await expect(inspector.getByTestId('request-row')).toHaveCount(1);
    await inspector.getByTestId('request-row').click();
    await inspector.getByRole('tab', { name: 'Replay', exact: true }).click();
    const [editor] = await Promise.all([
      context.waitForEvent('page'),
      inspector.getByRole('button', { name: 'Open in new tab', exact: true }).click(),
    ]);
    const errors: string[] = [];
    editor.on('pageerror', (e) => errors.push(e.message));
    await expect(editor.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
    for (const eye of await editor
      .getByRole('button', { name: /^Send Request headers row/ })
      .all()) {
      if ((await eye.getAttribute('aria-pressed')) === 'true') await eye.click();
    }
    let sent = 0;
    const send = async (status: number) => {
      await editor.getByRole('button', { name: 'Send', exact: true }).click();
      await expect.poll(async () => (await original())?.replayHistory?.length).toBe(++sent);
      const replay = (await original())!.replayHistory!.at(-1)!;
      expect(replay.error).toBeUndefined();
      expect(replay.response?.status).toBe(status);
      return JSON.parse(replay.response!.body!.text!);
    };
    await choose(editor, 'Replay context', 'Browser');
    expect(await send(200)).toMatchObject({ cookieReceived: true, tokenReceived: false });
    await choose(editor, 'Replay context', 'Extension');
    expect(await send(401)).toMatchObject({ cookieReceived: false, loggedIn: false });
    await expect(
      editor.getByText(/The server refused this request. Browser cookies were omitted/),
    ).toBeVisible();
    await choose(editor, 'Browser cookies', 'Use eligible browser cookies');
    await expect(editor.getByText('Draft saved locally', { exact: true })).toBeVisible();
    await editor.reload();
    await expect(editor.getByRole('combobox', { name: 'Browser cookies' })).toHaveValue(
      'Use eligible browser cookies',
    );
    expect(await send(200)).toMatchObject({ cookieReceived: true, tokenReceived: false });
    await choose(editor, 'Replay context', 'Browser');
    await choose(editor, 'Browser cookies', 'Do not send browser cookies');
    expect(await send(401)).toMatchObject({ cookieReceived: false });
    await choose(editor, 'Replay context', 'Extension');
    await editor
      .getByRole('region', { name: 'Request headers', exact: true })
      .getByRole('button', { name: 'Add row' })
      .click();
    const key = editor.getByLabel(/Request headers key/).last(),
      value = editor.getByLabel(/Request headers value/).last();
    await key.fill('Authorization');
    await value.fill('Bearer fixture-test-token');
    expect(await send(200)).toMatchObject({ cookieReceived: false, tokenReceived: true });
    await choose(editor, 'Browser cookies', 'Use eligible browser cookies');
    await editor
      .getByLabel('Request URL', { exact: true })
      .fill('http://localhost:4177/api/auth/me');
    await editor.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
      editor.getByRole('alert').filter({ hasText: 'target origin changed' }),
    ).toBeVisible();
    expect((await original())!.replayHistory).toHaveLength(sent);
    await editor
      .getByLabel('Request URL', { exact: true })
      .fill('http://127.0.0.1:4177/api/redirect');
    await editor.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(async () => (await original())?.replayHistory?.length).toBe(++sent);
    expect((await original())!.replayHistory!.at(-1)!.error).toContain('Redirects are blocked');
    await editor.getByText(/Which context should I use/).click();
    for (const theme of ['light', 'dark']) {
      await inspector.evaluate(
        (theme) => chrome.runtime.sendMessage({ type: 'settings', patch: { theme } }),
        theme,
      );
      await expect(editor.locator('html')).toHaveAttribute('data-theme', theme);
      expect(
        (
          await new AxeBuilder({ page: editor })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await editor.screenshot({ path: `test-results/visual/replay-auth-${theme}.png` });
    }
    await editor.setViewportSize({ width: 640, height: 850 });
    expect(await editor.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      640,
    );
    await editor.screenshot({ path: 'test-results/visual/replay-auth-mobile.png' });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
test('real captured response baseline detects a changed API and ignored branches pass after reload', async () => {
  test.setTimeout(120000);
  const context = await launch();
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host,
      inspector = await context.newPage();
    await inspector.goto(`chrome-extension://${id}/inspector.html`);
    await inspector.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'settings', patch: { recording: false } }),
    );
    const website = await context.newPage();
    await website.goto('http://127.0.0.1:4177');
    await inspector.getByRole('button', { name: 'Start capture', exact: true }).click();
    await expect
      .poll(() =>
        inspector.evaluate(
          async () =>
            (await chrome.runtime.sendMessage({ type: 'state' })).data.attachedTabs.length,
        ),
      )
      .toBeGreaterThan(0);
    await website.evaluate(async () => (await fetch('/api/baseline?baseline-source=1')).text());
    await inspector.getByLabel('Search APIs').fill('baseline-source=1');
    await expect(inspector.getByTestId('request-row')).toHaveCount(1);
    await inspector.getByTestId('request-row').click();
    await inspector.getByRole('button', { name: 'Recording', exact: true }).click();
    const [lab] = await Promise.all([
      context.waitForEvent('page'),
      inspector.getByRole('button', { name: 'Create test', exact: true }).click(),
    ]);
    const errors: string[] = [];
    lab.on('pageerror', (e) => errors.push(e.message));
    await lab.getByText(/Response baseline ·/).click();
    await lab.getByRole('button', { name: 'Read captured response' }).click();
    await lab.getByRole('button', { name: 'Use this baseline' }).click();
    await lab.getByLabel('Baseline name').fill('User response');
    const run = async () => {
      await lab.getByRole('button', { name: 'Review suite', exact: true }).click();
      await lab
        .getByRole('dialog', { name: 'Review API test suite' })
        .getByRole('button', { name: 'Start suite', exact: true })
        .click();
      await expect(lab.getByRole('heading', { name: /Suite (passed|failed)/ })).toBeVisible();
      for (const summary of await lab.locator('.lab-report details:not([open]) > summary').all())
        await summary.click();
    };
    await run();
    await expect(
      lab.getByText('Baseline: JSON structure matches. Scalar values are not compared.'),
    ).toBeVisible();
    await lab.getByLabel('Step URL').fill('http://127.0.0.1:4177/api/baseline?changed=1');
    await run();
    await expect(lab.getByText(/Baseline: 2 structural change/)).toBeVisible();
    await expect(lab.getByText(/Changed \/user\/id: number/)).toBeVisible();
    await lab.getByLabel('Ignored JSON paths (one per line)').fill('/user/id\n');
    await lab.getByLabel('Allow additional fields / array items').check();
    await lab.getByRole('button', { name: 'Save suite', exact: true }).click();
    await lab.reload();
    await lab.getByText(/Response baseline ·/).click();
    await expect(lab.getByLabel('Baseline name')).toHaveValue('User response');
    await expect(lab.getByLabel('Ignored JSON paths (one per line)')).toHaveValue('/user/id');
    await run();
    await expect(
      lab.getByText('Baseline: JSON structure matches. Scalar values are not compared.'),
    ).toBeVisible();
    const [download] = await Promise.all([
      lab.waitForEvent('download'),
      lab.getByRole('button', { name: 'Export suite', exact: true }).click(),
    ]);
    const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(exported.schemaVersion).toBe(2);
    expect(exported.suite.steps[0].baseline.name).toBe('User response');
    expect(JSON.stringify(exported.suite.steps[0].baseline)).not.toContain('Fixture user');
    for (const theme of ['light', 'dark']) {
      await inspector.evaluate(
        (theme) => chrome.runtime.sendMessage({ type: 'settings', patch: { theme } }),
        theme,
      );
      await expect(lab.locator('html')).toHaveAttribute('data-theme', theme);
      expect(
        (await new AxeBuilder({ page: lab }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
      await lab.getByText(/Response baseline ·/).scrollIntoViewIfNeeded();
      await lab.screenshot({ path: `test-results/visual/baseline-${theme}.png` });
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
