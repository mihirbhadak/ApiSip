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
  let providerLoads = 0;
  await page.route('https://mihirbhadak.github.io/ApiSip/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.route('https://gc.zgo.at/count.js', (route) => {
    providerLoads++;
    return route.fulfill({
      contentType: 'application/javascript',
      body: 'window.measured=[];window.goatcounter.count=(event)=>window.measured.push(event);',
    });
  });
  await page.goto(
    'https://mihirbhadak.github.io/ApiSip/?utm_source=linkedin&utm_campaign=launch&token=do-not-send',
  );
  await page.addScriptTag({ content: bundle });
  await page.evaluate(
    'ApiSipMetrics.initializeAnalytics(); ApiSipMetrics.track("download_hero"); ApiSipMetrics.track("private-email@example.com");',
  );
  await expect.poll(() => page.evaluate('window.measured?.length')).toBe(2);
  const measured = await page.evaluate<Array<Record<string, unknown>>>('window.measured');
  expect(measured[0]).toMatchObject({
    path: '/ApiSip/',
    event: false,
    referrer: 'campaign:linkedin/launch',
  });
  expect(measured[1]).toMatchObject({ path: 'download_hero', event: true });
  expect(JSON.stringify(measured)).not.toMatch(/do-not-send|token|private-email/);
  await page.getByRole('button', { name: 'Turn off website metrics' }).click();
  await page.evaluate('ApiSipMetrics.track("coffee_click")');
  expect(await page.evaluate('window.measured.length')).toBe(2);
  expect(await page.evaluate('localStorage.getItem("apisip-website-metrics-disabled")')).toBe('1');
  await page.getByRole('button', { name: 'Turn on website metrics' }).click();
  await page.evaluate('ApiSipMetrics.track("feedback_continue")');
  expect(await page.evaluate('window.measured.length')).toBe(3);
  expect(providerLoads).toBe(1);
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
  await page.route('https://gc.zgo.at/count.js', (route) => route.abort());
  await page.goto('https://mihirbhadak.github.io/ApiSip/');
  await page.addScriptTag({ content: bundle });
  const failed = page.waitForEvent('requestfailed');
  await page.evaluate(
    'ApiSipMetrics.initializeAnalytics(); for(let i=0;i<100;i++) ApiSipMetrics.track("download_hero");',
  );
  await failed;
  await page.getByRole('button', { name: 'Turn off website metrics' }).click();
  await expect(page.getByRole('button')).toHaveText('Turn on website metrics');
  expect(errors).toEqual([]);
});
