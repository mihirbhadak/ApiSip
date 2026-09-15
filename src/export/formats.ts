import { z } from 'zod';
import {
  capturedSchema,
  defaultExportPreferences,
  entitySchema,
  uid,
  type CapturedRequest,
  type Entity,
} from '../shared/model';
import {
  httpVersion,
  makeBody,
  parseUrl,
  rawRequest,
  rawResponse,
  unavailable,
} from '../shared/parse';
import { redactRecord, redactText } from '../shared/security';
export type ExportFormat = 'JSON' | 'CSV' | 'Markdown' | 'HAR' | 'TXT';
export type ExportOptions = {
  requestHeaders: boolean;
  requestBody: boolean;
  responseHeaders: boolean;
  responseBody: boolean;
  cookies: boolean;
  timing: boolean;
  metadata: boolean;
  secrets: boolean;
};
export const defaultExportOptions: ExportOptions = {
  ...defaultExportPreferences,
  secrets: false,
};
export const backupSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.number(),
  entities: z.array(entitySchema).max(10000),
  requests: z.array(capturedSchema).max(100000),
});
export type Backup = z.infer<typeof backupSchema>;
function project(record: CapturedRequest, options: ExportOptions) {
  const r = structuredClone(options.secrets ? record : redactRecord(record));
  if (!options.requestHeaders) r.request.headers = [];
  if (!options.requestBody && r.request.body)
    r.request.body = unavailable('Request body excluded from export.');
  if (!options.cookies) {
    r.request.cookies = undefined;
    r.request.headers = r.request.headers.filter((h) => !/^cookie$/i.test(h.name));
    if (r.response) {
      r.response.cookies = undefined;
      r.response.headers = r.response.headers.filter((h) => !/^set-cookie$/i.test(h.name));
    }
  }
  if (r.response) {
    if (!options.responseHeaders) r.response.headers = [];
    if (!options.responseBody && r.response.body)
      r.response.body = unavailable('Response body excluded from export.');
  }
  if (!options.timing) r.timing = undefined;
  if (!options.metadata) {
    r.metadata = {
      provider: r.metadata.provider,
      resourceType: r.metadata.resourceType,
      state: r.metadata.state,
    };
    r.pageUrl = undefined;
    r.initiator = undefined;
    r.frameId = undefined;
    r.tabId = undefined;
    r.windowId = undefined;
  }
  r.replayHistory = r.replayHistory?.map((replay) => {
    const nested = project(
      { ...r, request: replay.request, response: replay.response, replayHistory: undefined },
      options,
    );
    return { ...replay, request: nested.request, response: nested.response };
  });
  return r;
}
const csv = (value: unknown) => {
  let text = value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; // Prevent spreadsheet formula injection.
  return '"' + text.replace(/"/g, '""') + '"';
};
const md = (value: unknown) =>
  String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
export function exportRecords(
  format: ExportFormat,
  records: CapturedRequest[],
  options = defaultExportOptions,
  entities: Entity[] = [],
): string {
  const rows = records.map((r) => project(r, options));
  if (format === 'JSON')
    return JSON.stringify(
      {
        schemaVersion: 1,
        exportedAt: Date.now(),
        entities: options.secrets
          ? entities
          : entities.map((e) => ({
              ...e,
              name: redactText(e.name),
              expression: e.expression && redactText(e.expression),
            })),
        requests: rows,
      },
      null,
      2,
    );
  if (format === 'CSV')
    return [
      ['Method', 'URL', 'Status', 'Type', 'DurationMs', 'SizeBytes', 'Timestamp', 'Tags', 'Notes']
        .map(csv)
        .join(','),
      ...rows.map((r) =>
        [
          r.request.method,
          r.request.url,
          r.response?.status,
          r.metadata.resourceType,
          r.timing?.total,
          r.response?.size,
          new Date(r.timestamp).toISOString(),
          r.tags.join(' '),
          r.notes,
        ]
          .map(csv)
          .join(','),
      ),
    ].join('\r\n');
  if (format === 'Markdown')
    return (
      '# Captured requests\n\n| Method | URL | Status | Time (ms) | Size (bytes) |\n|---|---|---:|---:|---:|\n' +
      rows
        .map(
          (r) =>
            '| ' +
            [r.request.method, r.request.url, r.response?.status, r.timing?.total, r.response?.size]
              .map(md)
              .join(' | ') +
            ' |',
        )
        .join('\n')
    );
  if (format === 'TXT')
    return rows
      .map((r) => rawRequest(r.request) + '\n\n--- Response ---\n' + rawResponse(r))
      .join('\n\n====================\n\n');
  return JSON.stringify(
    {
      log: {
        version: '1.2',
        creator: { name: 'API Catcher', version: '0.1.0' },
        entries: rows
          .filter((r) => /^https?:/.test(r.request.url))
          .map((r) => ({
            startedDateTime: new Date(r.timestamp).toISOString(),
            time: r.timing?.total ?? 0,
            request: {
              method: r.request.method,
              url: r.request.url,
              httpVersion: httpVersion(r.request.protocol),
              headers: r.request.headers,
              queryString: r.request.query,
              cookies: r.request.cookies ?? [],
              headersSize: -1,
              bodySize: r.request.body?.bytes ?? -1,
              postData: r.request.body?.available
                ? {
                    mimeType: r.request.contentType ?? '',
                    text: r.request.body.text,
                    _truncated: r.request.body.truncated,
                  }
                : undefined,
            },
            response: {
              status: r.response?.status ?? 0,
              statusText: r.response?.statusText ?? '',
              httpVersion: httpVersion(r.request.protocol),
              headers: r.response?.headers ?? [],
              cookies: r.response?.cookies ?? [],
              content: {
                size: r.response?.body?.bytes ?? 0,
                mimeType: r.response?.contentType ?? '',
                text: r.response?.body?.text,
                encoding: r.response?.body?.encoding === 'base64' ? 'base64' : undefined,
                _unavailable: r.response?.body?.reason,
                _truncated: r.response?.body?.truncated,
              },
              redirectURL: r.metadata.redirectUrl ?? '',
              headersSize: -1,
              bodySize: r.response?.size ?? -1,
            },
            cache: {},
            timings: {
              blocked: -1,
              dns: r.timing?.dns ?? -1,
              connect: r.timing?.connection ?? -1,
              ssl: r.timing?.tls ?? -1,
              send: r.timing?.request ?? 0,
              wait: r.timing?.response ?? 0,
              receive:
                r.timing?.total === undefined
                  ? 0
                  : Math.max(
                      0,
                      r.timing.total -
                        (r.timing.dns ?? 0) -
                        (r.timing.connection ?? 0) -
                        (r.timing.request ?? 0) -
                        (r.timing.response ?? 0),
                    ),
            },
            _captureProvider: r.metadata.provider,
            _timingUnavailable: !r.timing,
            _error: r.metadata.error,
          })),
      },
    },
    null,
    2,
  );
}
const harPair = z.object({ name: z.string(), value: z.string() });
const harSchema = z.object({
  log: z.object({
    version: z.string(),
    entries: z
      .array(
        z.object({
          startedDateTime: z.string(),
          time: z.number().optional(),
          request: z.object({
            method: z.string(),
            url: z.string(),
            httpVersion: z.string().optional(),
            headers: z.array(harPair),
            postData: z
              .object({
                mimeType: z.string().optional(),
                text: z.string().optional(),
                _truncated: z.boolean().optional(),
              })
              .optional(),
          }),
          response: z.object({
            status: z.number(),
            statusText: z.string(),
            headers: z.array(harPair),
            bodySize: z.number().optional(),
            content: z.object({
              mimeType: z.string().optional(),
              text: z.string().optional(),
              encoding: z.string().optional(),
              _truncated: z.boolean().optional(),
            }),
          }),
        }),
      )
      .max(100000),
  }),
});
export function importRecords(text: string, workspaceId: string, sessionId: string): Backup {
  if (new TextEncoder().encode(text).length > 100 * 1048576)
    throw new Error('Import files must be smaller than 100 MB.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (data && typeof data === 'object' && 'schemaVersion' in data) {
    const parsed = backupSchema.safeParse(data);
    if (!parsed.success)
      throw new Error(
        'Invalid backup or unsupported schema version. Expected API Catcher schema version 1.',
      );
    // New IDs prevent imports from overwriting existing local records.
    if (new Set(parsed.data.entities.map((e) => e.id)).size !== parsed.data.entities.length)
      throw new Error('Backup contains duplicate entity identifiers.');
    const map = new Map(parsed.data.entities.map((e) => [e.id, uid()]));
    return {
      ...parsed.data,
      entities: parsed.data.entities.map((e) => ({
        ...e,
        id: map.get(e.id)!,
        workspaceId: map.get(e.workspaceId) ?? workspaceId,
      })),
      requests: parsed.data.requests.map((r) => ({
        ...r,
        id: uid(),
        tabId: undefined,
        windowId: undefined,
        workspaceId: map.get(r.workspaceId) ?? workspaceId,
        sessionId: map.get(r.sessionId) ?? sessionId,
        collectionId: r.collectionId ? map.get(r.collectionId) : undefined,
        metadata: {
          ...r.metadata,
          provider: 'import',
          monotonicStart: undefined,
          responseHeadersComplete: undefined,
          state: r.metadata.state === 'pending' ? 'error' : r.metadata.state,
          error:
            r.metadata.state === 'pending'
              ? 'Capture was incomplete when exported.'
              : r.metadata.error,
        },
      })),
    };
  }
  const har = harSchema.safeParse(data);
  if (!har.success)
    throw new Error('This file is neither a valid API Catcher backup nor a supported HAR file.');
  const requests = har.data.log.entries.map((entry): CapturedRequest => {
    const parsed = parseUrl(entry.request.url),
      timestamp = Date.parse(entry.startedDateTime);
    if (!Number.isFinite(timestamp)) throw new Error('HAR contains an invalid timestamp.');
    const importedBody = (text: string, mime?: string, base64 = false, markedTruncated = false) => {
      const body = makeBody(text, mime, 1048576, base64);
      return { ...body, truncated: body.truncated || markedTruncated };
    };
    return capturedSchema.parse({
      id: uid(),
      timestamp,
      workspaceId,
      sessionId,
      tags: [],
      isPinned: false,
      isFavorite: false,
      request: {
        method: entry.request.method,
        url: entry.request.url,
        protocol: entry.request.httpVersion,
        headers: entry.request.headers,
        query: parsed.query,
        contentType: entry.request.postData?.mimeType,
        body:
          entry.request.postData?.text === undefined
            ? undefined
            : importedBody(
                entry.request.postData.text,
                entry.request.postData.mimeType,
                false,
                entry.request.postData._truncated,
              ),
      },
      response: {
        status: entry.response.status,
        statusText: entry.response.statusText,
        headers: entry.response.headers,
        contentType: entry.response.content.mimeType,
        size: (entry.response.bodySize ?? -1) >= 0 ? entry.response.bodySize : undefined,
        body:
          entry.response.content.text === undefined
            ? unavailable('This HAR does not include response content.')
            : importedBody(
                entry.response.content.text,
                entry.response.content.mimeType,
                entry.response.content.encoding === 'base64',
                entry.response.content._truncated,
              ),
      },
      timing: entry.time !== undefined && entry.time >= 0 ? { total: entry.time } : undefined,
      metadata: { provider: 'import', resourceType: 'Other', state: 'complete' },
    });
  });
  return { schemaVersion: 1, exportedAt: Date.now(), entities: [], requests };
}
export function downloadFile(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
