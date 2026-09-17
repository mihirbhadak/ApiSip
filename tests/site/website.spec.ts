import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const release = 'https://github.com/mihirbhadak/ApiSip/releases/download/v0.1.6/apisip-0.1.6.zip';
const coffee = 'https://buymeacoffee.com/mihir_bhadak/apisip';

test('loads indexable content, local screenshots and working internal links without page errors', async ({
  page,
}) => {
  const errors: string[] = [];
  const outside: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4178/')) outside.push(request.url());
  });
  await page.goto('./');
  await expect(page).toHaveTitle('ApiSip — Capture, replay & test APIs in Chrome');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your APIs.In full focus.');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://mihirbhadak.github.io/ApiSip/',
  );
  const data = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent())!,
  );
  expect(data.name).toBe('ApiSip');
  expect(data.downloadUrl).toBe(release);
  expect(data.publisher.name).toBe('Mihir Bhadak');
  expect(data.publisher.url).toBe('https://github.com/mihirbhadak');
  for (const name of ['twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt'])
    await expect(page.locator(`meta[name="${name}"]`)).toHaveAttribute('content', /\S/);
  for (const link of await page.locator('a').all())
    await expect(link).toHaveAttribute('title', /\S/);
  for (const image of await page.locator('img').all()) {
    await expect(image).toHaveAttribute('alt', /\S/);
    await expect(image).toHaveAttribute('title', /\S/);
    await expect(image).toHaveAttribute('src', /\S/);
  }
  for (const link of await page.locator('a[href^="#"]').all()) {
    const href = await link.getAttribute('href');
    if (href === '#') continue;
    expect(await page.locator(href!).count(), `missing anchor ${href}`).toBe(1);
  }
  const mainImage = page.locator('#showcase-image');
  expect(
    await mainImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  await page.getByText('Explore the complete feature list').click();
  await expect(page.getByRole('heading', { name: 'Code & control' })).toBeVisible();
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('screenshot tabs work with arrows and enlarged images close with Escape and outside click', async ({
  page,
}) => {
  await page.goto('./');
  const capture = page.getByRole('tab', { name: '01 Capture & inspect' });
  await capture.focus();
  await page.keyboard.press('ArrowRight');
  const editor = page.getByRole('tab', { name: '02 Edit & replay' });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#showcase-image')).toHaveAttribute(
    'src',
    /assets\/web-editor-960\.[a-f0-9]+\.webp$/,
  );
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: '03 Test & measure' })).toBeFocused();
  await page.getByRole('button', { name: 'Take a closer look at the current screenshot' }).click();
  await expect(page.getByRole('dialog', { name: 'Expanded ApiSip screenshot' })).toBeVisible();
  await expect(page.locator('#expanded-image')).toHaveAttribute(
    'src',
    /web-runner-1512\.[a-f0-9]+\.webp$/,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Take a closer look at the current screenshot' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Take a closer look at the current screenshot' }).click();
  await page.mouse.click(2, 2);
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('every download CTA targets the release and opens an optional accessible creator message', async ({
  page,
  context,
}) => {
  // Isolate only the external transfer. Published ZIP bytes are verified after deployment.
  await context.route(release, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/zip',
      headers: { 'Content-Disposition': 'attachment; filename="download-transport-fixture.zip"' },
      body: 'Download transport fixture; this is not an extension package.',
    }),
  );
  await page.goto('./');
  const links = page.locator('[data-download]');
  expect(await links.count()).toBe(4);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('href', release);
    const request = context.waitForEvent('request', {
      predicate: (request) => request.url() === release,
    });
    await link.click();
    await request;
    const dialog = page.getByRole('dialog', { name: 'Happy debugging.' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Buy me a coffee' })).toHaveAttribute(
      'href',
      coffee,
    );
    await expect(dialog.getByRole('img', { name: 'Mihir Bhadak' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close download message' })).toBeFocused();
    await expect(page).toHaveURL(/#install$/);
    const installTop = await page
      .locator('#install')
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(installTop).toBeGreaterThanOrEqual(0);
    expect(installTop).toBeLessThan(130);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#install-title')).toBeFocused();
  }
  await links.first().click();
  await page.getByRole('link', { name: 'Show me the installation guide' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#install-title')).toBeFocused();
  await expect(page).toHaveURL(/#install$/);
  await links.first().click();
  await page.mouse.click(2, 2);
  await expect(page.getByRole('dialog')).toBeHidden();
});

for (const width of [1440, 320]) {
  test(`Chrome menu guide works without clipboard access and is accessible at ${width}px`, async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./#install');
    // Installation must work even when the clipboard API is unavailable.
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        get: () => {
          throw new Error('Clipboard is unavailable');
        },
      }),
    );
    const trigger = page.getByRole('button', { name: 'How to open extensions' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Open Chrome extensions', exact: true });
    const close = dialog.getByRole('button', { name: 'Close extensions guide' });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    await expect(dialog).toContainText('Manage Extensions');
    await expect(dialog).toContainText(
      'Chrome prevents websites from opening its internal pages directly.',
    );
    await expect(dialog.getByRole('listitem')).toHaveCount(4);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await mkdir('test-results/site/visual', { recursive: true });
    await page.screenshot({ path: `test-results/site/visual/extensions-guide-${width}.png` });
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('link', { name: "Google's installation guide" })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await close.click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(/#install$/);
    expect(context.pages()).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}

test('mobile navigation dismisses outside and with Escape and preserves accessible content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const open = page.getByRole('button', { name: 'Open navigation' });
  await open.click();
  await expect(page.locator('#nav-links')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#nav-links')).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await page.locator('.hero-description').click();
  await expect(page.locator('#nav-links')).toBeHidden();
  await open.click();
  await page.getByRole('navigation').getByRole('link', { name: 'Features', exact: true }).click();
  await expect(page.locator('#nav-links')).toBeHidden();
  await expect(page).toHaveURL(/#features$/);
  await page.getByText('Does this capture every browser request?').click();
  await expect(
    page.getByText('No. ApiSip observes supported traffic', { exact: false }),
  ).toBeVisible();
});

test('creator links have correct destinations and external links are protected', async ({
  page,
}) => {
  await page.goto('./');
  const creator = page.locator('.creator-section');
  await expect(creator.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/mihirbhadak',
  );
  await expect(creator.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
    'href',
    'https://www.linkedin.com/in/mihirbhadak/',
  );
  await expect(creator.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
    'href',
    'https://www.instagram.com/mihir_bhadak/',
  );
  await expect(creator.getByRole('link', { name: 'Buy me a coffee' })).toHaveAttribute(
    'href',
    coffee,
  );
  for (const link of await page.locator('a[target="_blank"]').all())
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

for (const width of [1440, 768, 390, 320]) {
  test(`has no horizontal overflow and passes accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./');
    const sizes = await page.evaluate(() => ({
      viewport: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await mkdir('test-results/site/visual', { recursive: true });
    await page.screenshot({
      path: `test-results/site/visual/website-${width}.png`,
      fullPage: true,
    });
  });
}

test('essential content and downloads remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4178/ApiSip/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download for Chrome FREE' })).toHaveAttribute(
      'href',
      release,
    );
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Install', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.install-steps')).toContainText('Extensions → Manage Extensions');
    await expect(page.locator('#show-extensions-guide')).toBeHidden();
    await page.getByText('Is ApiSip free? Do I need an account?').click();
    await expect(page.getByText('All included features are free', { exact: false })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('keeps initial assets small and does not ship a frontend framework or remote fonts', async ({
  page,
}) => {
  await page.goto('./');
  const assets = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return { name: resource.name, bytes: resource.decodedBodySize };
    }),
  );
  const script = assets.find((asset) => /\/web-site\.[a-f0-9]+\.js$/.test(asset.name));
  expect(script?.bytes).toBeGreaterThan(0);
  expect(script!.bytes).toBeLessThan(12_000);
  expect(
    await page
      .locator('head style')
      .evaluate((el) => new TextEncoder().encode(el.textContent ?? '').length),
  ).toBeLessThan(35_000);
  expect(assets.filter((asset) => asset.name.endsWith('.css'))).toHaveLength(0);
  expect(assets.filter((asset) => asset.name.endsWith('.js'))).toHaveLength(1);
  expect(assets.every((asset) => asset.name.startsWith('http://127.0.0.1:4178/'))).toBe(true);
});

test('feedback creates a reviewable GitHub draft and never posts automatically', async ({
  page,
  context,
}) => {
  await context.route('https://github.com/mihirbhadak/ApiSip/issues/new?**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>GitHub draft transport fixture</h1>' }),
  );
  await page.goto('./');
  await page.getByLabel('Short title', { exact: true }).fill('Keep & inspect Unicode: café');
  await page
    .getByLabel('Your feedback', { exact: true })
    .fill('An idea with <script>literal text</script> and an ampersand &.');
  await page.getByLabel('I understand this feedback').check();
  const request = context.waitForEvent('request', {
    predicate: (request) =>
      request.url().startsWith('https://github.com/mihirbhadak/ApiSip/issues/new?'),
  });
  await page.getByRole('button', { name: 'Review on GitHub' }).click();
  const outgoing = await request;
  expect(outgoing.method()).toBe('GET');
  const query = new URL(outgoing.url()).searchParams;
  expect(query.get('title')).toBe('Keep & inspect Unicode: café');
  expect(query.get('body')).toContain('<script>literal text</script>');
  expect(query.get('template')).toBe('feedback.md');
  await expect(page.locator('#feedback-status')).toContainText('Nothing is posted automatically');
});

test('mobile uses a small responsive screenshot and social links remain named without visible text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const image = page.locator('#showcase-image');
  await expect
    .poll(() => image.evaluate((image: HTMLImageElement) => image.currentSrc))
    .toMatch(/capture-480.*webp$/);
  for (const link of await page.locator('.social-links a').all()) {
    await expect(link).toHaveAttribute('aria-label', /Mihir Bhadak/);
    await expect(link.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    expect((await link.textContent())?.trim()).toBe('');
  }
});

test('mobile download dismissal reveals the installation guide and preserves its focus', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.route(release, (route) =>
    route.fulfill({
      contentType: 'application/zip',
      headers: { 'Content-Disposition': 'attachment; filename="fixture.zip"' },
      body: 'Transport fixture',
    }),
  );
  await page.goto('./');
  await page.locator('[data-download="hero"]').click();
  const dialog = page.getByRole('dialog', { name: 'Happy debugging.' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('img', { name: 'Mihir Bhadak', exact: true })
    .evaluate(async (image: HTMLImageElement) => image.decode());
  await expect(dialog.getByRole('link', { name: 'GitHub — Mihir Bhadak' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#install-title')).toBeFocused();
  await expect(page.locator('#install-title')).toBeInViewport();
  await page.screenshot({ path: 'test-results/site/visual/mobile-install-after-download.png' });
});
