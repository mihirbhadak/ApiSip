import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { measureRequest } from '../src/runner/transport';
import { defaultRunConfig } from '../src/runner/model';
let server: Server, origin: string;
beforeAll(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    const delay = Number(url.searchParams.get('delay') ?? 0);
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (url.pathname === '/redirect') {
      response.writeHead(302, { location: '/body' });
      response.end();
      return;
    }
    response.writeHead(Number(url.searchParams.get('status') ?? 200), {
      'content-type': 'text/plain',
    });
    response.flushHeaders();
    if (url.pathname === '/stream') {
      response.write('hello');
      await new Promise((resolve) =>
        setTimeout(resolve, Number(url.searchParams.get('bodyDelay') ?? 60)),
      );
      response.end('world');
    } else response.end('x'.repeat(Number(url.searchParams.get('size') ?? 16)));
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
it('measures real response headers, streamed body time and bytes without retaining the body', async () => {
  const result = await measureRequest(
    { url: origin + '/stream?delay=30', method: 'GET', headers: [] },
    defaultRunConfig,
    new AbortController().signal,
  );
  expect(result.outcome).toBe('ok');
  expect(result.bytes).toBe(10);
  expect(result.headersMs).toBeGreaterThanOrEqual(20);
  expect(result.bodyMs).toBeGreaterThanOrEqual(45);
  expect(result.durationMs).toBeGreaterThanOrEqual(75);
  expect(result).not.toHaveProperty('body');
  expect(result).not.toHaveProperty('text');
});
it('separates timeouts from explicit cancellation and checks status/latency outcomes', async () => {
  const request = {
    url: origin + '/body?delay=300',
    method: 'GET',
    headers: [] as [string, string][],
  };
  const timed = await measureRequest(
    request,
    { ...defaultRunConfig, timeoutMs: 100 },
    new AbortController().signal,
  );
  expect(timed.outcome).toBe('timeout');
  const abort = new AbortController();
  const running = measureRequest(request, defaultRunConfig, abort.signal);
  abort.abort();
  expect((await running).outcome).toBe('cancelled');
  const failed = await measureRequest(
    { ...request, url: origin + '/body?status=500' },
    defaultRunConfig,
    new AbortController().signal,
  );
  expect(failed.outcome).toBe('http-error');
  const slow = await measureRequest(
    { ...request, url: origin + '/body?delay=40' },
    { ...defaultRunConfig, latencyBudgetMs: 10 },
    new AbortController().signal,
  );
  expect(slow.outcome).toBe('latency-failed');
});
it('bounds response reads, rejects redirects and stops a rate-limited body at headers', async () => {
  const request = {
    url: origin + '/body?size=100000',
    method: 'GET',
    headers: [] as [string, string][],
  };
  const limit = await measureRequest(
    request,
    { ...defaultRunConfig, maxResponseBytes: 1024 },
    new AbortController().signal,
  );
  expect(limit.outcome).toBe('body-limit');
  expect(limit.bytes).toBeGreaterThan(1024);
  const redirect = await measureRequest(
    { ...request, url: origin + '/redirect' },
    defaultRunConfig,
    new AbortController().signal,
  );
  expect(redirect.outcome).toBe('redirect-blocked');
  const rateLimited = await measureRequest(
    { ...request, url: origin + '/stream?status=429' },
    defaultRunConfig,
    new AbortController().signal,
  );
  expect(rateLimited.status).toBe(429);
  expect(rateLimited.bytes).toBe(0);
  expect(rateLimited.durationMs).toBeLessThan(60);
});
it('preserves measured partial body time and bytes when a streamed response times out', async () => {
  const result = await measureRequest(
    { url: origin + '/stream?bodyDelay=300', method: 'GET', headers: [] },
    { ...defaultRunConfig, timeoutMs: 100 },
    new AbortController().signal,
  );
  expect(result.outcome).toBe('timeout');
  expect(result.status).toBe(200);
  expect(result.bytes).toBe(5);
  expect(result.headersMs).toBeDefined();
  expect(result.bodyMs).toBeGreaterThan(40);
  expect(result).not.toHaveProperty('body');
});
