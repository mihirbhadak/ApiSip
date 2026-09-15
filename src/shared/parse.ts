import type { Body, CapturedRequest, Pair, RequestData } from './model';

export function parseUrl(value: string) {
  const url = new URL(value);
  return {
    domain: url.host,
    path: url.pathname,
    protocol: url.protocol.replace(':', ''),
    query: [...url.searchParams].map(([name, value]) => ({ name, value })),
    hash: url.hash,
  };
}
export const header = (headers: Pair[], name: string) =>
  headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
export function headersFromObject(value: Record<string, string>): Pair[] {
  return Object.entries(value).flatMap(([name, value]) =>
    String(value)
      .split('\n')
      .map((value) => ({ name, value })),
  );
}
export function bodyType(contentType = '', text = ''): Body['type'] {
  if (contentType.includes('graphql')) return 'graphql';
  if (contentType.includes('json')) {
    try {
      if (typeof JSON.parse(text)?.query === 'string') return 'graphql';
    } catch {
      /* incomplete body */
    }
    return 'json';
  }
  if (contentType.includes('x-www-form-urlencoded')) return 'form';
  if (contentType.includes('multipart/form-data')) return 'multipart';
  if (contentType.includes('html')) return 'html';
  if (contentType.includes('xml')) return 'xml';
  if (contentType.startsWith('text/')) return 'text';
  if (/image|audio|video|octet-stream|pdf|font/.test(contentType)) return 'binary';
  try {
    JSON.parse(text);
    return 'json';
  } catch {
    return text ? 'text' : 'unknown';
  }
}
export function makeBody(
  text: string,
  contentType = '',
  maxBytes = 1_048_576,
  base64 = false,
): Body {
  const bytes = base64
    ? Math.floor((text.length * 3) / 4) - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0)
    : new TextEncoder().encode(text).length;
  const truncated = bytes > maxBytes;
  let captured = text;
  if (truncated)
    captured = base64
      ? text.slice(0, Math.floor(maxBytes / 3) * 4)
      : new TextDecoder().decode(new TextEncoder().encode(text).slice(0, maxBytes), {
          stream: true,
        });
  const type = base64 ? 'binary' : bodyType(contentType, captured);
  return {
    type,
    text: captured,
    encoding: base64 ? 'base64' : 'utf8',
    available: true,
    truncated,
    bytes: base64
      ? Math.floor((captured.length * 3) / 4) -
        (captured.endsWith('==') ? 2 : captured.endsWith('=') ? 1 : 0)
      : new TextEncoder().encode(captured).length,
    originalBytes: bytes,
    fields:
      type === 'form'
        ? [...new URLSearchParams(captured)].map(([name, value]) => ({ name, value }))
        : undefined,
  };
}
export const unavailable = (reason: string): Body => ({
  type: 'unknown',
  encoding: 'utf8',
  available: false,
  truncated: false,
  reason,
});
export function normalizeEndpoint(url: string): string {
  const u = new URL(url);
  return (
    u.origin +
    u.pathname
      .split('/')
      .map((p) => (/^\d+$/.test(p) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(p) ? ':id' : p))
      .join('/')
  );
}
export function prettyJson(text: string): string {
  return JSON.stringify(JSON.parse(text), null, 2);
}
export function rawRequest(request: RequestData): string {
  const u = new URL(request.url);
  return (
    request.method +
    ' ' +
    u.pathname +
    u.search +
    ' ' +
    (request.protocol || 'HTTP') +
    '\r\nHost: ' +
    u.host +
    '\r\n' +
    request.headers.map((h) => h.name + ': ' + h.value).join('\r\n') +
    '\r\n\r\n' +
    (request.body?.text ?? '')
  );
}
export const rawResponse = (record: CapturedRequest) =>
  record.response
    ? [
        String(record.response.status) + ' ' + record.response.statusText,
        ...record.response.headers.map((h) => h.name + ': ' + h.value),
        '',
        record.response.body?.text ?? '',
      ].join('\r\n')
    : 'Response unavailable';
export const formatBytes = (n?: number) =>
  n === undefined
    ? '—'
    : n < 1024
      ? n + ' B'
      : n < 1048576
        ? (n / 1024).toFixed(1) + ' KB'
        : (n / 1048576).toFixed(1) + ' MB';
export const formatTime = (n?: number) =>
  n === undefined ? '—' : n >= 1000 ? (n / 1000).toFixed(2) + ' s' : Math.round(n) + ' ms';
export function errorCategory(r: CapturedRequest): string {
  const error = r.metadata.error?.toLowerCase();
  if (error)
    return /block|denied/.test(error)
      ? 'Blocked'
      : /abort|cancel/.test(error)
        ? 'Cancelled'
        : /timeout|timed_out/.test(error)
          ? 'Timeout'
          : 'Network errors';
  return r.response ? Math.floor(r.response.status / 100) + 'xx' : 'Pending';
}
