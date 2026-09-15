import type { CapturedRequest } from './model';
import { errorCategory, normalizeEndpoint } from './parse';
export function percentile(values: number[], p: number) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
export function statistics(records: CapturedRequest[]) {
  const times = records.flatMap((r) => (r.timing?.total === undefined ? [] : [r.timing.total]));
  const sizes = records.flatMap((r) => (r.response?.size === undefined ? [] : [r.response.size]));
  const distribution = (key: (r: CapturedRequest) => string) =>
    Object.entries(
      records.reduce<Record<string, number>>(
        (acc, r) => {
          const k = key(r);
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        },
        Object.create(null) as Record<string, number>,
      ),
    ).sort((a, b) => b[1] - a[1]);
  return {
    total: records.length,
    success: records.filter(
      (r) => r.response && r.response.status >= 200 && r.response.status < 300,
    ).length,
    failed: records.filter((r) => r.metadata.error || (r.response?.status ?? 0) >= 400).length,
    average: times.length ? times.reduce((a, b) => a + b, 0) / times.length : undefined,
    p50: percentile(times, 0.5),
    p95: times.length >= 20 ? percentile(times, 0.95) : undefined,
    p99: times.length >= 100 ? percentile(times, 0.99) : undefined,
    transfer: sizes.length ? sizes.reduce((a, b) => a + b, 0) : undefined,
    averageSize: sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : undefined,
    status: distribution(errorCategory),
    domains: distribution((r) => new URL(r.request.url).host),
    types: distribution((r) => r.metadata.resourceType),
    endpoints: distribution((r) => r.request.method + ' ' + normalizeEndpoint(r.request.url)),
    overTime: distribution((r) =>
      new Date(Math.floor(r.timestamp / 60000) * 60000).toLocaleTimeString(),
    ),
    latency: distribution((r) =>
      r.timing?.total === undefined
        ? 'Unavailable'
        : r.timing.total < 100
          ? '<100 ms'
          : r.timing.total < 500
            ? '100–500 ms'
            : r.timing.total < 1000
              ? '500–1000 ms'
              : '>1 s',
    ),
    slowest: [...records]
      .sort((a, b) => (b.timing?.total ?? -1) - (a.timing?.total ?? -1))
      .slice(0, 10),
    largest: [...records]
      .sort((a, b) => (b.response?.size ?? -1) - (a.response?.size ?? -1))
      .slice(0, 10),
  };
}
