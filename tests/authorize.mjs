import { chromium } from 'playwright';
import { resolve } from 'node:path';
const context = await chromium.launchPersistentContext(resolve('.browser-profile'), {
  channel: 'chromium',
  executablePath: process.env.API_CATCHER_CHROME,
  headless: false,
  args: ['--disable-extensions-except=' + resolve('dist'), '--load-extension=' + resolve('dist')],
});
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  await page.goto('chrome-extension://' + new URL(worker.url()).host + '/inspector.html');
  await page.getByRole('heading', { name: 'Network requests' }).waitFor();
  const granted = await page.evaluate(() =>
    globalThis.chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] }),
  );
  if (!granted) {
    console.log(
      'Approve the Chrome site-access prompt in this isolated test browser. No personal profile is used.',
    );
    await page.getByRole('button', { name: 'Start capture', exact: true }).click();
    await page.waitForFunction(
      () => globalThis.chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] }),
      null,
      { timeout: 0 },
    );
  }
  await page.evaluate(() =>
    globalThis.chrome.runtime.sendMessage({ type: 'settings', patch: { recording: false } }),
  );
  console.log(
    'Test profile authorized. Run npm run test:e2e. Each run clones this baseline and clears extension fixture data.',
  );
} finally {
  await context.close();
}
