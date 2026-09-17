import type { CapturedRequest } from '../shared/model';
import { normalizeResourceType } from '../shared/resource-type';
export const fields = [
  'method',
  'url',
  'domain',
  'path',
  'status',
  'statusClass',
  'resourceType',
  'mimeType',
  'requestHeader',
  'responseHeader',
  'requestBody',
  'responseBody',
  'queryParam',
  'timing',
  'size',
  'initiator',
  'pageUrl',
  'tabId',
  'timestamp',
  'tag',
  'favorite',
  'pinned',
  'operationName',
  'protocol',
  'frameId',
  'cache',
] as const;
export const operators = [
  '=',
  '!=',
  'contains',
  '!contains',
  'starts',
  'ends',
  'regex',
  'exists',
  '!exists',
  '>',
  '<',
  '>=',
  '<=',
] as const;
export type Operator = (typeof operators)[number];
export type Predicate = { type: 'predicate'; field: string; operator: Operator; value: string };
export type FilterNode =
  Predicate | { type: 'and' | 'or'; children: FilterNode[] } | { type: 'not'; child: FilterNode };

function values(r: CapturedRequest, field: string): unknown[] {
  const [key, ...parts] = field.split('.');
  const name = parts.join('.');
  const url = new URL(r.request.url);
  const pairs =
    key === 'requestHeader'
      ? r.request.headers
      : key === 'responseHeader'
        ? (r.response?.headers ?? [])
        : r.request.query;
  switch (key) {
    case 'method':
      return [r.request.method];
    case 'url':
      return [r.request.url];
    case 'domain':
      return [url.host];
    case 'path':
      return [url.pathname];
    case 'status':
      return [r.response?.status];
    case 'statusClass':
      return [r.response && Math.floor(r.response.status / 100)];
    case 'resourceType':
      return [r.metadata.resourceType];
    case 'mimeType':
      return [r.metadata.mimeType ?? r.response?.contentType];
    case 'requestHeader':
    case 'responseHeader':
    case 'queryParam':
      return pairs
        .filter(
          (p) =>
            !name ||
            (key === 'queryParam' ? p.name === name : p.name.toLowerCase() === name.toLowerCase()),
        )
        .map((p) => (name ? p.value : p.name + ': ' + p.value));
    case 'requestBody':
      return [r.request.body?.text];
    case 'responseBody':
      return [r.response?.body?.text];
    case 'timing':
      return [r.timing?.[(name || 'total') as keyof NonNullable<CapturedRequest['timing']>]];
    case 'size':
      return [r.response?.size];
    case 'initiator':
      return [r.initiator];
    case 'pageUrl':
      return [r.pageUrl];
    case 'tabId':
      return [r.tabId];
    case 'timestamp':
      return [r.timestamp];
    case 'tag':
      return r.tags;
    case 'favorite':
      return [r.isFavorite];
    case 'pinned':
      return [r.isPinned];
    case 'operationName':
      return [r.metadata.operationName];
    case 'protocol':
      return [r.request.protocol];
    case 'frameId':
      return [r.frameId];
    case 'cache':
      return [r.metadata.fromCache];
    default:
      throw new Error('Unknown filter field: ' + field);
  }
}
export function safeRegex(pattern: string): RegExp {
  if (pattern.length > 180 || /[()|]|\\[1-9]|\{/.test(pattern))
    throw new Error(
      'Regex supports literals, anchors, character classes and one anchored repetition; groups, alternatives and counted repetition are unavailable.',
    );
  const stripped = pattern.replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');
  const repetitions = stripped.match(/[+*?]/g) ?? [];
  if (repetitions.length > 1 || (repetitions.length && !pattern.startsWith('^')))
    throw new Error(
      'A regex with repetition must begin with ^ and have at most one repetition to keep searches responsive.',
    );
  try {
    return new RegExp(pattern, 'i');
  } catch {
    throw new Error('Invalid regular expression.');
  }
}
export function needsBody(node: FilterNode): boolean {
  if (node.type === 'predicate') return /^(requestBody|responseBody)$/.test(node.field);
  if (node.type === 'not') return needsBody(node.child);
  return node.children.some(needsBody);
}
export function compileFilter(node: FilterNode): (record: CapturedRequest) => boolean {
  if (node.type === 'not') {
    const f = compileFilter(node.child);
    return (r) => !f(r);
  }
  if (node.type === 'and' || node.type === 'or') {
    const children = [...node.children]
      .sort((a, b) => Number(needsBody(a)) - Number(needsBody(b)))
      .map(compileFilter);
    return node.type === 'and'
      ? (r) => children.every((f) => f(r))
      : (r) => children.some((f) => f(r));
  }
  const { field, operator, value } = node as Predicate;
  if (!fields.includes(field.split('.')[0] as (typeof fields)[number]))
    throw new Error('Unknown filter field: ' + field);
  const regex = operator === 'regex' ? safeRegex(value) : undefined;
  const compare = (item: unknown): boolean => {
    if (item === undefined || item === null) return false;
    const normalize =
      field === 'resourceType' && operator !== 'regex'
        ? normalizeResourceType
        : (text: string) => text.toLowerCase();
    const text = normalize(String(item)),
      expected = normalize(value);
    switch (operator) {
      case '=':
      case '!=':
        return text === expected;
      case 'contains':
      case '!contains':
        return text.includes(expected);
      case 'starts':
        return text.startsWith(expected);
      case 'ends':
        return text.endsWith(expected);
      case 'regex':
        return regex!.test(String(item));
      case '>':
        return Number.isFinite(Number(item)) && Number(item) > Number(value);
      case '<':
        return Number.isFinite(Number(item)) && Number(item) < Number(value);
      case '>=':
        return Number.isFinite(Number(item)) && Number(item) >= Number(value);
      case '<=':
        return Number.isFinite(Number(item)) && Number(item) <= Number(value);
      case 'exists':
      case '!exists':
        return true;
    }
  };
  if (['>', '<', '>=', '<='].includes(operator) && !Number.isFinite(Number(value)))
    throw new Error('Numeric comparison requires a number.');
  return (r) => {
    const found = values(r, field).some(compare);
    return ['!=', '!contains', '!exists'].includes(operator) ? !found : found;
  };
}
/** Three-valued metadata evaluation: undefined means a body is needed to decide. */
export function compileMetadataFilter(
  node: FilterNode,
): (record: CapturedRequest) => boolean | undefined {
  if (!needsBody(node)) return compileFilter(node);
  if (node.type === 'predicate') return () => undefined;
  if (node.type === 'not') {
    const child = compileMetadataFilter(node.child);
    return (record) => {
      const value = child(record);
      return value === undefined ? undefined : !value;
    };
  }
  const children = node.children.map(compileMetadataFilter);
  return (record) => {
    let unknown = false;
    for (const child of children) {
      const result = child(record);
      if (node.type === 'and' && result === false) return false;
      if (node.type === 'or' && result === true) return true;
      unknown ||= result === undefined;
    }
    return unknown ? undefined : node.type === 'and';
  };
}
export function globalSearch(r: CapturedRequest, search: string): boolean {
  if (!search.trim()) return true;
  const q = search.toLowerCase();
  return [
    r.request.url,
    r.request.method,
    r.notes,
    ...r.tags,
    ...r.request.headers.map((h) => h.name + ' ' + h.value),
    ...(r.response?.headers ?? []).map((h) => h.name + ' ' + h.value),
    ...r.request.query.map((p) => p.name + ' ' + p.value),
    r.request.body?.text,
    r.response?.body?.text,
  ].some((value) => value?.toLowerCase().includes(q));
}
