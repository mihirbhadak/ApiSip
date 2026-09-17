import { z } from 'zod';
import { plannedPeakRate } from './schedule';
import { pairSchema, requestSchema } from '../shared/model';

export const runConfigSchema = z
  .object({
    count: z.number().int().min(1).max(1_000_000),
    durationSeconds: z.number().min(1).max(3600),
    concurrency: z.number().int().min(1).max(128),
    timeoutMs: z.number().int().min(100).max(120_000),
    maxResponseBytes: z
      .number()
      .int()
      .min(1024)
      .max(25 * 1024 * 1024),
    rampSeconds: z.number().min(0),
    maxStartDelayMs: z.number().min(10).max(1000),
    expectedStatusMin: z.number().int().min(100).max(599),
    expectedStatusMax: z.number().int().min(100).max(599),
    latencyBudgetMs: z.number().min(0).max(120_000),
    stopAfterFailures: z.number().int().min(0).max(1000),
    stopOn429: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.rampSeconds > value.durationSeconds)
      context.addIssue({ code: 'custom', message: 'Ramp must fit within the start window.' });
    if (plannedPeakRate(value) > 1000)
      context.addIssue({
        code: 'custom',
        message: 'Peak planned rate is limited to 1,000 requests/second.',
      });
    if (value.expectedStatusMax < value.expectedStatusMin)
      context.addIssue({ code: 'custom', message: 'Expected status range is reversed.' });
  });
export type RunConfig = z.infer<typeof runConfigSchema>;
export const defaultRunConfig: RunConfig = {
  count: 100,
  durationSeconds: 10,
  concurrency: 8,
  timeoutMs: 10000,
  maxResponseBytes: 5 * 1024 * 1024,
  rampSeconds: 0,
  maxStartDelayMs: 100,
  expectedStatusMin: 200,
  expectedStatusMax: 299,
  latencyBudgetMs: 0,
  stopAfterFailures: 20,
  stopOn429: true,
};
const scalar = z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()]);
export const runRowsSchema = z.array(z.record(scalar)).max(1000);
export const runPlanSchema = z
  .object({
    sourceId: z.string().min(1).max(300),
    request: requestSchema,
    config: runConfigSchema,
    variables: z.array(pairSchema).max(100),
    rows: runRowsSchema,
    seed: z.number().int().min(0).max(0xffffffff),
  })
  .refine((plan) => JSON.stringify(plan).length <= 1_500_000, 'Run definition exceeds 1.5 MB.');
export type RunPlan = z.infer<typeof runPlanSchema>;
export type RunState =
  'running' | 'draining' | 'stopping' | 'completed' | 'stopped' | 'interrupted';
export const isRunActive = (state: RunState) =>
  state === 'running' || state === 'draining' || state === 'stopping';
export type Outcome =
  | 'ok'
  | 'http-error'
  | 'latency-failed'
  | 'timeout'
  | 'network-error'
  | 'cancelled'
  | 'body-limit'
  | 'redirect-blocked';
export type Measurement = {
  index: number;
  scheduledMs: number;
  startedMs: number;
  delayMs: number;
  durationMs: number;
  headersMs?: number;
  bodyMs?: number;
  bytes: number;
  status?: number;
  outcome: Outcome;
};
export type Distribution = {
  count: number;
  min?: number;
  max?: number;
  mean?: number;
  stddev?: number;
  p50?: number;
  p95?: number;
  p99?: number;
};
export type TimelineBucket = {
  fromMs: number;
  starts: number;
  finished: number;
  failures: number;
  durationSum: number;
  maxDuration: number;
  bytes: number;
  missed: number;
};
export type RunReport = {
  schemaVersion: 1;
  id: string;
  sourceId: string;
  workspaceId: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  method: string;
  origin: string;
  config: RunConfig;
  state: RunState;
  reason?: string;
  elapsedMs: number;
  started: number;
  finished: number;
  inFlight: number;
  peakConcurrency: number;
  missedCapacity: number;
  missedDelay: number;
  notStarted: number;
  outcomes: Record<Outcome, number>;
  statuses: Record<string, number>;
  bytes: number;
  latency: Distribution;
  headers: Distribution;
  body: Distribution;
  delay: Distribution;
  schedulerLag: Distribution;
  timeline: TimelineBucket[];
  bucketMs: number;
  recent: Measurement[];
  failures: Measurement[];
  warnings: string[];
  latencyBands: { upperMs: number | null; count: number }[];
};
export type RunnerCommand =
  { type: 'start'; plan: RunPlan; report: RunReport } | { type: 'stop'; reason?: string };
export type RunnerEvent =
  | { type: 'snapshot'; report: RunReport }
  | { type: 'finished'; report: RunReport }
  | { type: 'failure'; message: string };
