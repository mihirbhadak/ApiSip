import type { Measurement, RunConfig } from './model';
import type { PreparedRunRequest } from './templates';

export type ResponseMeasurement = Omit<
  Measurement,
  'index' | 'scheduledMs' | 'startedMs' | 'delayMs'
>;
export async function measureRequest(
  request: PreparedRunRequest,
  config: RunConfig,
  signal: AbortSignal,
): Promise<ResponseMeasurement> {
  const start = performance.now();
  const abort = new AbortController();
  let timedOut = false,
    bytes = 0,
    headersMs: number | undefined,
    status: number | undefined;
  const stop = () => abort.abort();
  if (signal.aborted) stop();
  signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, config.timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'manual',
      signal: abort.signal,
    });
    headersMs = performance.now() - start;
    if (
      response.type === 'opaqueredirect' ||
      (response.status >= 300 && response.status < 400 && response.headers.has('location'))
    ) {
      await response.body?.cancel();
      return {
        durationMs: headersMs,
        headersMs,
        bytes: 0,
        status: response.status || undefined,
        outcome: 'redirect-blocked',
      };
    }
    status = response.status;
    if (status === 429 && config.stopOn429) {
      await response.body?.cancel();
      return {
        durationMs: performance.now() - start,
        headersMs,
        bytes: 0,
        status,
        outcome: 'http-error',
      };
    }
    const reader = response.body?.getReader();
    let limited = false;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > config.maxResponseBytes) {
            limited = true;
            await reader.cancel();
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
    const durationMs = performance.now() - start;
    return {
      durationMs,
      headersMs,
      bodyMs: durationMs - headersMs,
      bytes,
      status,
      outcome: limited
        ? 'body-limit'
        : status < config.expectedStatusMin || status > config.expectedStatusMax
          ? 'http-error'
          : config.latencyBudgetMs > 0 && durationMs > config.latencyBudgetMs
            ? 'latency-failed'
            : 'ok',
    };
  } catch {
    const durationMs = performance.now() - start;
    return {
      durationMs,
      headersMs,
      bodyMs: headersMs === undefined ? undefined : durationMs - headersMs,
      bytes,
      status,
      outcome: signal.aborted ? 'cancelled' : timedOut ? 'timeout' : 'network-error',
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}
