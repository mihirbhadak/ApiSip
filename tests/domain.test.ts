import { describe, expect, it } from 'vitest';
import { fixture } from './fixtures';
import {
  httpVersion,
  rawRequest,
  bodyType,
  makeBody,
  normalizeEndpoint,
  parseUrl,
  prettyJson,
} from '../src/shared/parse';
import { compileFilter, globalSearch, safeRegex } from '../src/filters/engine';
import { parseFilter, printFilter } from '../src/filters/parser';
import { structuralDiff } from '../src/shared/diff';
import { defaultExportOptions, exportRecords, importRecords } from '../src/export/formats';
import { codeGenerators, generateCode } from '../src/export/generators';
import { MASK, prepareHeaders, redactRecord, redactUrl, safeHttpUrl } from '../src/shared/security';
import { statistics } from '../src/shared/analytics';
import { badgeText } from '../src/background/badge';

describe('URL and body parsing', () => {
  it('preserves duplicate query params, encoding, ports, hash and protocol', () => {
    expect(parseUrl(fixture().request.url)).toEqual({
      domain: 'example.com:8443',
      path: '/api/users/123',
      protocol: 'https',
      hash: '#part',
      query: [
        { name: 'page', value: '1' },
        { name: 'name', value: 'a b' },
        { name: 'name', value: 'c' },
      ],
    });
  });
  it('normalizes only numeric and UUID segments without changing original URLs', () => {
    expect(normalizeEndpoint(fixture().request.url)).toBe('https://example.com:8443/api/users/:id');
    expect(normalizeEndpoint('https://a.test/users/me')).toBe('https://a.test/users/me');
  });
  it('formats JSON, rejects malformed data and detects GraphQL/form/XML/binary', () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(() => prettyJson('{x')).toThrow();
    expect(bodyType('application/json', '{"query":"query { users }"}')).toBe('graphql');
    expect(bodyType('application/x-www-form-urlencoded')).toBe('form');
    expect(bodyType('application/xml')).toBe('xml');
    expect(bodyType('image/png')).toBe('binary');
  });
  it('bounds multibyte bodies and reports truncation', () => {
    const body = makeBody('é'.repeat(100), 'text/plain', 20);
    expect(body.truncated).toBe(true);
    expect(body.originalBytes).toBe(200);
    expect(body.bytes).toBe(20);
  });
});
describe('filter engine', () => {
  const r = fixture();
  it.each([
    ['method = POST', true],
    ['method != GET', true],
    ['url contains "/api/"', true],
    ['url !contains "secret"', true],
    ['path starts "/api"', true],
    ['path ends "123"', true],
    ['status >= 200 AND status < 400', true],
    ['status > 201', false],
    ['status <= 201', true],
    ['requestHeader.Authorization exists', true],
    ['responseHeader.Missing !exists', true],
    ['queryParam.name = "c"', true],
    ['favorite = false AND tag = auth', true],
    ['requestBody contains "Mihir" AND responseBody contains "123"', true],
    ['domain contains "example" AND (status >= 500 OR timing.total > 100)', true],
    ['NOT (status = 201 OR method = GET)', false],
    ['path regex "^/api/.*"', true],
  ])('%s → %s', (expression, expected) =>
    expect(compileFilter(parseFilter(expression))(r)).toBe(expected),
  );
  it('roundtrips nested groups', () => {
    const ast = parseFilter('method = POST AND (status >= 500 OR NOT tag = test)');
    expect(compileFilter(parseFilter(printFilter(ast)))(r)).toBe(compileFilter(ast)(r));
  });
  it('rejects expensive regex, unknown fields, incomplete expressions and invalid numbers', () => {
    for (const value of ['(a+)+$', 'a+a+', '^a{10000}', '['])
      expect(() => safeRegex(value)).toThrow();
    for (const value of [
      'banana = 2',
      'status > nope',
      'url contains',
      '(status = 2',
      'method = GET status = 2',
    ])
      expect(() => parseFilter(value)).toThrow();
  });
  it('searches decoded params, notes, headers and bodies', () => {
    for (const query of ['a b', 'A note', 'top-secret', 'Mihir', 'auth'])
      expect(globalSearch(r, query)).toBe(true);
  });
});
describe('security and diff', () => {
  it('redacts nested secrets while preserving duplicate headers', () => {
    const r = redactRecord(fixture());
    expect(r.request.headers).toHaveLength(4);
    expect(r.request.headers[1]!.value).toBe(MASK);
    expect(r.request.body!.text).not.toContain('private');
    expect(r.request.body!.text).not.toContain('"secret"');
    expect(fixture().request.body!.text).toContain('private');
    expect(redactUrl('https://a.test?token=abc&token=def&x=1')).not.toContain('abc');
  });
  it('rejects unsafe replay URLs and removes controlled headers', () => {
    expect(() => safeHttpUrl('javascript:alert(1)')).toThrow();
    expect(() => safeHttpUrl('https://user:pass@a.test')).toThrow();
    expect(
      prepareHeaders([
        { name: 'Cookie', value: 'session=1' },
        { name: 'X-Test', value: 'ok' },
      ]).headers,
    ).toEqual([{ name: 'X-Test', value: 'ok' }]);
    expect(() => prepareHeaders([{ name: 'X-Test', value: 'a\r\nInjected: yes' }])).toThrow();
  });
  it('diffs nested JSON, arrays, additions and removals structurally', () => {
    expect(
      structuralDiff(
        { user: { id: 1, old: true }, list: [1] },
        { user: { id: 2, name: 'A' }, list: [1, 2] },
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$["user"]["id"]', kind: 'changed' }),
        expect.objectContaining({ path: '$["user"]["old"]', kind: 'removed' }),
        expect.objectContaining({ path: '$["user"]["name"]', kind: 'added' }),
        expect.objectContaining({ path: '$["list"]["1"]', kind: 'added' }),
      ]),
    );
  });
});
describe('exports and imports', () => {
  it('roundtrips JSON, regenerates IDs and removes stale tab identities', () => {
    const text = exportRecords('JSON', [fixture()], { ...defaultExportOptions, secrets: true });
    const backup = importRecords(text, 'default', 'initial');
    expect(backup.requests[0]!.request).toEqual(fixture().request);
    expect(backup.requests[0]!.id).not.toBe(fixture().id);
    expect(backup.requests[0]!.tabId).toBeUndefined();
  });
  it('exports conservative redaction and respects include-body choices in replay history', () => {
    const text = exportRecords('JSON', [fixture()]);
    expect(text).not.toContain('top-secret');
    expect(text).not.toContain('private');
    const omitted = exportRecords('JSON', [fixture()], {
      ...defaultExportOptions,
      requestBody: false,
    });
    expect(omitted).not.toContain('Mihir\\",');
    expect(omitted).toContain('excluded from export');
  });
  it('quotes CSV, guards formulas and emits safe Markdown', () => {
    const row = fixture({ notes: '=HYPERLINK("bad")\nline' });
    expect(exportRecords('CSV', [row])).toContain('"\'=HYPERLINK(""bad"")\nline"');
    expect(exportRecords('Markdown', [row])).toContain('| POST |');
  });
  it('roundtrips available HAR data', () => {
    const result = importRecords(
      exportRecords('HAR', [fixture()], { ...defaultExportOptions, secrets: true }),
      'default',
      'initial',
    );
    expect(result.requests[0]!.response!.status).toBe(201);
    expect(result.requests[0]!.response!.body!.text).toBe(fixture().response!.body!.text);
  });
  it('rejects malformed and future-version backups', () => {
    for (const text of [
      '{',
      '{"schemaVersion":2}',
      '{"log":{"entries":[{}]}}',
      '{"schemaVersion":1,"exportedAt":0,"entities":[],"requests":[{}]}',
    ])
      expect(() => importRecords(text, 'w', 's')).toThrow();
  });
});
describe('code generators', () => {
  it.each(codeGenerators.map((g) => [g.name, g] as const))(
    '%s produces a representative request and redacts secrets',
    (_name, generator) => {
      const code = generator.generate(fixture().request);
      expect(code).toContain('/api/users/123');
      expect(code).toContain('POST');
      expect(code).toContain('Content-Type');
      expect(code).not.toContain('top-secret');
      expect(code.length).toBeGreaterThan(80);
    },
  );
  it('escapes bash single quotes and blocks multiline CMD headers', () => {
    const r = fixture().request;
    r.headers = [{ name: 'X-Test', value: "it's safe" }];
    expect(generateCode('Bash cURL', r)).toContain("'\\''");
    r.headers[0]!.value = 'line\nline';
    expect(() => generateCode('Windows CMD cURL', r)).toThrow();
  });
  it('keeps HTTPie stdin enabled for bodies', () =>
    expect(generateCode('HTTPie', fixture().request)).not.toContain('--ignore-stdin'));
});
it('computes meaningful analytics and bounds badge text', () => {
  expect(statistics([fixture()])).toMatchObject({
    total: 1,
    p50: 120,
    p95: undefined,
    p99: undefined,
    transfer: 500,
  });
  expect(badgeText(0)).toBe('0');
  expect(badgeText(1000)).toBe('999+');
});

it('does not invent a wire protocol from the captured URL scheme', () => {
  expect(httpVersion('https')).toBe('');
  expect(httpVersion('http')).toBe('');
  expect(httpVersion('h2')).toBe('HTTP/2');
  expect(httpVersion('http/1.1')).toBe('HTTP/1.1');
  const record = fixture();
  record.request.protocol = 'https';
  expect(rawRequest(record.request)).toContain('[HTTP version unavailable]');
  const har = JSON.parse(exportRecords('HAR', [record]));
  expect(har.log.entries[0].request.httpVersion).toBe('');
  expect(har.log.entries[0].response.httpVersion).toBe('');
});
