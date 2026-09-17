import type { RequestData, ResponseData } from '../shared/model';
import { uid } from '../shared/model';
import { makeBody, parseUrl } from '../shared/parse';
import { safeHttpUrl, sensitiveName } from '../shared/security';
import { materializeRequest } from '../shared/request-fields';
import { compileRunRequest } from '../runner/templates';
import { defaultRunConfig } from '../runner/model';
import { compareBaseline } from './baseline';
import {
  environmentSchema,
  suiteSchema,
  type Environment,
  type Scalar,
  type SuiteReport,
  type TestStep,
  type TestSuite,
} from './model';
import {
  evaluateAssertions,
  extractScalar,
  pointerParts,
  responseReader,
  validateAssertion,
} from './assertions';

export function renderStep(
  step: TestStep,
  env: Environment | undefined,
  values: Record<string, Scalar>,
) {
  const request = materializeRequest(step.request);
  if (env?.origin) {
    const original = safeHttpUrl(request.url);
    if (
      original.origin !== new URL(env.origin).origin &&
      request.headers.some(
        (h) => sensitiveName(h.name) && h.value && !/^\{\{[\s\w]+\}\}$/.test(h.value),
      )
    )
      throw new Error(
        'Changing origin requires replacing credential headers with environment placeholders or excluding them.',
      );
    request.url = new URL(env.origin).origin + original.pathname + original.search;
  }
  const compiled = compileRunRequest({
    sourceId: step.id,
    request,
    config: { ...defaultRunConfig, count: 1 },
    variables: [],
    rows: [values],
    seed: 1,
  });
  const result = compiled.render(0);
  return {
    request: {
      ...request,
      url: result.url,
      method: result.method,
      query: parseUrl(result.url).query,
      headers: result.headers.map(([name, value]) => ({ name, value })),
      body:
        result.body === undefined
          ? undefined
          : makeBody(
              result.body,
              request.contentType ??
                request.headers.find((h) => /^content-type$/i.test(h.name))?.value ??
                '',
              1_048_576,
            ),
    } satisfies RequestData,
    warnings: compiled.warnings,
  };
}
export function reviewSuite(suite: TestSuite, env?: Environment) {
  suiteSchema.parse(suite);
  if (env) {
    environmentSchema.parse(env);
    if (env.workspaceId !== suite.workspaceId)
      throw new Error('Choose an environment from this workspace.');
  }
  const values: Record<string, Scalar> = Object.fromEntries(
    env?.variables.map((v) => [v.name, v.value]) ?? [],
  );
  const names = new Set(Object.keys(values));
  return suite.steps.map((step) => {
    for (const check of step.assertions) validateAssertion(check);
    const rendered = renderStep(step, env, values);
    for (const extract of step.extract) {
      if (names.has(extract.name))
        throw new Error(
          'Extracted variable names must be unique and cannot overwrite environment values: ' +
            extract.name,
        );
      if (extract.source === 'json') pointerParts(extract.selector);
      else if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(extract.selector))
        throw new Error('Enter a valid extraction header name.');
      names.add(extract.name);
      Object.defineProperty(values, extract.name, {
        value: 'extracted-at-runtime',
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return {
      name: step.name,
      origin: new URL(rendered.request.url).origin,
      method: rendered.request.method,
      warnings: rendered.warnings,
    };
  });
}
export type TestTransport = (
  request: RequestData,
  signal: AbortSignal,
) => Promise<{ response: ResponseData; duration: number }>;
export async function runSuite(
  suite: TestSuite,
  env: Environment | undefined,
  transport: TestTransport,
  signal: AbortSignal,
  publish: (report: SuiteReport) => Promise<void>,
): Promise<SuiteReport> {
  const review = reviewSuite(suite, env);
  const report: SuiteReport = {
    id: uid(),
    suiteId: suite.id,
    workspaceId: suite.workspaceId,
    suiteName: suite.name,
    environment: env?.name ?? 'Captured origins',
    timestamp: Date.now(),
    duration: 0,
    state: 'interrupted',
    steps: [],
    planned: suite.steps.length,
    origins: [...new Set(review.map((s) => s.origin))],
  };
  const values: Record<string, Scalar> = Object.fromEntries(
    env?.variables.map((v) => [v.name, v.value]) ?? [],
  );
  const started = performance.now();
  await publish(structuredClone(report));
  for (const step of suite.steps) {
    if (signal.aborted) break;
    const result: SuiteReport['steps'][number] = {
      id: step.id,
      name: step.name,
      state: 'failed',
      duration: 0,
      checks: [],
    };
    const stepStart = performance.now();
    try {
      const { request } = renderStep(step, env, values);
      const output = await transport(request, signal);
      if (signal.aborted) throw new Error('Cancelled');
      result.duration = output.duration;
      result.status = output.response.status;
      result.checks = evaluateAssertions(step.assertions, output.response, output.duration);
      if (step.baseline) {
        try {
          const comparison = compareBaseline(step.baseline, output.response);
          result.checks.push({
            id: 'baseline:' + step.id,
            state: comparison.count ? 'failed' : 'passed',
            message: comparison.count
              ? `Baseline: ${comparison.count} structural change(s). ${comparison.changes.join('; ')}${comparison.count > 20 ? '; showing first 20' : ''}`.slice(
                  0,
                  10000,
                )
              : 'Baseline: JSON structure matches. Scalar values are not compared.',
          });
        } catch {
          result.checks.push({
            id: 'baseline:' + step.id,
            state: 'inconclusive',
            message:
              'Baseline inconclusive: a complete JSON response within the 1 MB / 2,000 field / 32 level limits is required.',
          });
        }
      }
      result.state = result.checks.every((check) => check.state === 'passed') ? 'passed' : 'failed';
      if (result.state === 'passed') {
        const read = responseReader(output.response);
        const extracted = step.extract.map(
          (item) => [item.name, extractScalar(read, item.source, item.selector)] as const,
        );
        for (const [name, value] of extracted)
          Object.defineProperty(values, name, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          });
      }
    } catch {
      result.state = signal.aborted ? 'cancelled' : 'failed';
      result.duration = performance.now() - stepStart;
      result.error = signal.aborted
        ? 'Stopped by user; a request already received by the server cannot be undone.'
        : 'Request or extraction failed. Check permissions, connectivity, the 25-second timeout, variables and extraction selectors. Redirects are blocked.';
    }
    report.steps.push(result);
    report.duration = performance.now() - started;
    await publish(structuredClone(report));
    if (result.state !== 'passed' && suite.stopOnFailure) break;
  }
  report.duration = performance.now() - started;
  report.state = signal.aborted
    ? 'cancelled'
    : report.steps.length === suite.steps.length && report.steps.every((s) => s.state === 'passed')
      ? 'passed'
      : 'failed';
  await publish(structuredClone(report));
  return report;
}
