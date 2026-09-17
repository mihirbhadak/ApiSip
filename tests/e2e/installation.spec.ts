import { test, expect, chromium } from '@playwright/test';
import { access, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stopExtensionWorker, expectRunningWorker } from './lifecycle';

test('loads the project root as an unpacked extension and opens the built inspector', async () => {
  await access(resolve('manifest.json'));
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(resolve('.tmp/root-install-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    executablePath: process.env.API_CATCHER_CHROME,
    headless: false,
    viewport: { width: 1512, height: 982 },
    args: [
      '--enable-unsafe-extension-debugging',
      '--disable-extensions-except=' + resolve('.'),
      '--load-extension=' + resolve('.'),
    ],
  });
  try {
    const session = await context.browser()!.newBrowserCDPSession();
    const { extensions } = await session.send('Extensions.getExtensions');
    const installed = extensions.find((item) => resolve(item.path) === resolve('.'));
    expect(installed?.enabled).toBe(true);
    const extensionId = installed!.id;
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4177');
    await page.bringToFront();
    const { targetInfos } = await session.send('Target.getTargets', { filter: [{ type: 'tab' }] });
    const target = targetInfos.find((item) => item.url === page.url());
    expect(target).toBeDefined();
    await expect
      .poll(() => context.pages().some((page) => page.url().endsWith('#/setup')))
      .toBe(true);
    // Registry.enabled precedes initial worker/listener registration. Wait for the
    // actual installation to finish before dispatching Chrome's automated action.
    await expect
      .poll(async () => {
        const worker = context
          .serviceWorkers()
          .find((item) => item.url().startsWith('chrome-extension://' + extensionId + '/'));
        return worker ? worker.evaluate(() => chrome.action.onClicked.hasListeners()) : false;
      })
      .toBe(true);
    const [inspector] = await Promise.all([
      context.waitForEvent('page', { timeout: 15000 }),
      session.send('Extensions.triggerAction', { id: extensionId, targetId: target!.targetId }),
    ]);
    const errors: string[] = [];
    inspector.on('pageerror', (error) => errors.push(error.message));
    await expect(inspector).toHaveURL('chrome-extension://' + extensionId + '/dist/inspector.html');
    await expect(inspector.getByRole('heading', { name: 'Network requests' })).toBeVisible();
    await expect(
      inspector.getByRole('button', { name: 'Start capture', exact: true }),
    ).toBeVisible();
    const state = await inspector.evaluate(() => chrome.runtime.sendMessage({ type: 'state' }));
    expect(state.ok).toBe(true);
    const manifest = await inspector.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.background).toEqual({
      service_worker: 'dist/service-worker.js',
      type: 'module',
    });
    expect(state.data.buildId).toBe(
      JSON.parse(await readFile('dist/build-info.json', 'utf8')).buildId,
    );
    // The root manifest also resolves the real offscreen host under dist.
    await inspector.evaluate(async () => {
      await chrome.offscreen.createDocument({
        url: 'dist/offscreen.html',
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: 'Verify the bundled timed runner host loads from the root installation.',
      });
    });
    const host = await inspector.evaluate(() =>
      chrome.runtime.sendMessage({ target: 'load-host', action: 'status' }),
    );
    expect(host).toEqual({ ok: true, report: null });
    expect(
      (await inspector.evaluate(() => chrome.runtime.sendMessage({ type: 'runner-release' }))).ok,
    ).toBe(true);
    await mkdir('test-results/visual', { recursive: true });
    await inspector.screenshot({ path: 'test-results/visual/12-root-install.png' });
    const editor = await context.newPage();
    editor.on('pageerror', (error) => errors.push(error.message));
    await editor.goto(inspector.url() + '#/editor/missing-draft');
    await expect(editor.getByRole('alert')).toContainText('Draft not found');
    await editor.getByRole('banner').getByRole('button', { name: 'Open inspector' }).click();
    await expect.poll(() => inspector.evaluate(() => document.hasFocus())).toBe(true);
    await session.send('Extensions.triggerAction', { id: extensionId, targetId: target!.targetId });
    await expect.poll(() => inspector.evaluate(() => document.hasFocus())).toBe(true);
    expect(context.pages().filter((item) => item.url() === inspector.url())).toHaveLength(1);
    await editor.close();
    expect(errors).toEqual([]);
    // A later click must also wake a stopped worker without a readiness aid.
    await inspector.close();
    await page.bringToFront();
    await stopExtensionWorker(context, extensionId);
    const [reopened] = await Promise.all([
      context.waitForEvent('page', { timeout: 15000 }),
      session.send('Extensions.triggerAction', { id: extensionId, targetId: target!.targetId }),
    ]);
    await expect(reopened).toHaveURL('chrome-extension://' + extensionId + '/dist/inspector.html');
    await expect(reopened.getByRole('heading', { name: 'Network requests' })).toBeVisible();
    await expectRunningWorker(context, extensionId);
    await session.detach();
  } finally {
    await context.close();
  }
});
