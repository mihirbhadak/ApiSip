import { describe, expect, it } from 'vitest';
import { prepareHeaders } from '../src/shared/security';
import { generateCode, languages } from '../src/export/generators';
import { compileRunRequest } from '../src/runner/templates';
import { defaultRunConfig } from '../src/runner/model';
import { fixture } from './fixtures';

const pseudoHeaders = [
  { name: ':authority', value: 'original.example.test' },
  { name: ':method', value: 'GET' },
  { name: ':path', value: '/original' },
  { name: ':scheme', value: 'https' },
  { name: ':protocol', value: 'websocket' },
  { name: ':status', value: '200' },
];

describe('captured HTTP pseudo-headers', () => {
  it('omits protocol metadata with a warning without mutating captured headers', () => {
    const headers = [
      ...pseudoHeaders,
      { name: 'Cookie', value: 'session=secret' },
      { name: 'Authorization', value: 'Bearer secret' },
      { name: 'X-Test', value: 'one' },
      { name: 'X-Test', value: 'two' },
    ];
    const before = structuredClone(headers);
    const prepared = prepareHeaders(headers);
    expect(prepared.headers).toEqual(headers.slice(7));
    expect(headers).toEqual(before);
    expect(prepared.warnings.join(' ')).toContain('HTTP/2 and HTTP/3');
    expect(prepared.warnings.join(' ')).toContain(':authority');
    expect(prepared.warnings.join(' ')).toContain('URL and method');
    expect(prepared.warnings.join(' ')).not.toContain('secret');
    expect(
      () => new Headers(prepared.headers.map(({ name, value }): [string, string] => [name, value])),
    ).not.toThrow();
  });

  it.each(['bad:name', ':unknown', '::authority', ':Authority', 'bad name', ''])(
    'still rejects an invalid ordinary header name %j',
    (name) => expect(() => prepareHeaders([{ name, value: 'x' }])).toThrow('Invalid header name'),
  );

  it.each(['injected\r\nX-Evil: yes', 'bad\0value'])(
    'validates control characters even in an omitted field',
    (value) => expect(() => prepareHeaders([{ name: ':authority', value }])).toThrow(),
  );

  it.each(languages)(
    'omits pseudo-headers from %s while keeping application headers',
    (language) => {
      const request = fixture().request;
      request.headers.unshift(...pseudoHeaders);
      const code = generateCode(language, request);
      for (const { name } of pseudoHeaders) expect(code).not.toContain(name);
      expect(code).toContain('X-Test');
      expect(request.headers[0]).toEqual(pseudoHeaders[0]);
    },
  );

  it('uses the edited URL/method and header variables for timed runs', () => {
    const request = fixture().request;
    request.url = 'https://edited.example.test/run?index={{index}}';
    request.headers = [...pseudoHeaders, { name: 'X-Index', value: '{{index}}' }];
    const compiled = compileRunRequest({
      sourceId: 'test',
      request,
      config: defaultRunConfig,
      variables: [],
      rows: [],
      seed: 1,
    });
    expect(compiled.render(1)).toMatchObject({
      url: 'https://edited.example.test/run?index=2',
      method: 'POST',
      headers: [['X-Index', '2']],
    });
    expect(compiled.warnings.join(' ')).toContain(':authority');
  });
});
