import { fields } from './engine';
import type { CapturedRequest } from '../shared/model';
import { normalizeResourceType } from '../shared/resource-type';
import { MASK, redactText, redactUrl, sensitiveName } from '../shared/security';

export type FilterSuggestions = { fields: string[]; values: Map<string, string[]> };
const defaults: Record<string, string[]> = {
  method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
  resourceType: [
    'xhr',
    'fetch',
    'document',
    'script',
    'stylesheet',
    'image',
    'font',
    'media',
    'websocket',
    'preflight',
    'other',
  ],
  status: [
    '200',
    '201',
    '204',
    '301',
    '302',
    '304',
    '400',
    '401',
    '403',
    '404',
    '409',
    '422',
    '429',
    '500',
    '502',
    '503',
  ],
  statusClass: ['2', '3', '4', '5'],
  mimeType: [
    'application/json',
    'text/html',
    'text/plain',
    'text/css',
    'application/javascript',
    'application/xml',
  ],
  timing: ['100', '500', '1000', '3000'],
  'timing.total': ['100', '500', '1000', '3000'],
  size: ['1024', '102400', '1048576'],
  favorite: ['true', 'false'],
  pinned: ['true', 'false'],
  cache: ['true', 'false'],
  requestBody: ['error', 'query', 'variables'],
  responseBody: ['error', 'message', 'data'],
};

/** Bounded metadata suggestions. Never load bodies or expose credential values. */
export function buildFilterSuggestions(records: CapturedRequest[]): FilterSuggestions {
  const sets = new Map<string, Set<string>>();
  const names = new Set<string>([
    ...fields,
    'timing.total',
    'timing.dns',
    'timing.connect',
    'timing.tls',
    'timing.send',
    'timing.wait',
    'timing.receive',
  ]);
  const add = (field: string, input: unknown) => {
    if (input === undefined || input === null || (sets.size >= 200 && !sets.has(field))) return;
    const value = String(input);
    if (!value || value.length > 180 || value.includes(MASK) || value !== redactText(value)) return;
    let values = sets.get(field);
    if (!values) {
      values = new Set();
      sets.set(field, values);
    }
    if (values.size < 40) values.add(value);
  };
  for (const [field, values] of Object.entries(defaults))
    for (const value of values) add(field, value);
  for (const record of records.slice(0, 10000)) {
    const url = new URL(record.request.url);
    add('method', record.request.method);
    add('url', redactUrl(record.request.url));
    add('domain', url.host);
    add('path', url.pathname);
    add('status', record.response?.status);
    add('statusClass', record.response && Math.floor(record.response.status / 100));
    add('resourceType', normalizeResourceType(record.metadata.resourceType));
    add('mimeType', record.metadata.mimeType ?? record.response?.contentType);
    add('size', record.response?.size);
    add('tabId', record.tabId);
    add('frameId', record.frameId);
    add('protocol', record.request.protocol);
    add('cache', record.metadata.fromCache);
    add('timestamp', record.timestamp);
    add('pageUrl', record.pageUrl && redactUrl(record.pageUrl));
    add('initiator', record.initiator && redactUrl(record.initiator));
    add('operationName', record.metadata.operationName);
    for (const tag of record.tags) add('tag', tag);
    for (const [key, value] of Object.entries(record.timing ?? {})) {
      add('timing.' + key, value);
      if (key === 'total') add('timing', value);
    }
    for (const [field, pairs] of [
      ['requestHeader', record.request.headers],
      ['responseHeader', record.response?.headers ?? []],
      ['queryParam', record.request.query],
    ] as const) {
      for (const pair of pairs.slice(0, 100)) {
        const named = field + '.' + pair.name;
        if (names.size < 200) names.add(named);
        if (sensitiveName(pair.name)) continue;
        add(named, pair.value);
        add(field, `${pair.name}: ${pair.value}`);
      }
    }
  }
  return {
    fields: [...names],
    values: new Map([...sets].map(([key, values]) => [key, [...values]])),
  };
}
