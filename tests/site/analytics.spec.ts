import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';

const bundle = buildSync({
  entryPoints: ['website/analytics.js'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'ApiSipMetrics',
  define: {
    APISIP_SITE_CONFIG: JSON.stringify({
      analyticsEndpoint: 'https://apisip-test-fixture.goatcounter.com/count',
      allowedCampaigns: ['launch'],
    }),
  },
}).outputFiles[0]!.text;
const html =
  '<!doctype html><html lang="en"><title>Metrics test</title><button data-analytics-toggle hidden>Turn off website metrics</button></html>';

test('configured analytics queues safe events, strips sensitive URL data and supports opt-out', async ({
  page,
}) => {
  const measured: URL[] = [];
  const headers: Record<string, string>[] = [];
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.route('https://mihirbhadak.github.io/ApiSip/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.route('https://apisip-test-fixture.goatcounter.com/count**', (route) => {
    measured.push(new URL(route.request().url()));
    headers.push(route.request().headers());
    return route.fulfill({
      contentType: 'image/gif',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Transport fixture',
    });
  });
  await page.goto(
    'https://mihirbhadak.github.io/ApiSip/?utm_source=linkedin&utm_campaign=launch&token=do-not-send',
  );
  await page.addScriptTag({ content: bundle });
  await page.evaluate(
    'ApiSipMetrics.initializeAnalytics(); ApiSipMetrics.track("download_hero"); ApiSipMetrics.track("private-email@example.com");',
  );
  await expect.poll(() => measured.length).toBe(2);
  expect(measured.map((url) => url.searchParams.get('p')).sort()).toEqual([
    '/ApiSip/',
    'download_hero',
  ]);
  expect(
    measured.find((url) => url.searchParams.get('p') === 'download_hero')?.searchParams.get('e'),
  ).toBe('true');
  for (const url of measured) {
    expect(url.searchParams.get('r')).toBe('campaign:linkedin/launch');
    expect(url.searchParams.has('q')).toBe(false);
    expect(
      [...url.searchParams.keys()].every((key) =>
        ['p', 't', 'r', 'rnd', 'e', 'ns', 'b'].includes(key),
      ),
    ).toBe(true);
  }
  expect(JSON.stringify({ measured, headers })).not.toMatch(/do-not-send|token|private-email/);
  expect(headers.every((header) => !header.referer && !header.cookie)).toBe(true);
  await page.getByRole('button', { name: 'Turn off website metrics' }).click();
  await page.evaluate('ApiSipMetrics.track("coffee_click")');
  expect(measured.length).toBe(2);
  expect(await page.evaluate('localStorage.getItem("apisip-website-metrics-disabled")')).toBe('1');
  await page.getByRole('button', { name: 'Turn on website metrics' }).click();
  await page.evaluate('ApiSipMetrics.track("feedback_continue")');
  await expect.poll(() => measured.length).toBe(3);
  expect(scripts).toEqual([]);
});

for (const preference of ['doNotTrack', 'globalPrivacyControl', 'storedOptOut']) {
  test(`sends no vendor requests when ${preference} is enabled`, async ({ page }) => {
    const outside: string[] = [];
    await page.route('https://mihirbhadak.github.io/ApiSip/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.addInitScript((preference) => {
      if (preference === 'storedOptOut')
        localStorage.setItem('apisip-website-metrics-disabled', '1');
      else
        Object.defineProperty(navigator, preference, {
          value: preference === 'doNotTrack' ? '1' : true,
          configurable: true,
        });
    }, preference);
    page.on('request', (request) => {
      if (!request.url().startsWith('https://mihirbhadak.github.io/')) outside.push(request.url());
    });
    await page.goto('https://mihirbhadak.github.io/ApiSip/');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(
      'ApiSipMetrics.initializeAnalytics(); ApiSipMetrics.track("download_hero");',
    );
    await page.evaluate(
      () => new Promise<void>((resolve) => requestIdleCallback(() => resolve(), { timeout: 1600 })),
    );
    expect(outside).toEqual([]);
    await expect(page.getByRole('button')).toContainText(/off|Turn on/);
  });
}

test('blocked analytics never prevents interaction or creates page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://mihirbhadak.github.io/ApiSip/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  let attempts = 0;
  await page.route('https://apisip-test-fixture.goatcounter.com/count**', (route) => {
    attempts++;
    return route.abort();
  });
  await page.goto('https://mihirbhadak.github.io/ApiSip/');
  await page.addScriptTag({ content: bundle });
  const failed = page.waitForEvent('requestfailed');
  await page.evaluate(
    'ApiSipMetrics.initializeAnalytics(); for(let i=0;i<100;i++) ApiSipMetrics.track("download_hero");',
  );
  await failed;
  await expect.poll(() => attempts).toBe(21); // One pageview plus a bounded pre-initialization queue.
  await page.getByRole('button', { name: 'Turn off website metrics' }).click();
  await expect(page.getByRole('button')).toHaveText('Turn on website metrics');
  expect(errors).toEqual([]);
});
