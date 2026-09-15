import type { CapturedRequest, ReplayResult } from './model';
export type Difference = {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
};
export function structuralDiff(
  before: unknown,
  after: unknown,
  path = '$',
  depth = 0,
): Difference[] {
  if (Object.is(before, after)) return [];
  if (
    depth < 40 &&
    before !== null &&
    after !== null &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    Array.isArray(before) === Array.isArray(after)
  ) {
    const a = before as Record<string, unknown>,
      b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
      structuralDiff(a[key], b[key], path + '[' + JSON.stringify(key) + ']', depth + 1),
    );
  }
  return [
    {
      path,
      kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
      before,
      after,
    },
  ];
}
const jsonOrText = (s?: string) => {
  try {
    return s === undefined ? undefined : (JSON.parse(s) as unknown);
  } catch {
    return s;
  }
};
export function compareReplay(original: CapturedRequest, replay: ReplayResult): Difference[] {
  return structuralDiff(
    {
      request: { ...original.request, body: jsonOrText(original.request.body?.text) },
      response: original.response && {
        ...original.response,
        body: jsonOrText(original.response.body?.text),
      },
      duration: original.timing?.total,
    },
    {
      request: { ...replay.request, body: jsonOrText(replay.request.body?.text) },
      response: replay.response && {
        ...replay.response,
        body: jsonOrText(replay.response.body?.text),
      },
      duration: replay.duration,
    },
  );
}
