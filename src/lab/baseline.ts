import { z } from 'zod';
import type { ResponseData } from '../shared/model';

const pointer = z
  .string()
  .max(2048)
  .refine(
    (p) => p === '' || (p.startsWith('/') && !/~(?![01])/u.test(p) && p.split('/').length <= 33),
  );
export const baselineSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    fields: z
      .array(
        z.object({
          path: pointer,
          type: z.enum(['object', 'array', 'string', 'number', 'boolean', 'null']),
        }),
      )
      .min(1)
      .max(2000),
    ignoredPaths: z
      .array(pointer.refine((p) => p !== '', 'Cannot ignore the entire response.'))
      .max(100),
    allowAdditional: z.boolean(),
  })
  .refine((b) => {
    const fields = new Map(b.fields.map((f) => [f.path, f.type]));
    return (
      fields.size === b.fields.length &&
      fields.has('') &&
      b.fields.every((f) => {
        if (!f.path) return true;
        const split = f.path.lastIndexOf('/');
        const parent = fields.get(f.path.slice(0, split));
        return (
          parent === 'object' ||
          (parent === 'array' && /^(0|[1-9][0-9]*)$/.test(f.path.slice(split + 1)))
        );
      })
    );
  }, 'Baseline paths must be unique and have valid container parents.');
export type ResponseBaseline = z.infer<typeof baselineSchema>;
const escapePart = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');
const ignored = (path: string, paths: string[]) =>
  paths.some((p) => path === p || path.startsWith(p + '/'));

export function jsonShape(text: string, ignoredPaths: string[] = []): ResponseBaseline['fields'] {
  if (text.length > 1_048_576 || new TextEncoder().encode(text).byteLength > 1_048_576)
    throw new Error('Baseline samples are limited to 1 MB of UTF-8.');
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error('A complete, valid JSON sample is required.');
  }
  const fields: ResponseBaseline['fields'] = [];
  const visit = (v: unknown, path: string, depth: number) => {
    if (ignored(path, ignoredPaths)) return;
    if (depth > 32 || fields.length >= 2000 || path.length > 2048)
      throw new Error(
        'Baseline checks support up to 2,000 fields, 32 levels and 2,048 characters per path.',
      );
    const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    if (!['null', 'array', 'object', 'string', 'number', 'boolean'].includes(type))
      throw new Error('Unsupported JSON value.');
    fields.push({ path, type: type as ResponseBaseline['fields'][number]['type'] });
    if (v !== null && typeof v === 'object')
      for (const [key, child] of Object.entries(v))
        visit(child, path + '/' + escapePart(key), depth + 1);
  };
  visit(value, '', 0);
  return fields;
}
export function createBaseline(text: string, name = 'Response structure'): ResponseBaseline {
  return baselineSchema.parse({
    name,
    fields: jsonShape(text),
    ignoredPaths: [],
    allowAdditional: false,
  });
}
export function capturedBaseline(response?: ResponseData) {
  if (
    !response?.body?.available ||
    response.body.truncated ||
    response.body.encoding === 'base64' ||
    response.body.text === undefined
  )
    throw new Error(
      'A complete captured JSON response is required. Capture again or paste a sample.',
    );
  return createBaseline(response.body.text);
}
export function compareBaseline(baseline: ResponseBaseline, response?: ResponseData) {
  baselineSchema.parse(baseline);
  if (
    !response?.body?.available ||
    response.body.truncated ||
    response.body.encoding === 'base64' ||
    response.body.text === undefined
  )
    throw new Error('A complete JSON response is required for baseline comparison.');
  const expected = new Map(
    baseline.fields
      .filter((f) => !ignored(f.path, baseline.ignoredPaths))
      .map((f) => [f.path, f.type]),
  );
  const actual = new Map(
    jsonShape(response.body.text, baseline.ignoredPaths).map((f) => [f.path, f.type]),
  );
  const changes: string[] = [];
  let count = 0;
  const change = (text: string) => {
    count++;
    if (changes.length < 20) changes.push(text);
  };
  for (const [path, type] of expected) {
    if (!actual.has(path)) change(`Removed ${path || '(root)'}`);
    else if (actual.get(path) !== type)
      change(`Changed ${path || '(root)'}: ${type} → ${actual.get(path)}`);
  }
  if (!baseline.allowAdditional)
    for (const path of actual.keys()) if (!expected.has(path)) change(`Added ${path || '(root)'}`);
  return { count, changes };
}
