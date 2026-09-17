import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { testTransport } from '../src/lab/transport';
import { evaluateAssertions } from '../src/lab/assertions';
import type { RequestData } from '../src/shared/model';

let server: Server, origin: string;
let requests = 0;
beforeAll(async () => {
  server = createServer((request, response) => {
    requests++;
    if (request.url === '/redirect') {
      response.writeHead(302, { location: '/target' });
      response.end();
    } else if (request.url === '/binary') {
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      response.end(Buffer.from([0, 255, 12]));
    } else if (request.url === '/invalid-utf8') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end(Buffer.alloc(400000, 255));
    } else if (request.url === '/slow') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.write('waiting');
      const timer = setTimeout(() => response.end('done'), 5000);
      response.on('close', () => clearTimeout(timer));
    } else {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('x'.repeat(1_048_577));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server unavailable');
  origin = 'http://127.0.0.1:' + address.port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
afterEach(() => vi.unstubAllGlobals());
const request = (path: string): RequestData => ({
  method: 'GET',
  url: origin + path,
  headers: [],
  query: [],
});
const grant = (allowed = true) =>
  vi.stubGlobal('chrome', {
    permissions: { contains: async () => allowed },
  });
it('caps real response bytes and treats partial body checks as inconclusive', async () => {
  grant();
  const output = await testTransport(request('/large'), new AbortController().signal);
  expect(output.response.size).toBe(1_048_576);
  expect(output.response.body?.truncated).toBe(true);
  expect(output.response.body?.text?.length).toBe(1_048_576);
  expect(
    evaluateAssertions(
      [{ id: 'c', source: 'body', selector: '', operator: 'contains', expected: 'x' }],
      output.response,
    )[0]!.state,
  ).toBe('inconclusive');
  expect(output.duration).toBeGreaterThan(0);
});
it('does not follow real redirects or expose binary payloads as text', async () => {
  grant();
  const before = requests;
  await expect(testTransport(request('/redirect'), new AbortController().signal)).rejects.toThrow();
  expect(requests).toBe(before + 1);
  const output = await testTransport(request('/binary'), new AbortController().signal);
  expect(output.response.body).toMatchObject({ type: 'binary', available: false, bytes: 3 });
  expect(output.response.body?.text).toBeUndefined();
});
it('preserves truncation when replacement characters expand malformed UTF-8 beyond the text limit', async () => {
  grant();
  const output = await testTransport(request('/invalid-utf8'), new AbortController().signal);
  expect(output.response.size).toBe(400000);
  expect(output.response.body?.truncated).toBe(true);
  expect(output.response.body!.bytes).toBeLessThanOrEqual(1_048_576);
});
it('refuses missing permissions before traffic and aborts in-flight body reads', async () => {
  grant(false);
  const before = requests;
  await expect(testTransport(request('/large'), new AbortController().signal)).rejects.toThrow(
    'Site access',
  );
  expect(requests).toBe(before);
  grant();
  const controller = new AbortController();
  const pending = testTransport(request('/slow'), controller.signal);
  const rejection = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(requests).toBe(before + 1));
  controller.abort();
  await rejection;
});
