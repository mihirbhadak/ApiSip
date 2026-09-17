import type { Body, BodyPath, RequestData } from './model';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const pathKey = (path: BodyPath) => JSON.stringify(path);
export const pathLabel = (path: BodyPath) =>
  '$' + path.map((part) => '[' + JSON.stringify(part) + ']').join('');
export const pathWithin = (path: BodyPath, parent: BodyPath) =>
  parent.length <= path.length && parent.every((part, index) => path[index] === part);
export const bodyFieldEnabled = (body: Body, path: BodyPath) =>
  body.enabled !== false && !body.excludedPaths?.some((parent) => pathWithin(path, parent));
export type BodyField = { path: BodyPath; label: string; value: JsonValue; container: boolean };

/** Bounded editor inventory. Paths always refer to the original draft, including array indices. */
export function bodyFields(body?: Body): { fields: BodyField[]; note?: string } {
  if (!body || !body.available || body.truncated || body.encoding === 'base64')
    return { fields: [] };
  if ((body.text?.length ?? 0) > 1_048_576)
    return {
      fields: [],
      note: 'Field controls are available for bodies up to 1 MB. You can still exclude the entire body.',
    };
  if (body.type === 'form') {
    const pairs = [...new URLSearchParams(body.text)];
    return {
      fields: pairs.slice(0, 300).map(([name, value], index) => ({
        path: [index],
        label: `${name} [${index + 1}]`,
        value,
        container: false,
      })),
      note: pairs.length > 300 ? 'Showing the first 300 form fields.' : undefined,
    };
  }
  if (!['json', 'graphql'].includes(body.type)) return { fields: [] };
  try {
    const root = JSON.parse(body.text ?? '') as JsonValue;
    const fields: BodyField[] = [];
    let limited = false;
    const visit = (value: JsonValue, path: BodyPath) => {
      if (fields.length >= 300 || path.length > 32) {
        limited = true;
        return;
      }
      const container = value !== null && typeof value === 'object';
      if (path.length) fields.push({ path, label: pathLabel(path), value, container });
      if (container) {
        for (const [key, child] of Object.entries(value)) {
          if (fields.length >= 300) {
            limited = true;
            break;
          }
          visit(child, [...path, Array.isArray(value) ? Number(key) : key]);
        }
      }
    };
    visit(root, []);
    return {
      fields,
      note: limited
        ? 'Showing up to 300 fields and 32 levels. Excluding a parent also excludes its children.'
        : undefined,
    };
  } catch {
    return { fields: [], note: 'Enter valid JSON to use individual field controls.' };
  }
}

type PathTree = { remove?: boolean; children: Map<string | number, PathTree> };
function omitJson(value: JsonValue, tree: PathTree): JsonValue {
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value).flatMap(([key, child]) => {
    const node = tree.children.get(Array.isArray(value) ? Number(key) : key);
    return node?.remove ? [] : [[key, node ? omitJson(child, node) : child] as const];
  });
  return Array.isArray(value) ? entries.map(([, child]) => child) : Object.fromEntries(entries);
}

/** The one outbound projection used by replay, timed runs and executable snippets. Never mutates a draft. */
export function materializeRequest(request: RequestData): RequestData {
  let body = request.body;
  if (body?.enabled === false) body = undefined;
  else if (body) {
    const excluded = body.excludedPaths ?? [];
    let text = body.text;
    if (excluded.length) {
      if (!body.available || body.truncated || body.encoding === 'base64')
        throw new Error('Replace the incomplete body or exclude it before sending.');
      if (body.type === 'form') {
        text = new URLSearchParams(
          [...new URLSearchParams(text)].filter(
            (_, index) => !excluded.some((path) => path.length === 1 && path[0] === index),
          ),
        ).toString();
      } else if (body.type === 'json' || body.type === 'graphql') {
        let value: JsonValue;
        try {
          value = JSON.parse(text ?? '') as JsonValue;
        } catch {
          throw new Error(
            'The body must be valid JSON to exclude individual fields. Your exclusions are still saved.',
          );
        }
        const tree: PathTree = { children: new Map() };
        for (const path of excluded) {
          let node = tree;
          for (const part of path) {
            if (!node.children.has(part)) node.children.set(part, { children: new Map() });
            node = node.children.get(part)!;
          }
          node.remove = true;
        }
        text = JSON.stringify(omitJson(value, tree));
      } else
        throw new Error(
          'This body format does not support individual exclusions. Restore fields or exclude the entire body.',
        );
    }
    const bytes =
      text === undefined || !excluded.length ? body.bytes : new TextEncoder().encode(text).length;
    body = {
      ...body,
      text,
      bytes,
      originalBytes: excluded.length ? bytes : body.originalBytes,
      enabled: undefined,
      excludedPaths: undefined,
      fields:
        body.type === 'form'
          ? [...new URLSearchParams(text)].map(([name, value]) => ({ name, value }))
          : body.fields,
    };
  }
  return {
    ...request,
    headers: request.headers
      .filter((pair) => pair.enabled !== false)
      .map(({ name, value }) => ({ name, value })),
    body,
  };
}

export function setBodyField(body: Body, path: BodyPath, value: JsonValue): Body {
  let text: string;
  if (body.type === 'form') {
    text = new URLSearchParams(
      [...new URLSearchParams(body.text)].map((pair, index) =>
        index === path[0] ? [pair[0], String(value)] : pair,
      ),
    ).toString();
  } else {
    const root = JSON.parse(body.text ?? '') as JsonValue;
    let parent = root;
    for (const key of path.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key))
        throw new Error('Body field no longer exists.');
      parent = (parent as Record<string | number, JsonValue>)[key]!;
    }
    const key = path.at(-1)!;
    if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key))
      throw new Error('Body field no longer exists.');
    Object.defineProperty(parent, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    text = JSON.stringify(root, null, 2);
  }
  const bytes = new TextEncoder().encode(text).length;
  return {
    ...body,
    text,
    bytes,
    originalBytes: bytes,
    fields:
      body.type === 'form'
        ? [...new URLSearchParams(text)].map(([name, value]) => ({ name, value }))
        : body.fields,
  };
}
