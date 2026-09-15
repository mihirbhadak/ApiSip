import { afterEach, expect, it, vi } from 'vitest';
import { WebRequestProvider } from '../src/capture/providers/web-request';
import { defaultSettings, type CapturedRequest } from '../src/shared/model';
import type { CaptureContext } from '../src/capture/types';
afterEach(() => vi.unstubAllGlobals());
it('queues a complete passive lifecycle in event order without waiting between durable commits', async () => {
  type Event = {
    requestId: string;
    timeStamp: number;
    url: string;
    method: string;
    tabId: number;
    frameId: number;
    parentFrameId: number;
    type: 'xmlhttprequest';
    requestHeaders?: chrome.webRequest.HttpHeader[];
    responseHeaders?: chrome.webRequest.HttpHeader[];
    statusCode?: number;
    statusLine?: string;
    fromCache?: boolean;
  };
  const callbacks = new Map<string, (event: Event) => void>();
  vi.stubGlobal('chrome', {
    webRequest: Object.fromEntries(
      [
        'onBeforeRequest',
        'onBeforeSendHeaders',
        'onHeadersReceived',
        'onCompleted',
        'onBeforeRedirect',
        'onErrorOccurred',
      ].map((name) => [
        name,
        {
          addListener: (callback: (event: Event) => void) => callbacks.set(name, callback),
          removeListener: vi.fn(),
        },
      ]),
    ),
  });
  const records = new Map<string, CapturedRequest>();
  const changes: Parameters<CaptureContext['enqueue']>[] = [];
  const context: CaptureContext = {
    epoch: Promise.resolve('test-epoch'),
    settings: async () => ({ ...defaultSettings, recording: true, activeTabId: 1 }),
    accepts: async () => true,
    update: vi.fn(() => new Promise<CapturedRequest | undefined>(() => {})),
    enqueue: (key, change) => {
      changes.push([key, change]);
    },
    report: vi.fn(),
  };
  new WebRequestProvider(context, () => false).register();
  const event: Event = {
    requestId: 'one',
    timeStamp: 1,
    url: 'https://example.test/api',
    method: 'GET',
    tabId: 1,
    frameId: 0,
    parentFrameId: -1,
    type: 'xmlhttprequest',
  };
  callbacks.get('onBeforeRequest')!(event);
  callbacks.get('onBeforeSendHeaders')!({
    ...event,
    requestHeaders: [{ name: 'Accept', value: 'application/json' }],
  });
  callbacks.get('onHeadersReceived')!({
    ...event,
    statusCode: 200,
    statusLine: 'HTTP/1.1 200 OK',
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
  });
  callbacks.get('onCompleted')!({ ...event, timeStamp: 25, statusCode: 200, fromCache: false });
  await vi.waitFor(() => expect(changes).toHaveLength(4));
  expect(context.update).not.toHaveBeenCalled();
  for (const [key, change] of changes) {
    const next = change(records.get(key));
    if (next) records.set(key, next);
  }
  const captured = [...records.values()][0]!;
  expect(captured.metadata.state).toBe('complete');
  expect(captured.response?.status).toBe(200);
  expect(captured.request.headers[0]?.value).toBe('application/json');
  expect(captured.response?.body?.available).toBe(false);
  expect(captured.timing?.total).toBe(24);
  expect(context.report).not.toHaveBeenCalled();
  for (const callback of callbacks.values()) callback({ ...event, tabId: -1 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(changes).toHaveLength(4);
});
