import { z } from 'zod';

export const pairSchema = z.object({ name: z.string(), value: z.string() });
export type Pair = z.infer<typeof pairSchema>;
export const bodySchema = z.object({
  type: z.enum([
    'json',
    'graphql',
    'form',
    'multipart',
    'text',
    'html',
    'xml',
    'binary',
    'unknown',
  ]),
  text: z.string().optional(),
  encoding: z.enum(['utf8', 'base64']).default('utf8'),
  available: z.boolean(),
  truncated: z.boolean().default(false),
  bytes: z.number().nonnegative().optional(),
  originalBytes: z.number().nonnegative().optional(),
  reason: z.string().optional(),
  fields: z.array(pairSchema.extend({ file: z.boolean().optional() })).optional(),
});
export type Body = z.infer<typeof bodySchema>;
export const requestSchema = z.object({
  method: z
    .string()
    .regex(/^[A-Za-z!#$%&'*+.^_`|~-]+$/)
    .max(32),
  url: z
    .string()
    .max(2_000_000)
    .refine((value) => {
      try {
        return ['http:', 'https:', 'ws:', 'wss:'].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, 'A valid HTTP(S) or WebSocket URL is required'),
  protocol: z.string().optional(),
  headers: z.array(pairSchema).max(10000),
  query: z.array(pairSchema).max(10000),
  cookies: z.array(pairSchema).optional(),
  contentType: z.string().optional(),
  body: bodySchema.optional(),
});
export type RequestData = z.infer<typeof requestSchema>;
export const responseSchema = z.object({
  status: z.number().int().min(0).max(999),
  statusText: z.string(),
  headers: z.array(pairSchema),
  cookies: z.array(pairSchema).optional(),
  contentType: z.string().optional(),
  body: bodySchema.optional(),
  size: z.number().nonnegative().optional(),
});
export type ResponseData = z.infer<typeof responseSchema>;
export const timingSchema = z.object({
  dns: z.number().nonnegative().optional(),
  connection: z.number().nonnegative().optional(),
  tls: z.number().nonnegative().optional(),
  request: z.number().nonnegative().optional(),
  response: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
});
export type TimingData = z.infer<typeof timingSchema>;
export const replaySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  context: z.enum(['browser', 'extension']),
  request: requestSchema,
  response: responseSchema.optional(),
  duration: z.number().nonnegative(),
  error: z.string().optional(),
  warnings: z.array(z.string()),
});
export type ReplayResult = z.infer<typeof replaySchema>;
export const capturedSchema = z.object({
  id: z.string().min(1).max(300),
  timestamp: z.number().finite(),
  tabId: z.number().int().optional(),
  windowId: z.number().int().optional(),
  frameId: z.union([z.number(), z.string()]).optional(),
  pageUrl: z.string().optional(),
  initiator: z.string().optional(),
  request: requestSchema,
  response: responseSchema.optional(),
  timing: timingSchema.optional(),
  metadata: z.object({
    provider: z.enum(['webRequest', 'debugger', 'import']),
    resourceType: z.string(),
    mimeType: z.string().optional(),
    fromCache: z.boolean().optional(),
    fromServiceWorker: z.boolean().optional(),
    error: z.string().optional(),
    redirectUrl: z.string().optional(),
    remoteAddress: z.string().optional(),
    securityState: z.string().optional(),
    state: z.enum(['pending', 'complete', 'error']),
    operationName: z.string().optional(),
    connectionId: z.string().optional(),
    monotonicStart: z.number().optional(),
    responseHeadersComplete: z.boolean().optional(),
    messages: z
      .array(
        z.object({
          direction: z.enum(['sent', 'received']),
          timestamp: z.number(),
          payload: z.string(),
          opcode: z.number(),
          truncated: z.boolean(),
        }),
      )
      .optional(),
    messageLimitReached: z.boolean().optional(),
  }),
  sessionId: z.string(),
  workspaceId: z.string(),
  tags: z.array(z.string()).max(100),
  notes: z.string().optional(),
  isFavorite: z.boolean(),
  isPinned: z.boolean(),
  collectionId: z.string().optional(),
  replayHistory: z.array(replaySchema).optional(),
});
export type CapturedRequest = z.infer<typeof capturedSchema>;
export type EntityKind = 'workspace' | 'session' | 'collection' | 'filter';
export const entitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['workspace', 'session', 'collection', 'filter']),
  name: z.string().min(1).max(120),
  workspaceId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  endTime: z.number().optional(),
  archived: z.boolean().optional(),
  expression: z.string().optional(),
  tabIds: z.array(z.number()).optional(),
});
export type Entity = z.infer<typeof entitySchema>;
export const settingsSchema = z.object({
  recording: z.boolean().default(false),
  scope: z.enum(['current', 'all']).default('current'),
  provider: z.enum(['webRequest', 'debugger']).default('webRequest'),
  activeTabId: z.number().optional(),
  activePageUrl: z.string().optional(),
  workspaceId: z.string().default('default'),
  sessionId: z.string().default('initial'),
  badge: z.enum(['tab', 'all', 'session', 'filter']).default('tab'),
  badgeFilter: z.string().default(''),
  resetOnNavigation: z.boolean().default(false),
  maxBodyBytes: z.number().int().min(1024).max(26_214_400).default(1_048_576),
  maxRequests: z.number().int().min(100).max(100_000).default(10000),
  retentionDays: z.union([z.literal(0), z.literal(7), z.literal(30), z.literal(90)]).default(30),
  maxStorageMB: z.number().min(10).max(10000).default(500),
  maskSecrets: z.boolean().default(true),
  replayContext: z.enum(['auto', 'browser', 'extension']).default('auto'),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings = settingsSchema.parse({});
export type Diagnostic = { timestamp: number; message: string; level: 'info' | 'error' };
export const uid = () => crypto.randomUUID();
