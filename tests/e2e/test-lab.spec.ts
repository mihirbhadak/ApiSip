import { test, expect, chromium, type Page } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await expect(page.getByRole('combobox', { name: label, exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('option', { name: option, exact: true }).click();
}
test('real capture becomes a saved suite with typed chaining, environments, field eyes and verified reports', async () => {
  test.setTimeout(120000);
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(resolve('.tmp/test-lab-'));
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
    const id = new URL(worker.url()).host,
      inspector = await context.newPage(),
      errors: string[] = [];
    await inspector.goto(`chrome-extension://${id}/inspector.html`);
    await inspector.evaluate(async () =>
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
    const runId = crypto.randomUUID();
    await website.evaluate(
      async (id) => (await fetch('/api/users?lab-source=' + id)).text(),
      runId,
    );
    await inspector.getByLabel('Search APIs').fill('lab-source=' + runId);
    await expect(inspector.getByTestId('request-row')).toHaveCount(1);
    await inspector.getByTestId('request-row').click();
    await inspector.getByRole('button', { name: 'Recording', exact: true }).click();
    await inspector.getByRole('tab', { name: 'Security', exact: true }).click();
    await expect(inspector.getByRole('heading', { name: 'Passive security review' })).toBeVisible();
    await inspector.getByRole('button', { name: 'Prepare AI / bug-report context' }).click();
    const sharing = inspector.getByRole('dialog', { name: 'Review context before sharing' });
    await expect(sharing.getByLabel('Shareable API context')).toHaveValue(/untrusted/);
    await inspector.bringToFront();
    const prepared = await sharing.getByLabel('Shareable API context').inputValue();
    await sharing.getByRole('button', { name: 'Copy reviewed context' }).click();
    await expect(sharing.getByRole('status')).toHaveText('Reviewed context copied');
    await sharing.getByLabel('Shareable API context').fill('');
    await sharing.getByLabel('Shareable API context').focus();
    await inspector.keyboard.press('Control+V');
    await expect(sharing.getByLabel('Shareable API context')).toHaveValue(prepared);
    await inspector.keyboard.press('Escape');
    const [lab] = await Promise.all([
      context.waitForEvent('page'),
      inspector.getByRole('button', { name: 'Create test', exact: true }).click(),
    ]);
    lab.on('pageerror', (e) => errors.push(e.message));
    await expect(lab.getByLabel('Suite name')).toHaveValue('My API test');
    await lab.getByLabel('Suite name').fill('User journey');
    await lab.getByLabel('Step URL').fill('http://127.0.0.1:4177/api/users?suite-run=' + runId);
    await lab.getByRole('button', { name: 'Add extraction' }).click();
    await lab.getByLabel('Extraction 1 selector').fill('/users/0/id');
    await lab.getByRole('button', { name: 'New environment', exact: true }).click();
    await lab.getByLabel('Environment name').fill('Local test');
    await lab
      .getByRole('region', { name: 'Environment values', exact: true })
      .getByRole('button', { name: 'Add row' })
      .click();
    await lab.getByLabel('Environment values key 1').fill('runTag');
    await lab.getByLabel('Environment values value 1').fill('guided-suite');
    await lab.getByRole('button', { name: 'Save environment', exact: true }).click();
    await lab.getByRole('button', { name: 'Add blank step' }).click();
    await lab.getByLabel('Step name', { exact: true }).fill('Use extracted user');
    await choose(lab, 'Step method', 'POST');
    await lab.getByLabel('Step URL').fill('http://127.0.0.1:4177/api/json?suite-run=' + runId);
    await lab.getByText('Headers and body · edit request fields', { exact: true }).click();
    await lab
      .getByRole('region', { name: 'Test headers', exact: true })
      .getByRole('button', { name: 'Add row' })
      .click();
    await lab.getByLabel('Test headers key 1').fill('Content-Type');
    await lab.getByLabel('Test headers value 1').fill('application/json');
    await lab
      .getByRole('region', { name: 'Test headers', exact: true })
      .getByRole('button', { name: 'Add row' })
      .click();
    await lab.getByLabel('Test headers key 2').fill('X-Run-Tag');
    await lab.getByLabel('Test headers value 2').fill('{{runTag}}');
    await lab
      .getByLabel('Request body', { exact: true })
      .fill('{"id":"{{userId}}","omit":"must-not-send"}');
    await lab.getByRole('button', { name: 'Send body field $["omit"]', exact: true }).click();
    await lab.getByRole('button', { name: 'Add check' }).click();
    await lab.getByLabel('Check 2 selector').fill('/body/id');
    await choose(lab, 'Check 2 operator', 'equals');
    await lab.getByLabel('Check 2 expected').fill('1');
    await lab.getByRole('button', { name: 'Add check' }).click();
    await lab.getByLabel('Check 3 selector').fill('/body/omit');
    await choose(lab, 'Check 3 operator', 'does not exist');
    const calls = async () =>
      (
        await website.request.get('http://127.0.0.1:4177/api/suite-stats?id=' + runId)
      ).json() as Promise<{ method: string; raw: string; headers: Record<string, string> }[]>;
    expect(await calls()).toHaveLength(0);
    await lab.getByLabel('Suite name').focus();
    await lab.keyboard.press('Control+Enter');
    await expect(lab.getByRole('dialog', { name: 'Review API test suite' })).toBeVisible();
    expect(await calls()).toHaveLength(0);
    await lab.getByRole('button', { name: 'Start suite', exact: true }).click();
    await expect(lab.getByRole('heading', { name: 'Suite passed · 2/2 steps' })).toBeVisible();
    const requests = await calls();
    expect(requests).toHaveLength(2);
    expect(requests.map((r) => r.method)).toEqual(['GET', 'POST']);
    expect(JSON.parse(requests[1]!.raw)).toEqual({ id: 1 });
    expect(requests[1]!.headers['x-run-tag']).toBe('guided-suite');
    const download = lab.waitForEvent('download');
    await lab.getByRole('button', { name: 'JUnit XML' }).click();
    expect(await readFile((await (await download).path())!, 'utf8')).toContain('failures="0"');
    await mkdir('test-results/visual', { recursive: true });
    await lab.getByRole('button', { name: /1\. GET/ }).click();
    await lab.locator('.lab-workspace').evaluate((element) => element.scrollTo(0, 0));
    await lab.screenshot({ path: 'test-results/visual/test-lab-overview.png' });
    for (const theme of ['light', 'dark']) {
      await lab.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      expect(
        (
          await new AxeBuilder({ page: lab })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await lab.screenshot({ path: `test-results/visual/test-lab-${theme}.png` });
    }
    await lab.setViewportSize({ width: 640, height: 1000 });
    expect(await lab.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect((await lab.getByLabel('Step URL').boundingBox())!.width).toBeGreaterThan(250);
    await lab.screenshot({ path: 'test-results/visual/test-lab-mobile.png' });
    await lab.reload();
    await expect(lab.getByLabel('Suite name')).toHaveValue('User journey');
    await choose(lab, 'Test environment', 'Local test');
    await lab.getByRole('button', { name: /1\. GET/ }).click();
    await lab.getByLabel('Check 1 expected').fill('500');
    await lab.getByRole('button', { name: 'Review suite', exact: true }).click();
    await lab.getByRole('button', { name: 'Start suite', exact: true }).click();
    await expect(lab.getByRole('heading', { name: 'Suite failed · 1/2 steps' })).toBeVisible();
    expect(await calls()).toHaveLength(3);
    await lab.getByLabel('Check 1 expected').fill('200');
    await lab
      .getByLabel('Step URL')
      .fill('http://127.0.0.1:4177/api/slow?ms=5000&suite-run=' + runId);
    await lab.getByRole('button', { name: 'Review suite', exact: true }).click();
    await lab.getByRole('button', { name: 'Start suite', exact: true }).click();
    await expect.poll(async () => (await calls()).length).toBe(4);
    await lab.getByRole('button', { name: 'Stop suite', exact: true }).click();
    await expect(lab.getByRole('heading', { name: 'Suite cancelled · 1/2 steps' })).toBeVisible();
    expect(await calls()).toHaveLength(4);
    // Export/import definitions is inert and preserves the two-step workflow.
    const exported = lab.waitForEvent('download');
    await lab.getByRole('button', { name: 'Export suite', exact: true }).click();
    const suiteFile = (await (await exported).path())!;
    await lab.locator('input[type="file"]').setInputFiles(suiteFile);
    await expect(lab.getByText('Unsaved changes', { exact: true })).toBeVisible();
    expect(await calls()).toHaveLength(4);
    await expect(
      lab.getByRole('navigation', { name: 'Suite steps' }).getByRole('button'),
    ).toHaveCount(2);
    await lab.getByLabel('Suite name').fill('Interrupted import');
    await lab.getByRole('button', { name: /1\. GET/ }).click();
    await lab.getByRole('button', { name: 'Review suite', exact: true }).click();
    await lab.getByRole('button', { name: 'Start suite', exact: true }).click();
    await expect.poll(async () => (await calls()).length).toBe(5);
    await expect(lab.getByRole('heading', { name: 'Suite running · 0/2 steps' })).toBeVisible();
    lab.once('dialog', (dialog) => dialog.accept());
    await lab.reload();
    await expect(lab.getByLabel('Suite name')).toHaveValue('Interrupted import');
    await lab.getByRole('button', { name: /^Interrupted import interrupted/ }).click();
    await expect(
      lab.getByRole('heading', { name: /Checkpoint · run may be interrupted/ }),
    ).toBeVisible();
    await expect(lab.getByRole('button', { name: 'Review suite', exact: true })).toBeEnabled();
    // A missing grant is checked before the first request, including after restart.
    await lab.evaluate(() => chrome.permissions.remove({ origins: ['http://*/*', 'https://*/*'] }));
    await choose(lab, 'Test environment', 'Local test');
    await lab.getByRole('button', { name: 'Review suite', exact: true }).click();
    await lab.getByRole('button', { name: 'Start suite', exact: true }).click();
    await expect(lab.getByRole('alert')).toContainText('Grant website access');
    expect(await calls()).toHaveLength(5);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
