import { makeBody } from '../shared/parse';
import type { TestTransport } from './engine';

/** Page-owned, sequential suite requests. Closing the page cancels the run. */
export const testTransport: TestTransport = async (request, parent) => {
  if (!(await chrome.permissions.contains({ origins: [new URL(request.url).origin + '/*'] })))
    throw new Error('Site access required');
  parent.throwIfAborted();
  const controller = new AbortController(),
    abort = () => controller.abort();
  parent.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 25000),
    started = performance.now();
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers.map((p): [string, string] => [p.name, p.value]),
      body: request.body?.text,
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    const reader = response.body?.getReader(),
      chunks: Uint8Array[] = [];
    let bytes = 0,
      truncated = false;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = Math.max(0, 1_048_576 - bytes);
        chunks.push(value.subarray(0, remaining));
        bytes += Math.min(remaining, value.length);
        if (value.length > remaining) {
          truncated = true;
          await reader.cancel();
          break;
        }
      }
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    const contentType = response.headers.get('content-type') ?? '';
    const binary = /^(image|audio|video|font)\/|octet-stream|application\/pdf/i.test(contentType);
    const decoded = binary
      ? undefined
      : makeBody(new TextDecoder().decode(buffer), contentType, 1_048_576);
    const body = binary
      ? { type: 'binary' as const, encoding: 'base64' as const, available: false, truncated, bytes }
      : { ...decoded!, truncated: truncated || decoded!.truncated };
    return {
      duration: performance.now() - started,
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers].map(([name, value]) => ({ name, value })),
        contentType,
        body,
        size: bytes,
      },
    };
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', abort);
  }
};
