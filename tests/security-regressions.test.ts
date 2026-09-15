import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { redactBody, redactRecord, redactUrl, prepareHeaders } from '../src/shared/security';
import { makeBody } from '../src/shared/parse';
import { statistics } from '../src/shared/analytics';
import { fixture } from './fixtures';
import { importRecords } from '../src/export/formats';
describe('trust-boundary regressions', () => {
  it('requires debugger in the manifest and keeps hosts optional', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8')) as {
      permissions: string[];
      optional_permissions?: string[];
      host_permissions?: string[];
      optional_host_permissions: string[];
      content_security_policy: { extension_pages: string };
    };
    expect(manifest.permissions).toContain('debugger');
    expect(manifest.optional_permissions ?? []).not.toContain('debugger');
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.optional_host_permissions).toContain('https://*/*');
    expect(manifest.content_security_policy.extension_pages).not.toContain('unsafe-eval');
  });
  it('does not alter nonsecret URL encoding or JSON formatting when masking', () => {
    const url = 'https://example.test/?name=a%20b&x=%2F&name=c';
    expect(redactUrl(url)).toBe(url);
    const json = '{"name":"Mihir","value":1}';
    expect(redactBody(json, 'json')).toBe(json);
  });
  it('masks cookies and diagnostic strings inside replay history', () => {
    const record = fixture();
    record.replayHistory = [
      {
        id: 'replay',
        timestamp: 0,
        context: 'extension',
        request: record.request,
        duration: 1,
        error: 'token=abc',
        warnings: ['Bearer abc'],
        response: {
          status: 200,
          statusText: 'OK',
          headers: [],
          cookies: [{ name: 'id', value: 'private-cookie' }],
        },
      },
    ];
    const text = JSON.stringify(redactRecord(record));
    expect(text).not.toContain('private-cookie');
    expect(text).not.toContain('token=abc');
  });
  it('does not exceed byte limits when a UTF-8 character crosses the boundary', () => {
    const body = makeBody('aé', 'text/plain', 2);
    expect(body.bytes).toBeLessThanOrEqual(2);
    expect(body.truncated).toBe(true);
    expect(body.text).toBe('a');
  });
  it('handles prototype-like untrusted resource type names', () => {
    const stats = statistics([
      fixture({ metadata: { provider: 'import', resourceType: '__proto__', state: 'complete' } }),
    ]);
    expect(stats.types).toEqual([['__proto__', 1]]);
  });
  it('rejects unsafe imported URLs and header control characters on replay', () => {
    const r = fixture();
    r.request.url = 'javascript:alert(1)';
    expect(() =>
      importRecords(
        JSON.stringify({ schemaVersion: 1, exportedAt: 0, entities: [], requests: [r] }),
        'w',
        's',
      ),
    ).toThrow();
    expect(() => prepareHeaders([{ name: 'X-Test', value: 'abc\0x' }])).toThrow();
  });
});
