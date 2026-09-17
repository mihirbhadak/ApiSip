import { z } from 'zod';
import { requestSchema, uid, type CapturedRequest } from '../shared/model';

export const variableName = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,59}$/)
  .refine(
    (name) => !['index', 'uuid', 'timestamp', 'randomInt'].includes(name),
    'Built-in names are reserved',
  );
export const scalarSchema = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type Scalar = z.infer<typeof scalarSchema>;
export const assertionSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['status', 'header', 'json', 'body', 'duration']),
  selector: z.string().max(300).default(''),
  operator: z.enum([
    'equals',
    'notEquals',
    'contains',
    'exists',
    'absent',
    'lt',
    'lte',
    'gt',
    'gte',
    'type',
  ]),
  expected: z.string().max(10000).default(''),
});
export type Assertion = z.infer<typeof assertionSchema>;
export const extractionSchema = z.object({
  name: variableName,
  source: z.enum(['json', 'header']),
  selector: z.string().max(300),
});
export const stepSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  request: requestSchema,
  assertions: z.array(assertionSchema).min(1).max(50),
  extract: z.array(extractionSchema).max(20),
});
export type TestStep = z.infer<typeof stepSchema>;
export const suiteSchema = z
  .object({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    revision: z.number().int().nonnegative(),
    updatedAt: z.number(),
    steps: z.array(stepSchema).min(1).max(30),
    stopOnFailure: z.boolean(),
  })
  .refine((suite) => JSON.stringify(suite).length <= 2_000_000, 'Suite exceeds the 2 MB limit')
  .refine(
    (suite) =>
      new Set(suite.steps.map((s) => s.id)).size === suite.steps.length &&
      suite.steps.every((s) => new Set(s.assertions.map((a) => a.id)).size === s.assertions.length),
    'Step and check IDs must be unique',
  );
export type TestSuite = z.infer<typeof suiteSchema>;
export const environmentSchema = z
  .object({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    revision: z.number().int().nonnegative(),
    updatedAt: z.number(),
    origin: z
      .string()
      .max(2000)
      .refine((value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return (
            /^https?:$/.test(url.protocol) &&
            !url.username &&
            !url.password &&
            url.pathname === '/' &&
            !url.search &&
            !url.hash
          );
        } catch {
          return false;
        }
      }, 'Use an HTTP(S) origin only, such as https://staging.example.com'),
    variables: z.array(z.object({ name: variableName, value: scalarSchema })).max(100),
  })
  .refine(
    (env) => new Set(env.variables.map((v) => v.name)).size === env.variables.length,
    'Variable names must be unique',
  )
  .refine((env) => JSON.stringify(env).length <= 131072, 'Environment exceeds 128 KB.');
export type Environment = z.infer<typeof environmentSchema>;
export type CheckResult = {
  id: string;
  state: 'passed' | 'failed' | 'inconclusive';
  message: string;
};
export type StepResult = {
  id: string;
  name: string;
  state: 'passed' | 'failed' | 'cancelled';
  status?: number;
  duration: number;
  checks: CheckResult[];
  error?: string;
};
export type SuiteReport = {
  id: string;
  suiteId: string;
  workspaceId: string;
  suiteName: string;
  environment: string;
  timestamp: number;
  duration: number;
  state: 'passed' | 'failed' | 'cancelled' | 'interrupted';
  steps: StepResult[];
  planned: number;
  origins: string[];
};
export function stepFromCapture(record: CapturedRequest): TestStep {
  return {
    id: uid(),
    name: record.request.method + ' ' + new URL(record.request.url).pathname.slice(0, 90),
    request: structuredClone(record.request),
    assertions: [
      {
        id: uid(),
        source: 'status',
        selector: '',
        operator: 'equals',
        expected: String(record.response?.status || 200),
      },
    ],
    extract: [],
  };
}
export function newSuite(workspaceId: string, step?: TestStep): TestSuite {
  return {
    id: uid(),
    workspaceId,
    name: 'My API test',
    revision: 0,
    updatedAt: Date.now(),
    stopOnFailure: true,
    steps: step
      ? [step]
      : [
          {
            id: uid(),
            name: 'First request',
            request: {
              method: 'GET',
              url: 'https://api.example.com/users',
              headers: [],
              query: [],
            },
            assertions: [
              { id: uid(), source: 'status', selector: '', operator: 'equals', expected: '200' },
            ],
            extract: [],
          },
        ],
  };
}
