import { test, expect, chromium, type Page } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSecureServer, type ServerHttp2Session } from 'node:http2';
import { createHash, X509Certificate } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { CapturedRequest, ReplayResult } from '../../src/shared/model';

async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('api-catcher');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction(['requests', 'bodies']);
      const get = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [rows, bodies] = await Promise.all([
        get(tx.objectStore('requests').getAll()) as Promise<CapturedRequest[]>,
        get(tx.objectStore('bodies').getAll()) as Promise<
          { id: string; replays?: ReplayResult[] }[]
        >,
      ]);
      return rows.map((row) => ({
        ...row,
        replayHistory: bodies.find((b) => b.id === row.id)?.replays,
      }));
    } finally {
      db.close();
    }
  });
}

test('replays real captured HTTP/2 pseudo-headers from a persisted editor in both contexts', async () => {
  test.setTimeout(120000);
  const cert = await readFile('tests/fixtures/localhost-cert.pem');
  const key = await readFile('tests/fixtures/localhost-key.pem');
  const fingerprint = createHash('sha256')
    .update(new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' }))
    .digest('base64');
  const sessions = new Set<ServerHttp2Session>();
  const server = createSecureServer({ cert, key });
  server.on('session', (session) => {
    sessions.add(session);
    session.on('close', () => sessions.delete(session));
  });
  server.on('stream', async (stream, headers) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    if (headers[':path'] === '/') {
      stream.respond({ ':status': 200, 'content-type': 'text/html' });
      stream.end(
        '<!doctype html><html lang="en"><title>ApiSip HTTP/2 lab</title><link rel="icon" href="data:,"><h1>Local HTTP/2 test</h1></html>',
      );
      return;
    }
    stream.respond({
      ':status': 200,
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    stream.end(
      JSON.stringify({ headers, body: Buffer.concat(chunks).toString(), httpVersion: '2' }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP/2 server unavailable');
  const origin = `https://127.0.0.1:${address.port}`;
  await mkdir('.tmp', { recursive: true });
  const profile = await mkdtemp(resolve('.tmp/http2-replay-'));
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
    args: [
      '--disable-extensions-except=' + resolve('dist'),
      '--load-extension=' + resolve('dist'),
      '--ignore-certificate-errors-spki-list=' + fingerprint,
    ],
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
    const page = await context.newPage();
    await page.goto(origin);
    if (!(await inspector.getByLabel('Capture response bodies').isChecked()))
      await inspector.getByLabel('Capture response bodies').click();
    await inspector.getByRole('button', { name: 'Start capture', exact: true }).click();
    await expect.poll(async () => (await state()).attachedTabs.length).toBeGreaterThan(0);
    await page.evaluate(async () => {
      await (
        await fetch('/api/http2-original', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Application': 'preserved' },
          body: '{"message":"original"}',
        })
      ).text();
    });
    const captured = async () =>
      (await records(inspector)).find((r) => r.request.url === origin + '/api/http2-original');
    await expect
      .poll(
        async () => (await captured())?.request.headers.find((h) => h.name === ':authority')?.value,
      )
      .toBe(`127.0.0.1:${address.port}`);
    await expect.poll(async () => (await captured())?.metadata.state).toBe('complete');
    const original = (await captured())!;
    expect(original.request.headers.map((h) => h.name)).toEqual(
      expect.arrayContaining([':authority', ':method', ':path', ':scheme']),
    );
    await inspector.getByRole('button', { name: 'Recording', exact: true }).click();
    await inspector.getByLabel('Search APIs').fill('/api/http2-original');
    await inspector.getByTestId('request-row').first().click();
    await inspector.getByRole('tab', { name: 'Replay', exact: true }).click();
    const [editor] = await Promise.all([
      context.waitForEvent('page'),
      inspector.getByRole('button', { name: 'Open in new tab', exact: true }).click(),
    ]);
    editor.on('pageerror', (error) => errors.push(error.message));
    await expect(editor.getByText(/pseudo-headers.*kept for inspection/)).toBeVisible();
    await editor.getByLabel('Request URL', { exact: true }).fill(origin + '/api/http2-edited?q=2');
    await editor.getByRole('combobox', { name: 'Request method', exact: true }).click();
    await editor.getByRole('option', { name: 'PUT', exact: true }).click();
    await expect(editor.getByText('Draft saved locally', { exact: true })).toBeVisible();
    await editor.reload();
    await expect(editor.getByLabel('Request URL', { exact: true })).toHaveValue(
      origin + '/api/http2-edited?q=2',
    );
    for (const [index, mode] of ['Extension', 'Browser'].entries()) {
      await editor.getByRole('combobox', { name: 'Replay context', exact: true }).click();
      await editor.getByRole('option', { name: mode, exact: true }).click();
      await editor.getByRole('button', { name: 'Send', exact: true }).click();
      await expect.poll(async () => (await captured())?.replayHistory?.length).toBe(index + 1);
      const replay = (await captured())!.replayHistory!.at(-1)!;
      expect(replay.error).toBeUndefined();
      expect(replay.response?.status).toBe(200);
      expect(replay.context).toBe(mode.toLowerCase());
      expect(replay.request.headers.some((h) => h.name.startsWith(':'))).toBe(false);
      expect(replay.warnings.join(' ')).toContain(':authority');
      const echo = JSON.parse(replay.response!.body!.text!);
      expect(echo.httpVersion).toBe('2');
      expect(echo.headers[':method']).toBe('PUT');
      expect(echo.headers[':path']).toBe('/api/http2-edited?q=2');
      expect(echo.headers['x-application']).toBe('preserved');
      expect(JSON.parse(echo.body)).toEqual({ message: 'original' });
      await expect(editor.getByText(/pseudo-headers omitted:/)).toBeVisible();
    }
    expect((await captured())!.request.headers).toEqual(original.request.headers);
    expect(
      (await new AxeBuilder({ page: editor }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await mkdir('test-results/visual', { recursive: true });
    await editor.screenshot({ path: 'test-results/visual/http2-editor.png' });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    for (const session of sessions) session.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
