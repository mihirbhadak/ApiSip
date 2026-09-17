import type { CapturedRequest } from '../shared/model';
import { redactText, redactUrl } from '../shared/security';
import { normalizeResourceType } from '../shared/resource-type';
import type { FilterNode, Predicate } from '../filters/engine';
import { parseFilter, printFilter } from '../filters/parser';
import type { Column } from './components/RequestTable';

export type CellFilter = { label: string; node: FilterNode };

/** Use actual metadata, not rounded labels or placeholders such as Pending and —. */
export function requestCellFilter(
  record: CapturedRequest,
  column: Column,
  mask: boolean,
): CellFilter | undefined {
  const fields: Record<Column, string> = {
    Method: 'method',
    URL: 'url',
    Status: 'status',
    Type: 'resourceType',
    Time: 'timing.total',
    Size: 'size',
    Domain: 'domain',
    Timestamp: 'timestamp',
    Initiator: 'initiator',
    Protocol: 'protocol',
    MIME: 'mimeType',
    Tab: 'tabId',
    Frame: 'frameId',
    Cache: 'cache',
    Tags: 'tag',
  };
  const values: Record<Column, unknown> = {
    Method: record.request.method,
    URL: record.request.url,
    Status: record.metadata.error ? undefined : record.response?.status,
    Type: normalizeResourceType(record.metadata.resourceType),
    Time: record.timing?.total,
    Size: record.response?.size,
    Domain: new URL(record.request.url).host,
    Timestamp: record.timestamp,
    Initiator: record.initiator,
    Protocol: record.request.protocol,
    MIME: record.metadata.mimeType ?? record.response?.contentType,
    Tab: record.tabId,
    Frame: record.frameId,
    Cache: record.metadata.fromCache,
    Tags: record.tags,
  };
  const raw = values[column];
  if (
    raw === undefined ||
    raw === null ||
    raw === '' ||
    (typeof raw === 'number' && !Number.isFinite(raw))
  )
    return;
  const items = Array.isArray(raw) ? raw.map(String) : [String(raw)];
  if (!items.length) return;
  // Filters are visible and can be saved/exported. Never put a hidden secret in their expression.
  const redact = column === 'URL' || column === 'Initiator' ? redactUrl : redactText;
  if (mask && items.some((value) => redact(value) !== value)) return;
  const rules: Predicate[] = items.map((value) => ({
    type: 'predicate',
    field: fields[column],
    operator: '=',
    value,
  }));
  const node: FilterNode = rules.length === 1 ? rules[0]! : { type: 'and', children: rules };
  const value = column === 'Type' && items[0] === 'xhr' ? 'XHR' : items.join(', ');
  return { label: `${column} = ${value.length > 70 ? value.slice(0, 67) + '…' : value}`, node };
}

/** Append a conjunct, preserving OR/NOT semantics and avoiding duplicate/nested ANDs. */
export function appendCellFilter(expression: string, addition: FilterNode): string {
  const current = parseFilter(expression);
  const conjuncts = (node: FilterNode): FilterNode[] =>
    node.type === 'and' ? node.children.flatMap(conjuncts) : [node];
  const children = conjuncts(current);
  const seen = new Set(children.map(printFilter));
  for (const child of conjuncts(addition)) {
    const key = printFilter(child);
    if (!seen.has(key)) {
      children.push(child);
      seen.add(key);
    }
  }
  const result = printFilter(children.length === 1 ? children[0]! : { type: 'and', children });
  parseFilter(result); // Enforce the same complexity/length limits as the visual builder.
  return result;
}
