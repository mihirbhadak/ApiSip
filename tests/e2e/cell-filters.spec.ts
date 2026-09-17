import { test, expect, chromium } from '@playwright/test';
import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

test('cell context actions and double-click filter real captured traffic', async () => {
  test.setTimeout(120000);
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(resolve('.tmp/cell-filters-'));
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
    headless: false,
    viewport: { width: 1512, height: 982 },
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
    if ((await state()).settings.recording)
      await inspector.getByRole('button', { name: 'Recording', exact: true }).click();
    await inspector.getByLabel('Open settings').click();
    await inspector.getByRole('tab', { name: 'Privacy & storage', exact: true }).click();
    await inspector.getByRole('button', { name: 'Clear all stored data', exact: true }).click();
    await inspector
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(inspector.getByRole('dialog')).toHaveCount(0);
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4177');
    const responseCapture = inspector.getByLabel('Capture response bodies');
    if (!(await responseCapture.isChecked())) await responseCapture.click();
    await inspector.getByRole('button', { name: 'Start capture', exact: true }).click();
    await expect.poll(async () => (await state()).attachedTabs.length).toBeGreaterThan(0);
    // Real requests, deliberately ordered so the third displayed row is POST / XHR.
    await page.evaluate(async () => {
      for (const [index, method] of ['GET', 'POST'].entries()) {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open(method, `/api/${method === 'POST' ? 'json' : 'users'}?cell-filter=${index}`);
          xhr.onload = () => resolve();
          xhr.onerror = () => reject(new Error('Local XHR failed'));
          xhr.send(method === 'POST' ? '{"test":"cell filters"}' : null);
        });
      }
      for (const index of [2, 3]) await (await fetch(`/api/users?cell-filter=${index}`)).text();
    });
    await inspector.getByLabel('Search APIs').fill('cell-filter=');
    const rows = inspector.getByTestId('request-row');
    await expect(rows).toHaveCount(4);
    await inspector.getByRole('button', { name: 'Recording', exact: true }).click();
    // Existing OR filter must be preserved as one group when adding the cell predicate.
    await inspector.getByRole('button', { name: 'Filters', exact: true }).click();
    await inspector.getByRole('tab', { name: 'Expression', exact: true }).click();
    await inspector.getByLabel('Filter expression').fill('method = POST OR status = 200');
    await inspector.getByLabel('Filter expression').press('Enter');
    await expect(rows).toHaveCount(4);
    const thirdType = rows.nth(2).locator('[data-column="Type"]');
    await expect(thirdType).toHaveText('XHR');
    await thirdType.click({ button: 'right' });
    const menu = inspector.getByRole('menu', { name: 'Request actions' });
    await expect(
      menu.getByRole('menuitem', { name: 'Add filter: Type = XHR', exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page: inspector })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await mkdir('test-results/visual', { recursive: true });
    await inspector.screenshot({ path: 'test-results/visual/cell-filter-context.png' });
    await menu.getByRole('menuitem', { name: 'Add filter: Type = XHR', exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(rows).toHaveCount(2);
    await expect(inspector.locator('.active-expression')).toContainText('OR');
    await expect(inspector.locator('.active-expression')).toContainText('AND');
    await expect(inspector.locator('.active-expression')).toContainText('resourceType = "xhr"');
    // Use the clicked row, not a previously inspected row or the bulk selection.
    await rows
      .filter({ has: inspector.locator('[data-column="Method"]', { hasText: 'POST' }) })
      .locator('[data-column="Method"]')
      .click({ button: 'right' });
    await inspector
      .getByRole('menuitem', { name: 'Add filter: Method = POST', exact: true })
      .click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('[data-column="Method"]')).toHaveText('POST');
    await inspector.getByLabel('Clear filters', { exact: true }).click();
    await inspector.getByLabel('Close details', { exact: true }).click();
    await expect(rows).toHaveCount(4);
    // A real double-click with a human-sized interval: first click must not move the Type cell.
    await rows.nth(2).locator('[data-column="Type"]').dblclick({ delay: 120 });
    await expect(rows).toHaveCount(2);
    await expect(inspector.locator('.active-expression')).toHaveText('resourceType = "xhr"');
    await expect(inspector.getByLabel('Close details', { exact: true })).toHaveCount(0);
    await rows.first().locator('[data-column="Type"]').dblclick({ delay: 120 });
    await expect(inspector.locator('.active-expression')).toHaveText('resourceType = "xhr"');
    // Single clicks still inspect; then cell keyboard navigation can add another filter.
    await rows.first().locator('[data-column="URL"]').click();
    await expect(inspector.getByLabel('Close details', { exact: true })).toBeVisible();
    await rows.first().locator('[data-column="Type"]').focus();
    await inspector.keyboard.press('ArrowLeft');
    await inspector.keyboard.press('Shift+F10');
    await expect(
      inspector.getByRole('menuitem', { name: 'Add filter: Status = 200', exact: true }),
    ).toBeVisible();
    await inspector.keyboard.press('Enter');
    await expect(inspector.locator('.active-expression')).toContainText('status = "200"');
    await expect(rows).toHaveCount(2);
    await inspector.screenshot({ path: 'test-results/visual/cell-filter-applied.png' });
    await rows.first().locator('[data-column="Method"]').focus();
    await inspector.keyboard.press('ArrowDown');
    await expect(rows.nth(1).locator('[data-column="Method"]')).toBeFocused();
    await inspector.keyboard.press('Enter');
    await expect(inspector.locator('.active-expression')).toContainText('method = "GET"');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('[data-column="Method"]')).toHaveText('GET');
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
