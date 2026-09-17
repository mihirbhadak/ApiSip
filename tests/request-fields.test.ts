import { describe, expect, it } from 'vitest';
import {
  bodyFieldEnabled,
  bodyFields,
  materializeRequest,
  setBodyField,
} from '../src/shared/request-fields';
import { makeBody } from '../src/shared/parse';
import { requestSchema } from '../src/shared/model';
import { redactRequest } from '../src/shared/security';
import { compileRunRequest } from '../src/runner/templates';
import { defaultRunConfig } from '../src/runner/model';
import { insertVariable, uniqueVariableName, variableFields } from '../src/runner/variable-guide';
import { generateCode, languages } from '../src/export/generators';
import { fixture } from './fixtures';
import { clearDatabase, saveRecords } from '../src/storage/repository';
import { createDraft, getDraft } from '../src/storage/drafts';

describe('request inclusion', () => {
  it('preserves duplicate header rows and original values while omitting only disabled rows', () => {
    const draft = fixture().request;
    draft.headers[2]!.enabled = false;
    const before = structuredClone(draft);
    expect(materializeRequest(draft).headers.filter((h) => h.name === 'X-Test')).toEqual([
      { name: 'X-Test', value: 'two' },
    ]);
    expect(draft).toEqual(before);
    expect(redactRequest(draft).headers[2]!.enabled).toBe(false);
    expect(requestSchema.parse(draft).headers[2]!.enabled).toBe(false);
  });
  it('removes nested properties and original array indices without replacing them with null', () => {
    const request = fixture().request;
    request.body = {
      ...makeBody(
        '{"name":"keep","nested":{"drop":1,"keep":true},"list":[1,2,3],"__proto__":{"drop":1,"ok":2}}',
        'application/json',
      ),
      excludedPaths: [
        ['nested', 'drop'],
        ['list', 0],
        ['list', 2],
        ['__proto__', 'drop'],
      ],
    };
    const projected = materializeRequest(request);
    expect(JSON.parse(projected.body!.text!)).toEqual(
      JSON.parse('{"name":"keep","nested":{"keep":true},"list":[2],"__proto__":{"ok":2}}'),
    );
    expect(projected.body!.bytes).toBe(new TextEncoder().encode(projected.body!.text).length);
    expect(request.body.text).toContain('"drop"');
    expect(projected.body!.excludedPaths).toBeUndefined();
  });
  it('supports whole-body exclusion and refuses to send malformed JSON with pending exclusions', () => {
    const request = fixture().request;
    request.body = { ...makeBody('{broken', 'application/json'), excludedPaths: [['name']] };
    expect(() => materializeRequest(request)).toThrow('valid JSON');
    request.body.enabled = false;
    expect(materializeRequest(request).body).toBeUndefined();
  });
  it('removes individual duplicate form fields using their original row index', () => {
    const request = fixture().request;
    request.body = {
      ...makeBody('name=one&name=two&symbol=a%26b+c', 'application/x-www-form-urlencoded'),
      excludedPaths: [[0]],
    };
    expect([...new URLSearchParams(materializeRequest(request).body!.text)]).toEqual([
      ['name', 'two'],
      ['symbol', 'a&b c'],
    ]);
    expect(bodyFields(request.body).fields).toHaveLength(3);
  });
  it('does not require variables used only by excluded fields and supports encoded form placeholders', () => {
    const request = fixture().request;
    request.headers = [{ name: 'Invalid:Name', value: '{{missing}}\r\n', enabled: false }];
    request.body = {
      ...makeBody('keep={{name}}&drop={{missing}}', 'application/x-www-form-urlencoded'),
      excludedPaths: [[1]],
    };
    const compiled = compileRunRequest({
      sourceId: 's',
      request,
      variables: [{ name: 'name', value: 'a&b c' }],
      rows: [],
      config: defaultRunConfig,
      seed: 1,
    });
    expect(compiled.render(0)).toMatchObject({ headers: [], body: 'keep=a%26b%20c' });
  });
  it('retains field selections and values after saving/reopening a draft', async () => {
    await clearDatabase();
    await saveRecords([fixture()]);
    const request = fixture().request;
    request.headers[2]!.enabled = false;
    request.body!.excludedPaths = [['name']];
    const saved = await createDraft('test-1', request, 'extension');
    expect((await getDraft(saved.id))!.request).toEqual(request);
  });
  it.each(languages)('omits excluded headers/body values from %s', (language) => {
    const request = fixture().request;
    request.headers = [{ name: 'X-Excluded', value: 'hidden-header', enabled: false }];
    request.body = {
      ...makeBody('{"omit":"hidden-body","keep":"included"}', 'application/json'),
      excludedPaths: [['omit']],
    };
    const code = generateCode(language, request, true);
    expect(code).not.toContain('hidden-header');
    expect(code).not.toContain('hidden-body');
    expect(code).toContain('included');
  });
  it('bounds field inventories and respects excluded ancestors', () => {
    const body = makeBody(
      JSON.stringify({ parent: { child: 1 }, list: Array.from({ length: 1000 }, (_, i) => i) }),
      'application/json',
    );
    body.excludedPaths = [['parent']];
    expect(bodyFieldEnabled(body, ['parent', 'child'])).toBe(false);
    expect(bodyFields(body).fields).toHaveLength(300);
    expect(bodyFields(body).note).toContain('300');
  });
});

describe('contextual variable guide', () => {
  it('uses real safe fields, omits excluded fields and masks nothing into a sendable sample', () => {
    const request = fixture().request;
    request.headers.push({ name: 'X-Hidden', value: 'do-not-suggest', enabled: false });
    request.body!.excludedPaths = [['name']];
    const fields = variableFields(request);
    expect(fields.some((field) => field.label === 'Query page' && field.value === '1')).toBe(true);
    expect(JSON.stringify(fields)).not.toMatch(/top-secret|private|secret|do-not-suggest|Mihir/);
  });
  it('inserts JSON and URL placeholders without mutating the original request or losing exclusions', () => {
    const request = fixture().request;
    request.body!.excludedPaths = [['password']];
    const body = variableFields(request).find((field) => field.label === 'Body $["name"]')!;
    const next = insertVariable(request, body, 'customerName');
    expect(JSON.parse(next.body!.text!).name).toBe('{{customerName}}');
    expect(next.body!.excludedPaths).toEqual([['password']]);
    expect(request.body!.text).toContain('Mihir');
    const query = variableFields(request).find((field) => field.label === 'Query page')!;
    expect(new URL(insertVariable(request, query, 'pageNumber').url).searchParams.get('page')).toBe(
      '{{pageNumber}}',
    );
    expect(() => insertVariable(request, query, 'index')).toThrow('reserved');
  });
  it('generates valid form placeholders and leaves prototype-like keys inert', () => {
    const request = fixture().request;
    request.body = makeBody('name=Mihir', 'application/x-www-form-urlencoded');
    const field = variableFields(request).find((item) => item.location === 'body')!;
    const next = insertVariable(request, field, 'customer');
    const result = compileRunRequest({
      sourceId: 's',
      request: next,
      variables: [{ name: 'customer', value: 'a&b' }],
      rows: [],
      config: defaultRunConfig,
      seed: 1,
    }).render(0);
    expect(new URLSearchParams(result.body).get('name')).toBe('a&b');
    expect(
      JSON.parse(
        setBodyField(makeBody('{"__proto__":1}', 'application/json'), ['__proto__'], '{{safe}}')
          .text!,
      ).__proto__,
    ).toBe('{{safe}}');
    expect(
      uniqueVariableName('bodyName', [{ name: 'bodyName', value: 'one' }], '[{"bodyName2":"two"}]'),
    ).toBe('bodyName3');
  });
});
