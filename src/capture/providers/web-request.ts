import { uid, type CapturedRequest, type Pair } from '../../shared/model';
import { header, makeBody, parseUrl, unavailable, bodyType } from '../../shared/parse';
import { type CaptureContext, type CaptureProvider, serialQueue } from '../types';
import { CoalescedTask } from '../../shared/coalesced-task';
import { hasCaptureAccess } from '../../shared/permissions';

const pairs = (headers?: chrome.webRequest.HttpHeader[]): Pair[] =>
  (headers ?? []).map((h) => ({
    name: h.name,
    value:
      h.value ?? (h.binaryValue ? '[Binary header: ' + h.binaryValue.byteLength + ' bytes]' : ''),
  }));
export class WebRequestProvider implements CaptureProvider {
  readonly name = 'webRequest';
  private queue;
  private subscriptions: (() => void)[] = [];
  private refresh = new CoalescedTask(async () => {
    if (!(await hasCaptureAccess())) {
      this.unregister();
      // An upgrade from a build with required webRequest, or external host
      // revocation, can leave the API granted without its hosts. Repair the pair
      // so subsequent cold starts do not register against absent host access.
      if (chrome.webRequest && (await chrome.permissions.contains({ permissions: ['webRequest'] })))
        await chrome.permissions.remove({ permissions: ['webRequest'] });
      return;
    }
    try {
      this.attach();
    } catch (error) {
      this.unregister();
      throw error;
    }
  });
  constructor(
    private context: CaptureContext,
    private isDebugged: (tabId: number) => boolean,
  ) {
    this.queue = serialQueue((message) => context.report(message, 'error'));
  }
  reconcile() {
    return this.refresh.run();
  }
  get subscribed() {
    return this.subscriptions.length === 6;
  }
  register() {
    // Chrome omits this namespace until the optional webRequest permission is granted.
    // We request it together with both hosts. Once granted, register synchronously:
    // waiting on a promise here loses the request that wakes an idle service worker.
    if (chrome.webRequest) {
      try {
        this.attach();
      } catch {
        this.unregister();
        this.context.report('Could not restore passive capture. Review website access.', 'error');
      }
    }
    void this.reconcile().catch(() =>
      this.context.report('Could not initialize passive capture. Check site access.', 'error'),
    );
  }
  private unregister() {
    for (const remove of this.subscriptions) remove();
    this.subscriptions = [];
  }
  private event(id: string, fn: (key: string) => Promise<void>) {
    this.queue(id, async () => fn((await this.context.epoch) + ':wr:' + id));
  }
  private attach() {
    if (this.subscriptions.length) return;
    const api = chrome.webRequest;
    const filter = { urls: ['http://*/*', 'https://*/*'] };
    const onBeforeRequest: Parameters<typeof chrome.webRequest.onBeforeRequest.addListener>[0] = (
      d,
    ) => {
      if (d.tabId < 0) return;
      this.event(d.requestId, async (key) => {
        if (this.isDebugged(d.tabId) || !(await this.context.accepts(d.tabId))) return;
        const settings = await this.context.settings();
        const parsed = parseUrl(d.url);
        let body = undefined;
        if (d.requestBody?.formData) {
          const fields = Object.entries(d.requestBody.formData).flatMap(([name, values]) =>
            values.map((value) => ({
              name,
              value: typeof value === 'string' ? value : '[Binary form field]',
              file: typeof value !== 'string',
            })),
          );
          body = {
            ...makeBody(
              new URLSearchParams(fields.map((p) => [p.name, p.value])).toString(),
              'application/x-www-form-urlencoded',
              settings.maxBodyBytes,
            ),
            fields:
              new TextEncoder().encode(
                new URLSearchParams(fields.map((p) => [p.name, p.value])).toString(),
              ).length <= settings.maxBodyBytes
                ? fields
                : undefined,
          };
        } else if (d.requestBody?.raw?.some((part) => part.file)) {
          body = unavailable(
            'Chrome exposed a file upload reference; the complete upload content is unavailable.',
          );
        } else if (d.requestBody?.raw) {
          const chunks = d.requestBody.raw.flatMap((p) =>
            p.bytes ? [new Uint8Array(p.bytes)] : [],
          );
          if (chunks.length) {
            const size = chunks.reduce((n, p) => n + p.length, 0),
              bytes = new Uint8Array(Math.min(size, settings.maxBodyBytes));
            let offset = 0;
            for (const chunk of chunks) {
              const part = chunk.subarray(0, bytes.length - offset);
              bytes.set(part, offset);
              offset += part.length;
            }
            try {
              body = makeBody(
                new TextDecoder('utf-8', { fatal: true }).decode(bytes, {
                  stream: size > settings.maxBodyBytes,
                }),
                '',
                settings.maxBodyBytes,
              );
            } catch {
              let binary = '';
              for (const value of bytes) binary += String.fromCharCode(value);
              body = makeBody(
                btoa(binary),
                'application/octet-stream',
                settings.maxBodyBytes,
                true,
              );
            }
            body.originalBytes = size;
            body.truncated = size > settings.maxBodyBytes;
          } else
            body = unavailable('Chrome exposed a file upload reference, but not its file content.');
        } else if (d.requestBody?.error)
          body = unavailable('Chrome could not expose the upload body.');
        const record: CapturedRequest = {
          id: uid(),
          timestamp: d.timeStamp,
          tabId: d.tabId,
          frameId: d.frameId,
          initiator: d.initiator,
          pageUrl: d.type === 'main_frame' ? d.url : d.initiator,
          request: {
            url: d.url,
            method: d.method,
            protocol: parsed.protocol,
            query: parsed.query,
            headers: [],
            body,
          },
          metadata: { provider: 'webRequest', resourceType: d.type, state: 'pending' },
          workspaceId: settings.workspaceId,
          sessionId: settings.sessionId,
          tags: [],
          isFavorite: false,
          isPinned: false,
        };
        this.context.enqueue(key, () => record);
      });
      return undefined;
    };
    api.onBeforeRequest.addListener(onBeforeRequest, filter, ['requestBody']);
    this.subscriptions.push(() => api.onBeforeRequest.removeListener(onBeforeRequest));
    const onBeforeSendHeaders: Parameters<
      typeof chrome.webRequest.onBeforeSendHeaders.addListener
    >[0] = (d) => {
      if (d.tabId < 0) return;
      this.event(d.requestId, async (key) => {
        this.context.enqueue(key, (r) => {
          if (!r) return;
          const headers = pairs(d.requestHeaders),
            contentType = header(headers, 'content-type');
          const body =
            r.request.body?.text !== undefined
              ? {
                  ...r.request.body,
                  type: bodyType(contentType, r.request.body.text),
                  truncated: r.request.body.truncated,
                  originalBytes: r.request.body.originalBytes,
                }
              : r.request.body;
          if (body && contentType?.includes('multipart')) {
            body.type = 'multipart';
            body.fields = r.request.body?.fields;
            body.reason =
              'Chrome may omit uploaded file content. Captured fields cannot reproduce the original multipart boundaries.';
          }
          return { ...r, request: { ...r.request, headers, contentType, body } };
        });
      });
      return undefined;
    };
    api.onBeforeSendHeaders.addListener(onBeforeSendHeaders, filter, [
      'requestHeaders',
      'extraHeaders',
    ]);
    this.subscriptions.push(() => api.onBeforeSendHeaders.removeListener(onBeforeSendHeaders));
    const onHeadersReceived: Parameters<
      typeof chrome.webRequest.onHeadersReceived.addListener
    >[0] = (d) => {
      if (d.tabId < 0) return;
      this.event(d.requestId, async (key) => {
        this.context.enqueue(
          key,
          (r) =>
            r && {
              ...r,
              response: {
                status: d.statusCode,
                statusText: d.statusLine.replace(/^\S+\s+\d+\s*/, ''),
                headers: pairs(d.responseHeaders),
                contentType: header(pairs(d.responseHeaders), 'content-type'),
                body: unavailable(
                  'Passive capture cannot read response bodies. Enable response capture, then repeat the request.',
                ),
              },
              metadata: {
                ...r.metadata,
                mimeType: header(pairs(d.responseHeaders), 'content-type'),
              },
            },
        );
      });
      return undefined;
    };
    api.onHeadersReceived.addListener(onHeadersReceived, filter, [
      'responseHeaders',
      'extraHeaders',
    ]);
    this.subscriptions.push(() => api.onHeadersReceived.removeListener(onHeadersReceived));
    const onCompleted: Parameters<typeof chrome.webRequest.onCompleted.addListener>[0] = (d) => {
      if (d.tabId < 0) return;
      this.event(d.requestId, async (key) => {
        this.context.enqueue(
          key,
          (r) =>
            r && {
              ...r,
              timing: { total: Math.max(0, d.timeStamp - r.timestamp) },
              metadata: {
                ...r.metadata,
                state: 'complete',
                fromCache: d.fromCache,
                remoteAddress: d.ip,
              },
              response: r.response && { ...r.response, status: d.statusCode },
            },
        );
      });
    };
    api.onCompleted.addListener(onCompleted, filter);
    this.subscriptions.push(() => api.onCompleted.removeListener(onCompleted));
    const onBeforeRedirect: Parameters<typeof chrome.webRequest.onBeforeRedirect.addListener>[0] = (
      d,
    ) => {
      if (d.tabId < 0) return;
      this.event(d.requestId, async (key) => {
        this.context.enqueue(
          key,
          (r) =>
            r && {
              ...r,
              timing: { total: Math.max(0, d.timeStamp - r.timestamp) },
              metadata: { ...r.metadata, state: 'complete', redirectUrl: d.redirectUrl },
            },
        );
      });
    };
    api.onBeforeRedirect.addListener(onBeforeRedirect, filter);
    this.subscriptions.push(() => api.onBeforeRedirect.removeListener(onBeforeRedirect));
    const onErrorOccurred: Parameters<typeof chrome.webRequest.onErrorOccurred.addListener>[0] = (
      d,
    ) => {
      if (d.tabId < 0) return;
      this.event(d.requestId, async (key) => {
        this.context.enqueue(
          key,
          (r) =>
            r && {
              ...r,
              timing: { total: Math.max(0, d.timeStamp - r.timestamp) },
              metadata: { ...r.metadata, state: 'error', error: d.error },
            },
        );
      });
    };
    api.onErrorOccurred.addListener(onErrorOccurred, filter);
    this.subscriptions.push(() => api.onErrorOccurred.removeListener(onErrorOccurred));
  }
}
