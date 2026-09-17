import type { Pair } from '../shared/model';
export type FetchInput = {
  url: string;
  method: string;
  headers: Pair[];
  body?: string;
  maxBytes: number;
  credentials: 'include' | 'omit';
  expectedOrigin?: string;
};
export type FetchOutput = {
  status: number;
  statusText: string;
  headers: Pair[];
  text: string;
  contentType: string;
  bytes: number;
  truncated: boolean;
  binary: boolean;
  duration: number;
  url: string;
};
// Must remain self-contained: Chrome serializes this bundled function into an isolated tab world.
export async function fetchInContext(input: FetchInput): Promise<FetchOutput> {
  if (input.expectedOrigin && location.origin !== input.expectedOrigin)
    throw new Error(
      'The source tab navigated to another origin. Select extension context or capture the request again.',
    );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  const start = performance.now();
  try {
    const headers = new Headers();
    for (const pair of input.headers) headers.append(pair.name, pair.value);
    const response = await fetch(input.url, {
      method: input.method,
      headers,
      body: ['GET', 'HEAD'].includes(input.method) ? undefined : input.body,
      credentials: input.credentials,
      signal: controller.signal,
      redirect: 'follow',
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0,
      truncated = false;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const take = Math.min(value.length, input.maxBytes - bytes);
        if (take) chunks.push(value.slice(0, take));
        bytes += take;
        if (take < value.length) {
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
    const binary = /^(image|audio|video|font)\/|octet-stream|application\/pdf/.test(contentType);
    let text: string;
    if (binary) {
      let data = '';
      for (let i = 0; i < buffer.length; i += 8192)
        data += String.fromCharCode(...buffer.subarray(i, i + 8192));
      text = btoa(data);
    } else text = new TextDecoder().decode(buffer);
    return {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers].map(([name, value]) => ({ name, value })),
      text,
      contentType,
      bytes,
      truncated,
      binary,
      duration: performance.now() - start,
      url: response.url,
    };
  } finally {
    clearTimeout(timeout);
  }
}
