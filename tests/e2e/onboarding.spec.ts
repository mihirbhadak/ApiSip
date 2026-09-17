import { test, expect, chromium } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

test('fresh installation opens permission setup without subscribing to webRequest or starting recording', async () => {
  await mkdir('.tmp', { recursive: true });
  const path = resolve(process.env.API_CATCHER_EXTENSION_PATH || 'dist');
  const context = await chromium.launchPersistentContext(
    await mkdtemp(resolve('.tmp/setup-test-')),
    {
      channel: 'chromium',
      executablePath: process.env.API_CATCHER_CHROME,
      headless: false,
      viewport: { width: 1280, height: 1000 },
      args: [
        '--enable-unsafe-extension-debugging',
        '--disable-extensions-except=' + path,
        '--load-extension=' + path,
      ],
    },
  );
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    await expect
      .poll(() => context.pages().some((page) => page.url().endsWith('#/setup')))
      .toBe(true);
    const page = context.pages().find((page) => page.url().endsWith('#/setup'))!;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByRole('button', { name: 'Allow website access' })).toBeEnabled();
    const state = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'state' }));
    expect(state.data.hostsGranted).toBe(false);
    expect(state.data.passiveReady).toBe(false);
    expect(state.data.settings.recording).toBe(false);
    expect(state.data.settings.provider).toBe('debugger');
    expect(await worker.evaluate(() => typeof chrome.webRequest)).toBe('undefined');
    expect(await page.evaluate(() => chrome.permissions.getAll())).toEqual(
      expect.objectContaining({ origins: [] }),
    );
    const command = (await page.evaluate(() => chrome.commands.getAll())).find(
      (item) => item.name === 'toggle-recording',
    );
    expect(command).toBeDefined();
    expect(
      await page.evaluate(
        () => chrome.runtime.getManifest().commands?.['toggle-recording']?.suggested_key?.default,
      ),
    ).toBe('Alt+Shift+C');
    // Chrome can leave browser shortcuts unassigned (including in automated profiles).
    // The interface must report the actual assignment rather than promise a missing shortcut.
    await expect(page.locator('.setup-shortcut')).toContainText(
      command?.shortcut ? command.shortcut.replaceAll('+', ' + ') : 'Not assigned',
    );
    expect(await page.evaluate(() => chrome.runtime.getManifest().action?.default_icon)).toEqual(
      expect.objectContaining({ 16: 'icons/paused/16.png' }),
    );
    await mkdir('test-results/visual', { recursive: true });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({ path: `test-results/visual/setup-${width}.png` });
    }
    await page.getByRole('button', { name: 'Continue without capture' }).click();
    await expect(page.getByRole('heading', { name: 'Network requests' })).toBeVisible();
    await expect(page.getByLabel('Capture response bodies')).toBeChecked();
    const denied = await page.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'settings', patch: { recording: true } }),
    );
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('Grant site access');
    // Inspect Chrome's own extension error list, not just React console errors.
    const extensions = await context.newPage();
    await extensions.goto('chrome://extensions');
    const native = await extensions.evaluate(async (id) => {
      const browser = chrome as unknown as {
        developerPrivate: {
          getExtensionInfo: (
            id: string,
          ) => Promise<{ runtimeErrors: { message: string }[]; installWarnings: string[] }>;
        };
      };
      return browser.developerPrivate.getExtensionInfo(id);
    }, id);
    expect(native.runtimeErrors).toEqual([]);
    expect(native.installWarnings).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
