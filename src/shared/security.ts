import type { Body, CapturedRequest, Pair, RequestData } from './model';

export const MASK = '[REDACTED]';
export const sensitiveName = (name: string) =>
  /authorization|cookie|password|passwd|secret|token|api[-_]?key|session|credential|jwt/i.test(
    name,
  );
export function redactText(text: string): string {
  return text
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, '$1 ' + MASK)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, MASK)
    .replace(
      /((?:password|passwd|secret|token|api[-_]?key|session(?:id)?)\s*[=:]\s*)([^&\s,;<]+)/gi,
      '$1' + MASK,
    );
}
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 50) return MASK;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sensitiveName(k) ? MASK : scrub(v, depth + 1)]),
    );
  return typeof value === 'string' ? redactText(value) : value;
}
export function redactBody(text: string, type?: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    const redacted = scrub(parsed);
    return JSON.stringify(parsed) === JSON.stringify(redacted)
      ? text
      : JSON.stringify(redacted, null, 2);
  } catch {
    if (type === 'form')
      return new URLSearchParams(
        [...new URLSearchParams(text)].map(([k, v]) => [
          k,
          sensitiveName(k) ? MASK : redactText(v),
        ]),
      ).toString();
    if (type === 'multipart' || type === 'binary')
      return '[Body omitted: may contain sensitive data]';
    return redactText(text);
  }
}
export function redactUrl(value: string): string {
  try {
    const u = new URL(value);
    let changed = !!u.username || !!u.password;
    if (u.username) u.username = MASK;
    if (u.password) u.password = MASK;
    const pairs = [...u.searchParams].map(
      ([k, v]) => [k, sensitiveName(k) ? MASK : redactText(v)] as [string, string],
    );
    const original = [...u.searchParams];
    if (pairs.some((pair, i) => pair[1] !== original[i]?.[1])) {
      u.search = new URLSearchParams(pairs).toString();
      changed = true;
    }
    const hash = redactText(u.hash);
    if (hash !== u.hash) {
      u.hash = hash;
      changed = true;
    }
    return changed ? u.href : value;
  } catch {
    return redactText(value);
  }
}
export const redactPairs = (pairs: Pair[]) =>
  pairs.map((p) => ({
    name: p.name,
    value: sensitiveName(p.name) ? MASK : redactText(p.value),
  }));
function redactBodyData(body?: Body): Body | undefined {
  return (
    body && {
      ...body,
      text: body.text === undefined ? undefined : redactBody(body.text, body.type),
      fields: body.fields?.map((p) => ({
        ...p,
        value: sensitiveName(p.name) ? MASK : redactText(p.value),
      })),
      reason: body.reason && redactText(body.reason),
    }
  );
}
export function redactRequest(r: RequestData): RequestData {
  return {
    ...r,
    url: redactUrl(r.url),
    headers: redactPairs(r.headers),
    query: redactPairs(r.query),
    cookies: r.cookies?.map((p) => ({ ...p, value: MASK })),
    body: redactBodyData(r.body),
  };
}
export function redactRecord(record: CapturedRequest): CapturedRequest {
  return {
    ...record,
    request: redactRequest(record.request),
    pageUrl: record.pageUrl && redactUrl(record.pageUrl),
    initiator: record.initiator && redactUrl(record.initiator),
    notes: record.notes && redactText(record.notes),
    tags: record.tags.map(redactText),
    metadata: {
      ...record.metadata,
      redirectUrl: record.metadata.redirectUrl && redactUrl(record.metadata.redirectUrl),
      error: record.metadata.error && redactText(record.metadata.error),
      messages: record.metadata.messages?.map((m) => ({ ...m, payload: redactBody(m.payload) })),
    },
    response: record.response && {
      ...record.response,
      headers: redactPairs(record.response.headers),
      cookies: record.response.cookies?.map((p) => ({ ...p, value: MASK })),
      body: redactBodyData(record.response.body),
    },
    replayHistory: record.replayHistory?.map((replay) => ({
      ...replay,
      request: redactRequest(replay.request),
      error: replay.error && redactText(replay.error),
      warnings: replay.warnings.map(redactText),
      response: replay.response && {
        ...replay.response,
        headers: redactPairs(replay.response.headers),
        cookies: replay.response.cookies?.map((p) => ({ ...p, value: MASK })),
        body: redactBodyData(replay.response.body),
      },
    })),
  };
}
export function safeHttpUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only HTTP and HTTPS requests can be replayed.');
  if (url.username || url.password)
    throw new Error('Remove URL credentials and use an Authorization header.');
  return url;
}
export function prepareHeaders(headers: Pair[]) {
  const forbidden =
    /^(accept-charset|accept-encoding|access-control-request-.*|connection|content-length|cookie2?|date|dnt|expect|host|keep-alive|origin|referer|set-cookie|te|trailer|transfer-encoding|upgrade|via|proxy-.*|sec-.*)$/i;
  const omitted: string[] = [];
  const permitted = headers.filter((h) => {
    if (/\r|\n|\0/.test(h.name + h.value))
      throw new Error('Header names and values cannot contain line breaks.');
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(h.name))
      throw new Error('Invalid header name: ' + h.name);
    if (forbidden.test(h.name)) {
      omitted.push(h.name);
      return false;
    }
    return true;
  });
  return {
    headers: permitted,
    warnings: omitted.length
      ? [
          'Browser-controlled headers omitted: ' +
            omitted.join(', ') +
            '. Cookies follow the selected context.',
        ]
      : [],
  };
}
