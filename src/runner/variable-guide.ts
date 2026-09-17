import type { Pair, RequestData, BodyPath } from '../shared/model';
import {
  bodyFields,
  bodyFieldEnabled,
  setBodyField,
  type JsonValue,
} from '../shared/request-fields';
import { prepareHeaders, redactText, sensitiveName } from '../shared/security';
import { parseUrl } from '../shared/parse';

export type VariableField = {
  id: string;
  label: string;
  name: string;
  value: string | number | boolean | null;
  location: 'body' | 'header' | 'query';
  index?: number;
  path?: BodyPath;
};
const builtins = new Set(['index', 'uuid', 'timestamp', 'randomInt']);
const safeExample = (name: string, value: JsonValue) =>
  !sensitiveName(name) &&
  (value === null || typeof value !== 'object') &&
  String(value).length <= 200 &&
  !String(value).includes('{{') &&
  redactText(String(value)) === String(value);

/** Suggestions use only included, nonsecret scalar values. No body or credential leaves the device. */
export function variableFields(request: RequestData): VariableField[] {
  const fields: VariableField[] = [];
  const names = new Set<string>();
  const add = (field: Omit<VariableField, 'name'>, key: string) => {
    if (fields.length >= 24 || !safeExample(key, field.value)) return;
    const words = key.split(/[^A-Za-z0-9]+/).filter(Boolean);
    const base = (
      field.location + words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join('')
    ).slice(0, 60);
    let name = base,
      suffix = 2;
    while (names.has(name) || builtins.has(name)) name = base + suffix++;
    names.add(name);
    fields.push({ ...field, name });
  };
  for (const field of bodyFields(request.body).fields) {
    if (!field.container && bodyFieldEnabled(request.body!, field.path))
      add(
        {
          id: 'body:' + JSON.stringify(field.path),
          label: 'Body ' + field.label,
          value: field.value as VariableField['value'],
          location: 'body',
          path: field.path,
        },
        request.body?.type === 'form' ? field.label : field.path.join(' '),
      );
  }
  try {
    parseUrl(request.url)
      .query.slice(0, 100)
      .forEach((pair, index) =>
        add(
          {
            id: 'query:' + index,
            label: 'Query ' + pair.name,
            value: pair.value,
            location: 'query',
            index,
          },
          pair.name,
        ),
      );
  } catch {
    /* An unfinished editor URL has no query suggestions. */
  }
  request.headers.slice(0, 100).forEach((pair, index) => {
    try {
      if (prepareHeaders([pair]).headers.length)
        add(
          {
            id: 'header:' + index,
            label: 'Header ' + pair.name,
            value: pair.value,
            location: 'header',
            index,
          },
          pair.name,
        );
    } catch {
      /* Unfinished header rows are not suggestions. */
    }
  });
  return fields;
}

export function insertVariable(
  request: RequestData,
  field: VariableField,
  name: string,
): RequestData {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || builtins.has(name))
    throw new Error('Use a custom name starting with a letter; built-in names are reserved.');
  const placeholder = '{{' + name + '}}';
  if (field.location === 'header')
    return {
      ...request,
      headers: request.headers.map((pair, index) =>
        index === field.index ? { ...pair, value: placeholder } : pair,
      ),
    };
  if (field.location === 'query') {
    const url = new URL(request.url);
    url.search = new URLSearchParams(
      [...url.searchParams].map((pair, index) =>
        index === field.index ? [pair[0], placeholder] : pair,
      ),
    ).toString();
    return { ...request, url: url.href, query: parseUrl(url.href).query };
  }
  if (!request.body || !field.path) throw new Error('The body field is no longer available.');
  return { ...request, body: setBodyField(request.body, field.path, placeholder) };
}

export function uniqueVariableName(suggested: string, variables: Pair[], rows: string) {
  const used = new Set(variables.map((pair) => pair.name));
  try {
    const values: unknown = JSON.parse(rows);
    if (Array.isArray(values))
      for (const row of values)
        if (row && typeof row === 'object') Object.keys(row).forEach((key) => used.add(key));
  } catch {
    /* The form reports invalid JSON when adding or reviewing. */
  }
  let name = suggested,
    suffix = 2;
  while (used.has(name)) name = suggested + suffix++;
  return name;
}
