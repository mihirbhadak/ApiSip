import { test, expect, chromium } from '@playwright/test';
import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

test('response capture, XHR suggestions, Enter, deletion and update notices work in Chrome', async () => {
  test.setTimeout(120000);
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(resolve('.tmp/improvements-test-'));
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
    viewport: { width: 1280, height: 950 },
    args: ['--disable-extensions-except=' + resolve('dist'), '--load-extension=' + resolve('dist')],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    const inspector = await context.newPage();
    const errors: string[] = [];
    inspector.on('pageerror', (error) => errors.push(error.message));
    await inspector.goto(`chrome-extension://${id}/inspector.html`);
    const state = () =>
      inspector.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'state' })).data);
    if ((await state()).settings.recording) {
      await inspector.getByRole('button', { name: 'Recording', exact: true }).click();
      await expect(
        inspector.getByRole('button', { name: 'Start capture', exact: true }),
      ).toBeVisible();
    }
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4177');
    await inspector.getByLabel('Open settings').click();
    await inspector.getByRole('tab', { name: 'Privacy & storage', exact: true }).click();
    await inspector.getByRole('button', { name: 'Clear all stored data', exact: true }).click();
    await inspector
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(inspector.getByRole('dialog')).toHaveCount(0);
    // This preference is preserved by clear-all; explicitly exercise the new default mode.
    const responseCapture = inspector.getByLabel('Capture response bodies');
    if (!(await responseCapture.isChecked())) await responseCapture.click();
    await expect(responseCapture).toBeChecked();
    if (!(await state()).settings.recording)
      await inspector.getByRole('button', { name: 'Start capture', exact: true }).click();
    await expect
      .poll(async () => {
        const snapshot = await state();
        return {
          attached: snapshot.attachedTabs.length > 0,
          diagnostics: snapshot.diagnostics.filter(
            (item: { level: string }) => item.level === 'error',
          ),
        };
      })
      .toMatchObject({ attached: true });
    const xhr = (suffix: string) =>
      page.evaluate(
        (suffix) =>
          new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', '/api/users?xhr-regression=' + suffix);
            xhr.onload = () => resolve();
            xhr.onerror = () => reject(new Error('Local XHR failed'));
            xhr.send();
          }),
        suffix,
      );
    await xhr('before-delete');
    await inspector.getByLabel('Search APIs').fill('xhr-regression');
    await expect(inspector.getByTestId('request-row')).toHaveCount(1);
    await inspector.getByTestId('request-row').first().click();
    await inspector.getByRole('tab', { name: 'Response', exact: true }).click();
    await expect(inspector.getByText('Mihir', { exact: false }).first()).toBeVisible();
    await inspector.getByLabel('Close details', { exact: true }).click();
    for (const resource of ['XMLHttpRequest', 'XHR']) {
      await inspector.getByRole('button', { name: 'Filters', exact: true }).click();
      await inspector.getByRole('tab', { name: 'Expression', exact: true }).click();
      await inspector.getByLabel('Filter expression').fill(`resourceType = ${resource}`);
      await inspector.getByLabel('Filter expression').press('Enter');
      await expect(inspector.getByRole('dialog', { name: 'Advanced filters' })).toHaveCount(0);
      await expect(inspector.getByTestId('request-row')).toHaveCount(1);
    }
    await inspector.getByRole('button', { name: 'Filters', exact: true }).click();
    const value = inspector.getByRole('combobox', { name: 'Filter value', exact: true });
    await value.click();
    await expect(inspector.getByRole('option', { name: 'xhr', exact: true })).toBeVisible();
    await expect(inspector.getByRole('option', { name: 'fetch', exact: true })).toBeVisible();
    await value.fill('xhr');
    await value.press('Enter');
    await value.press('Enter');
    await expect(inspector.getByTestId('request-row')).toHaveCount(1);
    await inspector.getByLabel('Clear current session').click();
    await inspector
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    expect((await state()).settings.recording).toBe(true);
    await expect(inspector.getByRole('button', { name: 'Recording', exact: true })).toBeVisible();
    await xhr('after-delete');
    await expect(inspector.getByTestId('request-row')).toHaveCount(1);
    await expect(inspector.getByTestId('request-row')).toContainText('after-delete');
    await expect
      .poll(() => inspector.evaluate(() => chrome.action.getTitle({})))
      .toContain('Recording');
    await inspector.getByRole('button', { name: 'Recording', exact: true }).click();
    await expect
      .poll(() => inspector.evaluate(() => chrome.action.getTitle({})))
      .toContain('Paused');
    // Only the release service is represented by a future fixture. All capture above is real traffic.
    await inspector.evaluate(async () => {
      await chrome.storage.local.set({
        releaseUpdates: {
          checkedAt: Date.now(),
          latest: {
            version: '9.9.9',
            title: 'Test release: capture fixes',
            notes:
              '- Recording continues after deletion.\n- XHR aliases and filter suggestions.\n<script>window.pwned = true</script>',
            url: 'https://github.com/mihirbhadak/ApiSip/releases/tag/v9.9.9',
            downloadUrl:
              'https://github.com/mihirbhadak/ApiSip/releases/download/v9.9.9/apisip-9.9.9.zip',
          },
        },
      });
    });
    await inspector.reload();
    const dialog = inspector.getByRole('dialog', { name: 'ApiSip 9.9.9 is available' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Release notes')).toContainText(
      'Recording continues after deletion',
    );
    expect(await inspector.evaluate(() => 'pwned' in window)).toBe(false);
    expect(
      (
        await new AxeBuilder({ page: inspector })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await mkdir('test-results/visual', { recursive: true });
    await inspector.screenshot({ path: 'test-results/visual/update-notice.png' });
    await dialog.getByRole('button', { name: 'Remind me with the next version' }).click();
    await inspector.reload();
    await expect(inspector.getByRole('heading', { name: 'Network requests' })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
