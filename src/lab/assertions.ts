import type { ResponseData } from '../shared/model';
import type { Assertion, CheckResult, Scalar } from './model';

const safeNumber = (value: number) =>
  Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));

export function pointerParts(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer))
    throw new Error('Use a JSON Pointer, such as /user/id or /items/0/name. Empty means the root.');
  const parts = pointer
    .slice(1)
    .split('/')
    .map((p) => p.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (parts.length > 32) throw new Error('JSON pointers are limited to 32 levels.');
  return parts;
}
export function atPointer(value: unknown, pointer: string): { exists: boolean; value?: unknown } {
  for (const part of pointerParts(pointer)) {
    if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(part)) return { exists: false };
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part))
      return { exists: false };
    value = (value as Record<string, unknown>)[part];
  }
  return { exists: true, value };
}
export function validateAssertion(check: Assertion) {
  if (check.source === 'json') pointerParts(check.selector);
  if (check.source === 'header' && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(check.selector))
    throw new Error('Enter a valid response header name.');
  if (
    ['lt', 'lte', 'gt', 'gte'].includes(check.operator) &&
    (!check.expected.trim() || !Number.isFinite(Number(check.expected)))
  )
    throw new Error('Numeric comparisons need a finite expected number.');
  if (
    check.operator === 'type' &&
    !['string', 'number', 'boolean', 'null', 'array', 'object'].includes(check.expected)
  )
    throw new Error('Type must be string, number, boolean, null, array or object.');
}
export function responseReader(response?: ResponseData) {
  let parsed = false,
    json: unknown;
  const body = () => {
    if (
      !response?.body?.available ||
      response.body.truncated ||
      response.body.encoding === 'base64' ||
      response.body.text === undefined
    )
      throw new Error('A complete text response body is required.');
    if (response.body.text.length > 1_048_576) throw new Error('Body checks are limited to 1 MB.');
    return response.body.text;
  };
  return (source: Assertion['source'], selector: string, duration?: number) => {
    if (source === 'duration') return { exists: duration !== undefined, value: duration };
    if (!response) throw new Error('No response was received.');
    if (source === 'status') return { exists: true, value: response.status };
    if (source === 'header') {
      const matches = response.headers.filter(
        (p) => p.name.toLowerCase() === selector.toLowerCase(),
      );
      // Fetch hides Set-Cookie; absence is not evidence of server omission.
      if (/^set-cookie$/i.test(selector) && !matches.length)
        throw new Error('Chrome fetch does not expose Set-Cookie.');
      return { exists: matches.length > 0, value: matches.map((p) => p.value).join(', ') };
    }
    if (source === 'body') return { exists: true, value: body() };
    if (!parsed) {
      json = JSON.parse(body()) as unknown;
      parsed = true;
    }
    return atPointer(json, selector);
  };
}
export function evaluateAssertions(
  checks: Assertion[],
  response?: ResponseData,
  duration?: number,
): CheckResult[] {
  const read = responseReader(response);
  return checks.map((check) => {
    try {
      validateAssertion(check);
      const actual = read(check.source, check.selector, duration);
      let expected: unknown = check.expected;
      if (check.source === 'json' || check.source === 'status' || check.source === 'duration') {
        try {
          expected = JSON.parse(check.expected) as unknown;
        } catch {
          /* Unquoted text is a string. */
        }
      }
      const type =
        actual.value === null
          ? 'null'
          : Array.isArray(actual.value)
            ? 'array'
            : typeof actual.value;
      if (
        check.source === 'json' &&
        !['exists', 'absent', 'type'].includes(check.operator) &&
        ((typeof actual.value === 'number' && !safeNumber(actual.value)) ||
          (typeof expected === 'number' && !safeNumber(expected)))
      )
        throw new Error('JSON numeric comparison exceeds safe precision.');
      let pass = false;
      switch (check.operator) {
        case 'exists':
          pass = actual.exists;
          break;
        case 'absent':
          pass = !actual.exists;
          break;
        case 'equals':
          pass =
            actual.exists && typeof actual.value !== 'object' && Object.is(actual.value, expected);
          if (actual.value === null) pass = expected === null;
          break;
        case 'notEquals':
          pass =
            actual.exists && typeof actual.value !== 'object' && !Object.is(actual.value, expected);
          if (actual.value === null) pass = expected !== null;
          break;
        case 'contains':
          pass = typeof actual.value === 'string' && actual.value.includes(check.expected);
          break;
        case 'type':
          pass = actual.exists && type === check.expected;
          break;
        case 'lt':
          pass = typeof actual.value === 'number' && actual.value < Number(check.expected);
          break;
        case 'lte':
          pass = typeof actual.value === 'number' && actual.value <= Number(check.expected);
          break;
        case 'gt':
          pass = typeof actual.value === 'number' && actual.value > Number(check.expected);
          break;
        case 'gte':
          pass = typeof actual.value === 'number' && actual.value >= Number(check.expected);
          break;
      }
      return {
        id: check.id,
        state: pass ? 'passed' : 'failed',
        message: pass
          ? 'Condition met'
          : actual.exists
            ? check.source === 'status' || check.source === 'duration'
              ? `Received ${String(actual.value)}${check.source === 'duration' ? ' ms' : ''}; expected ${check.operator} ${check.expected}.`
              : 'Condition not met. Check the selector, expected type and value. Response bodies are not retained in reports.'
            : 'The selected value is absent.',
      };
    } catch {
      return {
        id: check.id,
        state: 'inconclusive',
        message:
          'Cannot evaluate: check the selector and whether a complete, valid response is available.',
      };
    }
  });
}
export function extractScalar(
  read: ReturnType<typeof responseReader>,
  source: 'json' | 'header',
  selector: string,
): Scalar {
  const result = read(source, selector);
  if (
    !result.exists ||
    (result.value !== null && !['string', 'number', 'boolean'].includes(typeof result.value))
  )
    throw new Error('Extraction requires an existing scalar value.');
  if (typeof result.value === 'string' && result.value.length > 10000)
    throw new Error('Extracted value exceeds 10,000 characters.');
  if (typeof result.value === 'number' && !safeNumber(result.value))
    throw new Error('Extracted numbers must be finite and within safe integer precision.');
  return result.value as Scalar;
}
