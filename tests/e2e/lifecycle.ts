import { expect, type BrowserContext } from '@playwright/test';

/** Stop the exact extension target, as in Chrome's worker-termination testing guide. */
export async function stopExtensionWorker(context: BrowserContext, extensionId: string) {
  const session = await context.browser()!.newBrowserCDPSession();
  try {
    const { targetInfos } = await session.send('Target.getTargets');
    const target = targetInfos.find(
      (item) =>
        item.type === 'service_worker' &&
        item.url.startsWith('chrome-extension://' + extensionId + '/'),
    );
    expect(target, 'The extension worker must be running before termination').toBeDefined();
    const targetId = target!.targetId;
    const result = await session.send('Target.closeTarget', { targetId });
    expect(result.success).toBe(true);
    await expect
      .poll(async () =>
        (await session.send('Target.getTargets')).targetInfos.some(
          (item) => item.targetId === targetId,
        ),
      )
      .toBe(false);
    return targetId;
  } finally {
    await session.detach();
  }
}

/** Chrome can reuse a target ID for a restarted extension worker. */
export async function expectRunningWorker(context: BrowserContext, extensionId: string) {
  const session = await context.browser()!.newBrowserCDPSession();
  try {
    await expect
      .poll(async () =>
        (await session.send('Target.getTargets')).targetInfos.some(
          (item) =>
            item.type === 'service_worker' &&
            item.url.startsWith('chrome-extension://' + extensionId + '/'),
        ),
      )
      .toBe(true);
  } finally {
    await session.detach();
  }
}
