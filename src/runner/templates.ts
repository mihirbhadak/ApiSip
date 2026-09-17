import type { RunPlan } from './model';
import { prepareHeaders, safeHttpUrl } from '../shared/security';
import { materializeRequest } from '../shared/request-fields';

const token = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
const builtinNames = new Set(['index', 'uuid', 'timestamp', 'randomInt']);
const decodePlaceholders = (text: string) =>
  text.replace(/%7B%7B(.*?)%7D%7D/gi, (_, name: string) => '{{' + decodeURIComponent(name) + '}}');
type Value = string | number | boolean | null;
type Json = Value | Json[] | { [key: string]: Json };
type Values = Map<string, Value>;
function validateJsonShape(value: Json, depth = 0, budget = { nodes: 0 }) {
  if (depth > 32 || ++budget.nodes > 20000)
    throw new Error('JSON templates are limited to 32 levels and 20,000 values.');
  if (value && typeof value === 'object')
    for (const child of Object.values(value)) validateJsonShape(child, depth + 1, budget);
}
export type PreparedRunRequest = {
  url: string;
  method: string;
  headers: [string, string][];
  body?: string;
};

function substitute(text: string, values: Values, encode = false) {
  return text.replace(token, (_, name: string) => {
    if (!values.has(name)) throw new Error('Unknown variable: ' + name);
    const value = String(values.get(name) ?? '');
    return encode ? encodeURIComponent(value) : value;
  });
}
function jsonTemplate(value: Json, values: Values): Json {
  if (typeof value === 'string') {
    const whole = /^\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}$/.exec(value);
    if (whole) {
      if (!values.has(whole[1]!)) throw new Error('Unknown variable: ' + whole[1]);
      return values.get(whole[1]!)!;
    }
    return substitute(value, values);
  }
  if (Array.isArray(value)) return value.map((item) => jsonTemplate(item, values));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonTemplate(item, values)]),
    );
  return value;
}
function seededInt(seed: number, index: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) % 1_000_000;
}
export function compileRunRequest(plan: RunPlan) {
  const request = materializeRequest(plan.request);
  const urlTemplate = request.url.replace(
    /%7B%7B(.*?)%7D%7D/gi,
    (_, name: string) => '{{' + decodeURIComponent(name) + '}}',
  );
  const authority = /^https?:\/\/[^/?#]*/i.exec(urlTemplate)?.[0];
  if (!authority || authority.includes('{{'))
    throw new Error(
      'Use a fixed HTTP(S) origin; variables belong in paths, query values, headers or bodies.',
    );
  const origin = safeHttpUrl(authority).origin;
  if (['CONNECT', 'TRACE', 'TRACK'].includes(request.method.toUpperCase()))
    throw new Error('Chrome cannot send this HTTP method.');
  if (
    request.body &&
    (!request.body.available ||
      request.body.truncated ||
      request.body.encoding === 'base64' ||
      request.body.type === 'multipart')
  )
    throw new Error(
      'Replace the incomplete, binary or multipart body before starting a timed run.',
    );
  if (
    new TextEncoder().encode(request.body?.text ?? '').byteLength > 1_048_576 ||
    request.headers.length > 100
  )
    throw new Error('Timed runs allow at most 1 MB of request text and 100 headers.');
  const prepared = prepareHeaders(request.headers);
  const constants = new Map<string, Value>();
  for (const { name, value } of plan.variables) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || builtinNames.has(name) || constants.has(name))
      throw new Error('Variable names must be unique identifiers and cannot replace built-ins.');
    constants.set(name, value);
  }
  for (const row of plan.rows) {
    if (
      Object.keys(row).length > 100 ||
      Object.keys(row).some((key) => builtinNames.has(key) || !/^[A-Za-z][A-Za-z0-9_]*$/.test(key))
    )
      throw new Error('Data rows allow 100 named values; built-in names are reserved.');
  }
  let json: Json | undefined;
  const text =
    request.body?.text === undefined
      ? undefined
      : request.body.type === 'form'
        ? decodePlaceholders(request.body.text)
        : request.body.text;
  if (text && (request.body?.type === 'json' || request.body?.type === 'graphql')) {
    try {
      json = JSON.parse(text) as Json;
    } catch {
      throw new Error('JSON templates must be valid JSON. Put placeholders inside quotes.');
    }
  }
  if (json !== undefined) validateJsonShape(json);
  const omitBody = ['GET', 'HEAD'].includes(request.method.toUpperCase());
  const required = new Set<string>();
  const bodyTokens = new Map<string, number>();
  let tokenCount = 0;
  for (const segment of [
    urlTemplate,
    ...prepared.headers.map((pair) => pair.value),
    ...(omitBody ? [] : [text ?? '']),
  ])
    for (const match of segment.matchAll(token)) {
      required.add(match[1]!);
      if (++tokenCount > 1000)
        throw new Error('A run template supports at most 1,000 placeholders.');
    }
  for (const match of (text ?? '').matchAll(token))
    bodyTokens.set(match[1]!, (bodyTokens.get(match[1]!) ?? 0) + 1);
  const bodyHasVariables = bodyTokens.size > 0;
  const encoder = new TextEncoder();
  const baseBodyBytes = encoder.encode(text ?? '').byteLength;
  const render = (
    index: number,
    timestamp = Date.now(),
    uuid: string = crypto.randomUUID(),
    includeBody = true,
  ): PreparedRunRequest => {
    const values = new Map(constants);
    const row = plan.rows[index % plan.rows.length];
    if (row) for (const [key, value] of Object.entries(row)) values.set(key, value);
    values.set('index', includeBody ? index + 1 : plan.config.count);
    values.set('timestamp', timestamp);
    values.set('uuid', uuid);
    values.set('randomInt', seededInt(plan.seed, index));
    for (const name of required)
      if (!values.has(name)) throw new Error('Unknown variable: ' + name);
    const url = substitute(urlTemplate, values, true);
    if (url.length > 65536) throw new Error('Expanded URL exceeds 64 KB.');
    if (safeHttpUrl(url).origin !== origin)
      throw new Error('Variables cannot change the target origin.');
    const headers: [string, string][] = prepared.headers.map((pair) => [
      pair.name,
      substitute(pair.value, values),
    ]);
    // Let the native Headers validator reject invalid values before any traffic.
    new Headers(headers);
    if (
      headers.reduce((sum, [name, value]) => sum + encoder.encode(name + value).byteLength, 0) >
      65536
    )
      throw new Error('Expanded headers exceed 64 KB.');
    let expandedBudget = baseBodyBytes;
    for (const [name, count] of bodyTokens)
      expandedBudget +=
        count *
        encoder.encode(JSON.stringify(values.get(name) ?? '')).byteLength *
        (request.body?.type === 'form' ? 3 : 1);
    if (!omitBody && bodyHasVariables && expandedBudget > 1_048_576)
      throw new Error(
        'Expanded request body may exceed 1 MB. Reduce the template or variable values.',
      );
    let body =
      omitBody || !includeBody
        ? undefined
        : !bodyHasVariables
          ? text
          : json !== undefined
            ? JSON.stringify(jsonTemplate(json, values))
            : text === undefined
              ? undefined
              : substitute(text, values, request.body?.type === 'form');
    if (body && body.length > 1_048_576) throw new Error('Expanded request body exceeds 1 MB.');
    if (omitBody) body = undefined;
    return { url, method: request.method.toUpperCase(), headers, body };
  };
  // Validate all rows without materializing a response or a body for each row.
  for (let i = 0; i < Math.max(1, plan.rows.length); i++)
    render(i, 9999999999999, '00000000-0000-4000-8000-000000000000', false);
  const warnings = [...prepared.warnings];
  if (omitBody && text) warnings.push('GET/HEAD request bodies are omitted.');
  return { origin, render, warnings };
}
