import { test, expect, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

const site = 'https://mihirbhadak.github.io/ApiSip/';
const endpoint = 'https://mihirbhadak.goatcounter.com/count';
const release = 'https://github.com/mihirbhadak/ApiSip/releases/download/v0.1.4/apisip-0.1.4.zip';

async function serveBuiltWebsite(context: BrowserContext) {
  const measured: { url: URL; headers: Record<string, string> }[] = [];
  // Run the actual generated HTML and bundle at the production origin. Only external
  // transports are replaced: automated CI must not inflate the owner's live counters.
  await context.route(`${site}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const response = await context.request.get(`http://127.0.0.1:4178${path}`);
    await route.fulfill({ response });
  });
  await context.route(`${endpoint}**`, (route) => {
    measured.push({ url: new URL(route.request().url()), headers: route.request().headers() });
    return route.fulfill({
      contentType: 'image/gif',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Analytics transport fixture',
    });
  });
  await context.route(release, (route) =>
    route.fulfill({
      contentType: 'application/zip',
      headers: { 'Content-Disposition': 'attachment; filename="transport-fixture.zip"' },
      body: 'Download transport fixture, not an extension package.',
    }),
  );
  return measured;
}

test('built website uses the owner endpoint, counts each download once and preserves opt-out', async ({
  page,
  context,
}) => {
  const config = JSON.parse(readFileSync('website/config.json', 'utf8')) as {
    analyticsEndpoint: string;
  };
  expect(config.analyticsEndpoint).toBe(endpoint);
  const measured = await serveBuiltWebsite(context);
  const errors: string[] = [];
  const scripts: string[] = [];
  const finished: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfinished', (request) => {
    if (request.url().startsWith(endpoint)) finished.push(request.url());
  });
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto(`${site}?utm_source=linkedin&utm_campaign=launch&token=private-test-value`);
  await expect(page.locator('[data-analytics-notice]')).toContainText('GoatCounter');
  await expect
    .poll(() => measured.filter(({ url }) => url.searchParams.get('p') === '/ApiSip/').length)
    .toBe(1);
  for (const placement of ['nav', 'hero', 'install', 'footer']) {
    const download = page.waitForEvent('download');
    await page.locator(`[data-download="${placement}"]`).click();
    await download;
    await expect(page.getByRole('dialog', { name: 'Happy debugging.' })).toBeVisible();
    await expect
      .poll(
        () =>
          measured.filter(({ url }) => url.searchParams.get('p') === `download_${placement}`)
            .length,
      )
      .toBe(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#install-title')).toBeFocused();
  }
  await expect
    .poll(() => measured.filter(({ url }) => url.searchParams.get('p') === 'install_view').length)
    .toBe(1);
  await page.getByRole('button', { name: 'How to open extensions' }).click();
  await expect(page.getByRole('dialog', { name: 'Open Chrome extensions' })).toBeVisible();
  await expect
    .poll(
      () => measured.filter(({ url }) => url.searchParams.get('p') === 'install_menu_guide').length,
    )
    .toBe(1);
  await page.keyboard.press('Escape');
  // Consume the response too: an unconsumed fetch can remain pending in Chrome,
  // despite returning HTTP 200, and prevent network-idle/performance checks finishing.
  await expect.poll(() => finished.length).toBe(measured.length);
  for (const { url, headers } of measured) {
    expect(`${url.origin}${url.pathname}`).toBe(endpoint);
    expect(url.searchParams.get('r')).toBe('campaign:linkedin/launch');
    expect(url.searchParams.get('b')).toBe('153');
    expect(url.searchParams.has('q')).toBe(false);
    expect(url.href).not.toContain('private-test-value');
    expect(headers.referer).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    if (url.searchParams.get('p') !== '/ApiSip/') expect(url.searchParams.get('e')).toBe('true');
  }
  await page.getByRole('button', { name: 'Turn off website metrics' }).click();
  const countAfterOptOut = measured.length;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Turn on website metrics' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('[data-download="hero"]').click();
  await download;
  await expect(page.getByRole('dialog', { name: 'Happy debugging.' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(measured.length).toBe(countAfterOptOut);
  expect(scripts.every((url) => url.startsWith(`${site}assets/web-site.`))).toBe(true);
  expect(errors).toEqual([]);
});

test('opt-in from another tab starts previously disabled analytics without reloading', async ({
  page,
  context,
}) => {
  const measured = await serveBuiltWebsite(context);
  await page.goto(site);
  await expect.poll(() => measured.length).toBe(1);
  await page.getByRole('button', { name: 'Turn off website metrics' }).click();
  const second = await context.newPage();
  await second.goto(site);
  await expect(second.getByRole('button', { name: 'Turn on website metrics' })).toBeVisible();
  // Let the idle initialization run while this tab is opted out.
  await second.evaluate(
    () => new Promise<void>((resolve) => requestIdleCallback(() => resolve(), { timeout: 1600 })),
  );
  expect(measured.length).toBe(1);
  await page.getByRole('button', { name: 'Turn on website metrics' }).click();
  await expect(second.getByRole('button', { name: 'Turn off website metrics' })).toBeVisible();
  await expect
    .poll(() => measured.filter(({ url }) => url.searchParams.get('p') === '/ApiSip/').length)
    .toBe(2);
  await second.getByRole('button', { name: 'Turn off website metrics' }).click();
  await expect(page.getByRole('button', { name: 'Turn on website metrics' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('apisip-website-metrics-disabled'))).toBe(
    '1',
  );
});
