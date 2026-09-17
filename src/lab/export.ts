import { z } from 'zod';
import { redactRequest, redactText, sensitiveName } from '../shared/security';
import { uid } from '../shared/model';
import { suiteSchema, type SuiteReport, type TestSuite } from './model';

export function exportSuite(suite: TestSuite) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'apisip-suite',
      suite: {
        ...suite,
        name: redactText(suite.name),
        steps: suite.steps.map((s) => ({
          ...s,
          name: redactText(s.name),
          request: redactRequest(s.request),
          assertions: s.assertions.map((a) => ({
            ...a,
            expected: sensitiveName(a.selector) ? '[REDACTED]' : redactText(a.expected),
          })),
        })),
      },
    },
    null,
    2,
  );
}
export function importSuite(text: string, workspaceId: string): TestSuite {
  if (text.length > 2_100_000) throw new Error('Suite imports are limited to 2 MB.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const input = z
    .object({ schemaVersion: z.literal(1), kind: z.literal('apisip-suite'), suite: suiteSchema })
    .safeParse(parsed);
  if (!input.success)
    throw new Error(
      'Expected an ApiSip suite export (schema version 1). Check its fields and limits.',
    );
  return {
    ...input.data.suite,
    id: uid(),
    workspaceId,
    revision: 0,
    updatedAt: Date.now(),
    steps: input.data.suite.steps.map((step) => ({
      ...step,
      id: uid(),
      assertions: step.assertions.map((a) => ({ ...a, id: uid() })),
    })),
  };
}
export function exportSuiteReport(report: SuiteReport) {
  // Redact field values before serialization so quotes/delimiters stay valid JSON.
  return JSON.stringify(
    {
      ...report,
      suiteName: redactText(report.suiteName),
      environment: redactText(report.environment),
      origins: report.origins.map(redactText),
      steps: report.steps.map((step) => ({
        ...step,
        name: redactText(step.name),
        error: step.error && redactText(step.error),
        checks: step.checks.map((check) => ({ ...check, message: redactText(check.message) })),
      })),
    },
    null,
    2,
  );
}
const xml = (s: string) =>
  redactText(s)
    .split('')
    .filter((c) => c.charCodeAt(0) >= 32 || '\t\r\n'.includes(c))
    .join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
export function junitReport(report: SuiteReport) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${xml(report.suiteName)}" tests="${report.planned}" failures="${report.steps.filter((s) => s.state === 'failed').length}" skipped="${report.planned - report.steps.length + report.steps.filter((s) => s.state === 'cancelled').length}" time="${report.duration / 1000}">\n` +
    report.steps
      .map(
        (s) =>
          `  <testcase name="${xml(s.name)}" time="${s.duration / 1000}">${s.state === 'failed' ? '<failure message="Assertion, request or extraction failed"/>' : s.state === 'cancelled' ? '<skipped/>' : ''}</testcase>`,
      )
      .join('\n') +
    Array.from(
      { length: report.planned - report.steps.length },
      (_, i) =>
        `\n  <testcase name="Unsent step ${report.steps.length + i + 1}"><skipped/></testcase>`,
    ).join('') +
    '\n</testsuite>'
  );
}
