import type { RunReport } from './model';
export function runJson(report: RunReport) {
  return JSON.stringify(
    { format: 'api-catcher-run', schemaVersion: 1, exportedAt: Date.now(), report },
    null,
    2,
  );
}
export function runCsv(report: RunReport) {
  const fields = [
    'index',
    'scheduledMs',
    'startedMs',
    'delayMs',
    'durationMs',
    'headersMs',
    'bodyMs',
    'bytes',
    'status',
    'outcome',
  ] as const;
  const rows = [
    ...new Map([...report.failures, ...report.recent].map((item) => [item.index, item])).values(),
  ].sort((a, b) => a.index - b.index);
  const cell = (value: unknown) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  return [
    fields.map(cell).join(','),
    ...rows.map((row) => fields.map((field) => cell(row[field])).join(',')),
  ].join('\r\n');
}
