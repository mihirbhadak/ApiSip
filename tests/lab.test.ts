import { describe, expect, it, vi } from 'vitest';
import {
  atPointer,
  evaluateAssertions,
  extractScalar,
  responseReader,
  validateAssertion,
} from '../src/lab/assertions';
import {
  newSuite,
  stepFromCapture,
  suiteSchema,
  type Assertion,
  type Environment,
  type SuiteReport,
} from '../src/lab/model';
import { renderStep, reviewSuite, runSuite, type TestTransport } from '../src/lab/engine';
import { exportSuite, exportSuiteReport, importSuite, junitReport } from '../src/lab/export';
import { aiContext, securityFindings } from '../src/lab/security';
import { fixture } from './fixtures';
import { makeBody } from '../src/shared/parse';
const check = (patch: Partial<Assertion> = {}): Assertion => ({
  id: 'a',
  source: 'json',
  selector: '/id',
  operator: 'equals',
  expected: '123',
  ...patch,
});
const outcome = (a: Partial<Assertion>, response = fixture().response) =>
  evaluateAssertions([check(a)], response, 120)[0]!.state;
const env = (patch: Partial<Environment> = {}): Environment => ({
  id: 'e',
  workspaceId: 'default',
  name: 'Staging',
  revision: 0,
  updatedAt: 0,
  origin: '',
  variables: [],
  ...patch,
});
describe('API assertions', () => {
  it.each([
    [{}, 'passed'],
    [{ operator: 'notEquals', expected: '124' }, 'passed'],
    [{ operator: 'lt', expected: '124' }, 'passed'],
    [{ operator: 'lte', expected: '123' }, 'passed'],
    [{ operator: 'gt', expected: '122' }, 'passed'],
    [{ operator: 'gte', expected: '123' }, 'passed'],
    [{ operator: 'exists' }, 'passed'],
    [{ operator: 'absent', selector: '/missing' }, 'passed'],
    [{ operator: 'contains', selector: '/name', expected: 'ihi' }, 'passed'],
    [{ operator: 'type', expected: 'number' }, 'passed'],
    [{ expected: '124' }, 'failed'],
    [{ source: 'status', expected: '201' }, 'passed'],
    [{ source: 'duration', operator: 'lt', expected: '500' }, 'passed'],
    [{ source: 'header', selector: 'CONTENT-TYPE', expected: 'application/json' }, 'passed'],
    [{ source: 'body', operator: 'contains', expected: 'Mihir' }, 'passed'],
  ] as [Partial<Assertion>, string][])('evaluates %j', (input, state) =>
    expect(outcome(input)).toBe(state),
  );
  it('distinguishes null, missing values and numeric strings', () => {
    const response = {
      ...fixture().response!,
      body: makeBody('{"nil":null,"number":"123"}', 'application/json'),
    };
    expect(outcome({ selector: '/nil', expected: 'null' }, response)).toBe('passed');
    expect(outcome({ selector: '/missing', expected: 'null' }, response)).toBe('failed');
    expect(outcome({ selector: '/number', expected: '123' }, response)).toBe('failed');
    expect(outcome({ selector: '/number', expected: '"123"' }, response)).toBe('passed');
  });
  it('uses escaped own-property pointers without following prototypes', () => {
    expect(
      atPointer(JSON.parse('{"a/b":{"~key":[4]},"__proto__":{"safe":true}}'), '/a~1b/~0key/0')
        .value,
    ).toBe(4);
    expect(atPointer({}, '/constructor').exists).toBe(false);
    expect(atPointer(JSON.parse('{"__proto__":{"safe":true}}'), '/__proto__/safe').value).toBe(
      true,
    );
    expect(() => atPointer({}, '$.name')).toThrow('JSON Pointer');
    expect(() => atPointer({}, '/bad~3')).toThrow();
    expect(atPointer([4], '/length').exists).toBe(false);
    expect(atPointer([4], '/00').exists).toBe(false);
    expect(atPointer({ '00': 4 }, '/00').value).toBe(4);
    const read = responseReader({
      ...fixture().response!,
      body: makeBody('{"value":1e999}', 'application/json'),
    });
    expect(() => extractScalar(read, 'json', '/value')).toThrow('finite');
    const oversized = {
      ...fixture().response!,
      body: makeBody('{"id":9007199254740993}', 'application/json'),
    };
    expect(outcome({ expected: '9007199254740992' }, oversized)).toBe('inconclusive');
    expect(() => extractScalar(responseReader(oversized), 'json', '/id')).toThrow('precision');
  });
  it.each(['truncated', 'binary', 'missing', 'malformed', 'oversize'])(
    'marks %s body checks inconclusive, including absent',
    (mode) => {
      const response = fixture().response!;
      if (mode === 'truncated') response.body!.truncated = true;
      if (mode === 'binary') response.body!.encoding = 'base64';
      if (mode === 'missing') response.body = undefined;
      if (mode === 'malformed') response.body!.text = '{';
      if (mode === 'oversize') response.body!.text = ' '.repeat(1_048_577);
      expect(outcome({ operator: 'absent', selector: '/missing' }, response)).toBe('inconclusive');
    },
  );
  it('does not treat hidden Set-Cookie as absent', () =>
    expect(outcome({ source: 'header', selector: 'set-cookie', operator: 'absent' })).toBe(
      'inconclusive',
    ));
  it('validates numbers, pointers and types before execution', () => {
    expect(() => validateAssertion(check({ operator: 'gt', expected: '' }))).toThrow();
    expect(() => validateAssertion(check({ operator: 'type', expected: 'date' }))).toThrow();
    expect(() => validateAssertion(check({ source: 'header', selector: ':status' }))).toThrow();
  });
});
describe('suite workflows', () => {
  it('extracts typed values, omits disabled fields and sends no traffic in review', async () => {
    const suite = newSuite('default', stepFromCapture(fixture()));
    suite.steps[0]!.extract = [{ name: 'userId', source: 'json', selector: '/id' }];
    const second = stepFromCapture(fixture());
    second.request.url = 'https://example.com:8443/users/{{userId}}';
    second.request.body = makeBody('{"id":"{{userId}}","secret":"drop"}', 'application/json');
    second.request.body.excludedPaths = [['secret']];
    second.request.headers.push({ name: 'X-Drop', value: 'drop', enabled: false });
    suite.steps.push(second);
    const transport = vi
      .fn<TestTransport>()
      .mockResolvedValue({ response: fixture().response!, duration: 10 });
    expect(reviewSuite(suite)).toHaveLength(2);
    expect(transport).not.toHaveBeenCalled();
    const reports: SuiteReport[] = [];
    const report = await runSuite(
      suite,
      undefined,
      transport,
      new AbortController().signal,
      async (r) => {
        reports.push(r);
      },
    );
    expect(report.state).toBe('passed');
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]![0].url).toBe('https://example.com:8443/users/123');
    expect(JSON.parse(transport.mock.calls[1]![0].body!.text!)).toEqual({ id: 123 });
    expect(transport.mock.calls[1]![0].headers.some((h) => h.name === 'X-Drop')).toBe(false);
    expect(JSON.stringify(reports)).not.toContain('top-secret');
    expect(JSON.stringify(reports)).not.toContain('Mihir');
  });
  it('blocks unknown/forward variables, duplicate extraction names, and malformed later steps before traffic', async () => {
    const suite = newSuite('default', stepFromCapture(fixture()));
    suite.steps[0]!.request.url += '&id={{futureId}}';
    expect(() => reviewSuite(suite)).toThrow('Unknown variable');
    suite.steps[0]!.request = fixture().request;
    suite.steps[0]!.extract = [{ name: 'name', source: 'json', selector: '/name' }];
    expect(() =>
      reviewSuite(suite, env({ variables: [{ name: 'name', value: 'Mihir' }] })),
    ).toThrow('unique');
    suite.steps.push({
      ...stepFromCapture(fixture()),
      assertions: [check({ selector: 'not/pointer' })],
    });
    const transport = vi.fn<TestTransport>();
    await expect(
      runSuite(suite, undefined, transport, new AbortController().signal, async () => {}),
    ).rejects.toThrow('JSON Pointer');
    expect(transport).not.toHaveBeenCalled();
  });
  it('protects static credentials when changing origins and allows explicit environment placeholders', () => {
    const step = stepFromCapture(fixture()),
      staging = env({
        origin: 'https://staging.example.com',
        variables: [{ name: 'apiToken', value: 'Bearer staging-key' }],
      });
    expect(() => renderStep(step, staging, {})).toThrow('credential');
    step.request.headers[1]!.value = '{{apiToken}}';
    const result = renderStep(step, staging, { apiToken: 'Bearer staging-key' }).request;
    expect(new URL(result.url).origin).toBe(staging.origin);
    expect(result.headers[1]!.value).toBe('Bearer staging-key');
    expect(() => reviewSuite(newSuite('default', step), env({ workspaceId: 'elsewhere' }))).toThrow(
      'workspace',
    );
  });
  it('stops on failed assertions and extraction errors without saving values', async () => {
    const suite = newSuite('default', stepFromCapture(fixture()));
    suite.steps.push(stepFromCapture(fixture()));
    const transport = vi
      .fn<TestTransport>()
      .mockResolvedValue({ response: { ...fixture().response!, status: 500 }, duration: 10 });
    const report = await runSuite(
      suite,
      undefined,
      transport,
      new AbortController().signal,
      async () => {},
    );
    expect(report.state).toBe('failed');
    expect(transport).toHaveBeenCalledTimes(1);
    suite.steps[0]!.extract = [{ name: 'id', source: 'json', selector: '/missing' }];
    transport.mockResolvedValue({ response: fixture().response!, duration: 10 });
    const second = await runSuite(
      suite,
      undefined,
      transport,
      new AbortController().signal,
      async () => {},
    );
    expect(second.steps[0]!.state).toBe('failed');
    expect(second.steps[0]!.error).toContain('extraction');
  });
  it('supports continue-on-failure, cancellation and interruption checkpoints', async () => {
    const suite = newSuite('default', stepFromCapture(fixture()));
    suite.steps.push(stepFromCapture(fixture()));
    suite.stopOnFailure = false;
    const transport = vi
      .fn<TestTransport>()
      .mockResolvedValue({ response: { ...fixture().response!, status: 500 }, duration: 2 });
    const publish = vi.fn(async () => {});
    expect(
      (await runSuite(suite, undefined, transport, new AbortController().signal, publish)).steps,
    ).toHaveLength(2);
    const controller = new AbortController();
    transport.mockImplementation(async () => {
      controller.abort();
      throw new Error('secret never logged');
    });
    const report = await runSuite(suite, undefined, transport, controller.signal, publish);
    expect(report.state).toBe('cancelled');
    expect(report.steps).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain('secret never logged');
  });
  it('validates duplicate IDs and bounded definitions', () => {
    const suite = newSuite('default');
    suite.steps.push(suite.steps[0]!);
    expect(suiteSchema.safeParse(suite).success).toBe(false);
  });
});
describe('sharing and passive security', () => {
  it('round trips suite definitions with secret redaction and new identities', () => {
    const suite = newSuite('default', stepFromCapture(fixture()));
    const text = exportSuite(suite);
    expect(text).not.toContain('top-secret');
    expect(text).not.toContain('"password": "secret"');
    const imported = importSuite(text, 'other');
    expect(imported.id).not.toBe(suite.id);
    expect(imported.workspaceId).toBe('other');
    expect(imported.steps[0]!.assertions[0]!.expected).toBe('201');
    expect(() => importSuite('{', 'default')).toThrow('JSON');
    expect(() => importSuite('{"schemaVersion":2}', 'default')).toThrow('version 1');
  });
  it('escapes JUnit content and accounts for unsent steps', () => {
    const report: SuiteReport = {
      id: 'r',
      suiteId: 's',
      suiteName: 'a<&"',
      workspaceId: 'default',
      environment: '',
      timestamp: 0,
      duration: 10,
      state: 'failed',
      planned: 2,
      origins: [],
      steps: [{ id: 's', name: 'bad', duration: 10, state: 'failed', checks: [] }],
    };
    const xml = junitReport(report);
    expect(xml).toContain('a&lt;&amp;&quot;');
    expect(xml).toContain('skipped="1"');
    expect(xml).toContain('<failure');
    report.suiteName = 'token=never-export-me';
    report.steps[0]!.name = 'Bearer private-credential';
    const json = exportSuiteReport(report);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json).not.toMatch(/never-export-me|private-credential/);
    expect(JSON.parse(json).steps).toHaveLength(1);
  });
  it('emits evidence without credential values and never calls security findings proof', () => {
    const record = fixture();
    record.request.url = 'http://example.com/?api_key=never-show-me';
    record.response!.body = makeBody('{"token":"response-secret"}', 'application/json');
    const findings = securityFindings(record);
    expect(findings.some((f) => f.title === 'Unencrypted HTTP')).toBe(true);
    expect(findings.some((f) => f.title === 'Credential-like response fields')).toBe(true);
    expect(JSON.stringify(findings)).not.toMatch(/never-show-me|response-secret/);
    const context = aiContext(record);
    expect(context).not.toMatch(/never-show-me|response-secret|top-secret/);
    expect(context).toContain('untrusted');
  });
});
