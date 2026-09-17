import { test, expect, chromium, type Page } from '@playwright/test';
import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { CapturedRequest, ReplayResult } from '../../src/shared/model';

async function captures(page: Page) {
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
      const [records, bodies] = await Promise.all([
        read(tx.objectStore('requests').getAll()) as Promise<CapturedRequest[]>,
        read(tx.objectStore('bodies').getAll()) as Promise<
          { id: string; replays?: ReplayResult[] }[]
        >,
      ]);
      return records.map((record) => ({
        ...record,
        replayHistory: bodies.find((body) => body.id === record.id)?.replays,
      }));
    } finally {
      db.close();
    }
  });
}

test('field eyes exclude real outgoing data and the variable guide creates a verified timed run', async () => {
  test.setTimeout(120000);
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(resolve('.tmp/editor-fields-'));
  await cp(resolve('.browser-profile'), profile, {
    recursive: true,
    filter: (path) =>
      !/(?:^|[\\/])(History(?:-journal)?|Service Worker|Cache|Code Cache|GPUCache|Crashpad|SingletonLock|SingletonSocket|SingletonCookie)$/.test(
        path,
      ),
  });
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    executablePath: process.env.API_CATCHER_CHROME,
    headless: process.env.API_CATCHER_HEADLESS === '1',
    viewport: { width: 1512, height: 982 },
    args: ['--disable-extensions-except=' + resolve('dist'), '--load-extension=' + resolve('dist')],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    const inspector = await context.newPage(),
      errors: string[] = [];
    inspector.on('pageerror', (error) => errors.push(error.message));
    await inspector.goto(`chrome-extension://${id}/inspector.html`);
    const state = () =>
      inspector.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'state' })).data);
    if ((await state()).settings.recording)
      await inspector.getByRole('button', { name: 'Recording', exact: true }).click();
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4177');
    if (!(await inspector.getByLabel('Capture response bodies').isChecked()))
      await inspector.getByLabel('Capture response bodies').click();
    await inspector.getByRole('button', { name: 'Start capture', exact: true }).click();
    await expect.poll(async () => (await state()).attachedTabs.length).toBeGreaterThan(0);
    await page.evaluate(async () =>
      (
        await fetch('/api/json?editor-fields-source=1', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Include': 'keep',
            'X-Exclude': 'hidden-header',
          },
          body: '{"name":"Mihir","drop":"hidden-body","nested":{"omit":42,"keep":true}}',
        })
      ).text(),
    );
    const original = async () =>
      (await captures(inspector)).find((record) =>
        record.request.url.endsWith('/api/json?editor-fields-source=1'),
      );
    await expect.poll(async () => (await original())?.metadata.state).toBe('complete');
    await inspector.getByRole('button', { name: 'Recording', exact: true }).click();
    await inspector.getByLabel('Search APIs').fill('editor-fields-source=1');
    await inspector.getByTestId('request-row').first().click();
    await inspector.getByRole('tab', { name: 'Replay', exact: true }).click();
    const [editor] = await Promise.all([
      context.waitForEvent('page'),
      inspector.getByRole('button', { name: 'Open in new tab', exact: true }).click(),
    ]);
    editor.on('pageerror', (error) => errors.push(error.message));
    const row = editor
      .locator('.pair-edit-row')
      .filter({ has: editor.locator('input[value="X-Exclude" i]') });
    const eye = row.getByRole('button', { name: /^Send Request headers row/ });
    await eye.focus();
    await editor.keyboard.press('Space');
    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    await expect(row.locator('input').nth(1)).toHaveCSS('filter', 'blur(4px)');
    await editor.getByRole('tab', { name: 'Body', exact: true }).click();
    await editor.getByRole('button', { name: 'Send body field $["drop"]', exact: true }).click();
    await editor
      .getByRole('button', { name: 'Send body field $["nested"]["omit"]', exact: true })
      .click();
    await expect(editor.getByLabel('Body field value $["drop"]', { exact: true })).toHaveCSS(
      'filter',
      'blur(4px)',
    );
    await expect(editor.getByText('Draft saved locally', { exact: true })).toBeVisible();
    await editor.reload();
    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    await editor.getByRole('tab', { name: 'Body', exact: true }).click();
    await expect(
      editor.getByRole('button', { name: 'Send body field $["drop"]', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    for (const [index, mode] of ['Extension', 'Browser'].entries()) {
      await editor.getByRole('combobox', { name: 'Replay context', exact: true }).click();
      await editor.getByRole('option', { name: mode, exact: true }).click();
      await editor.getByRole('button', { name: 'Send', exact: true }).click();
      await expect.poll(async () => (await original())?.replayHistory?.length).toBe(index + 1);
      const replay = (await original())!.replayHistory!.at(-1)!;
      expect(replay.error).toBeUndefined();
      const echo = JSON.parse(replay.response!.body!.text!);
      expect(echo.headers['x-exclude']).toBeUndefined();
      expect(echo.headers['x-include']).toBe('keep');
      expect(echo.body).toEqual({ name: 'Mihir', nested: { keep: true } });
    }
    await editor.getByRole('button', { name: 'Send request body', exact: true }).click();
    await editor.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(async () => (await original())?.replayHistory?.length).toBe(3);
    expect(JSON.parse((await original())!.replayHistory!.at(-1)!.response!.body!.text!).body).toBe(
      '',
    );
    await editor.getByRole('button', { name: 'Send request body', exact: true }).click();
    await mkdir('test-results/visual', { recursive: true });
    await editor.screenshot({ path: 'test-results/visual/editor-field-eyes.png' });
    expect(
      (await new AxeBuilder({ page: editor }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    const runId = 'field-guide-' + Date.now();
    await editor
      .getByLabel('Request URL', { exact: true })
      .fill(`http://127.0.0.1:4177/api/load/${runId}?index={{index}}`);
    await editor.getByRole('button', { name: 'Timed run', exact: true }).click();
    await editor.getByLabel('Requests to schedule', { exact: true }).fill('3');
    await editor.getByLabel('Run duration', { exact: true }).fill('1');
    await editor.getByText('Variables & data rows', { exact: true }).click();
    await expect(editor.getByRole('combobox', { name: 'Variable example field' })).toHaveValue(
      'Body $["name"]',
    );
    await editor
      .getByRole('button', { name: 'Insert placeholder & define value', exact: true })
      .click();
    await expect(editor.getByLabel('Run variables key 1', { exact: true })).toHaveValue('bodyName');
    await editor
      .getByLabel('Data rows', { exact: true })
      .fill('[{"bodyName":"Ada"},{"bodyName":"Lin"}]');
    const preview = editor.getByRole('region', { name: 'Variable request preview', exact: true });
    await expect(preview.locator('pre').first()).toContainText('Ada');
    await expect(preview).not.toContainText('hidden-header');
    await expect(preview).not.toContainText('hidden-body');
    const stats = async () =>
      (await context.request.get(`http://127.0.0.1:4177/api/load-stats?id=${runId}`)).json();
    expect((await stats()).count).toBe(0);
    await editor.getByRole('button', { name: 'Back to editor', exact: true }).click();
    await editor.getByRole('tab', { name: 'Body', exact: true }).click();
    await expect(editor.getByLabel('Body field value $["name"]', { exact: true })).toHaveValue(
      '"{{bodyName}}"',
    );
    await editor.getByRole('button', { name: 'Timed run', exact: true }).click();
    await expect(editor.getByLabel('Data rows', { exact: true })).toHaveValue(
      '[{"bodyName":"Ada"},{"bodyName":"Lin"}]',
    );
    await editor.getByRole('button', { name: 'Review run', exact: true }).click();
    expect((await stats()).count).toBe(0);
    await editor
      .getByRole('dialog', { name: 'Start timed run' })
      .getByRole('button', { name: 'Start run', exact: true })
      .click();
    await expect(editor.getByTestId('run-state')).toHaveText('completed');
    const actual = await stats();
    expect(actual.count).toBe(3);
    expect(actual.samples.map((sample: { raw: string }) => JSON.parse(sample.raw))).toEqual([
      { name: 'Ada', nested: { keep: true } },
      { name: 'Lin', nested: { keep: true } },
      { name: 'Ada', nested: { keep: true } },
    ]);
    for (const sample of actual.samples) expect(sample.headers['x-exclude']).toBeUndefined();
    await editor.getByRole('combobox', { name: 'Variable example field' }).scrollIntoViewIfNeeded();
    await editor.screenshot({ path: 'test-results/visual/timed-variable-guide-light.png' });
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
    }
    await editor.screenshot({ path: 'test-results/visual/timed-variable-guide-dark.png' });
    await editor.setViewportSize({ width: 640, height: 850 });
    expect(await editor.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      640,
    );
    await editor.screenshot({ path: 'test-results/visual/timed-variable-guide-mobile.png' });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
