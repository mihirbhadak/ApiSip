import { uid, type CapturedRequest, type Settings } from '../../shared/model';
import { header, headersFromObject, makeBody, parseUrl, unavailable } from '../../shared/parse';
import { type CaptureContext, type CaptureProvider, serialQueue } from '../types';
import type { CdpEvent, CdpResponse } from './cdp-types';

type Source = chrome.debugger.DebuggerSession;
export class DebuggerProvider implements CaptureProvider {
  readonly name = 'debugger';
  readonly attached = new Set<number>();
  private suppressed = new Set<number>();
  private queue;
  private reconcileTask = Promise.resolve();
  constructor(private context: CaptureContext) {
    this.queue = serialQueue((message) => context.report(message, 'error'));
  }
  private async command(source: Source, method: string, params?: Record<string, unknown>) {
    return chrome.debugger.sendCommand(source, method, params);
  }
  private async enable(source: Source, maxBytes: number) {
    await this.command(source, 'Network.enable', {
      maxTotalBufferSize: Math.min(maxBytes * 10, 100_000_000),
      maxResourceBufferSize: maxBytes,
      maxPostDataSize: maxBytes,
    });
    await this.command(source, 'Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [
        { type: 'iframe', exclude: false },
        { type: 'worker', exclude: false },
        { exclude: true },
      ],
    });
  }
  retry() {
    this.suppressed.clear();
  }
  reconcile(settings: Settings): Promise<void> {
    this.reconcileTask = this.reconcileTask
      .then(async () => {
        const allowed =
          settings.recording &&
          settings.provider === 'debugger' &&
          (await chrome.permissions.contains({ permissions: ['debugger'] }));
        const tabs = allowed ? await chrome.tabs.query({}) : [];
        const desired = new Set(
          tabs
            .filter(
              (t) =>
                t.id !== undefined &&
                /^https?:/.test(t.url ?? '') &&
                (settings.scope === 'all' || t.id === settings.activeTabId),
            )
            .map((t) => t.id!),
        );
        for (const id of this.attached) {
          if (!desired.has(id)) {
            this.attached.delete(id);
            try {
              await chrome.debugger.detach({ tabId: id });
            } catch {
              this.context.report('Debugger was already detached from a closed or changed tab.');
            }
          }
        }
        for (const id of desired) {
          if (this.attached.has(id) || this.suppressed.has(id)) continue;
          try {
            // A worker may restart while its Chrome debugger session is still attached.
            try {
              await this.command({ tabId: id }, 'Network.enable');
            } catch {
              await chrome.debugger.attach({ tabId: id }, '1.3');
            }
            this.attached.add(id);
            await this.enable({ tabId: id }, settings.maxBodyBytes);
            this.context.report('Response capture connected to tab ' + id + '.');
          } catch {
            this.attached.delete(id);
            this.suppressed.add(id);
            try {
              await chrome.debugger.detach({ tabId: id });
            } catch {
              /* no owned session */
            }
            this.context.report(
              'Response capture could not attach to tab ' +
                id +
                '. DevTools, browser policy or a restricted page may prevent attachment. Passive metadata capture remains available; use Retry in settings.',
              'error',
            );
          }
        }
      })
      .catch(() => {
        this.context.report(
          'Could not synchronize debugger targets. Check permissions in settings.',
          'error',
        );
      });
    return this.reconcileTask;
  }
  register() {
    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source.tabId === undefined || !this.attached.has(source.tabId)) return;
      this.attached.delete(source.tabId);
      this.suppressed.add(source.tabId);
      this.context.report(
        'Response capture detached from tab ' +
          source.tabId +
          ' (' +
          reason +
          '). Passive capture remains available.',
        'error',
      );
    });
    chrome.debugger.onEvent.addListener((source, method, raw) => {
      if (source.tabId === undefined) return;
      const p = (raw ?? {}) as CdpEvent;
      if (method === 'Target.attachedToTarget' && p.sessionId) {
        const child = { tabId: source.tabId, sessionId: p.sessionId };
        void this.context
          .settings()
          .then((s) => this.enable(child, s.maxBodyBytes))
          .catch(() =>
            this.context.report('A child frame or worker could not be instrumented.', 'error'),
          );
        return;
      }
      if (!method.startsWith('Network.') || !p.requestId) return;
      const key = 'cdp:' + source.tabId + ':' + (source.sessionId ?? 'root') + ':' + p.requestId;
      this.queue(key, async () => {
        const scopedKey = (await this.context.epoch) + ':' + key;
        const settings = await this.context.settings();
        if (method === 'Network.requestWillBeSent' && p.request && /^https?:/.test(p.request.url)) {
          if (!(await this.context.accepts(source.tabId!))) return;
          if (p.redirectResponse)
            await this.context.update(
              scopedKey,
              (r) =>
                r && {
                  ...this.withResponse(r, p.redirectResponse!),
                  metadata: { ...r.metadata, state: 'complete', redirectUrl: p.request!.url },
                  timing: {
                    total: Math.max(0, (p.wallTime ?? Date.now() / 1000) * 1000 - r.timestamp),
                  },
                },
            );
          let text = p.request.postData;
          if (text === undefined && p.request.hasPostData) {
            try {
              text = (
                (await this.command(source, 'Network.getRequestPostData', {
                  requestId: p.requestId,
                })) as { postData?: string } | undefined
              )?.postData;
            } catch {
              /* request body unavailable is represented below */
            }
          }
          const headers = headersFromObject(p.request.headers);
          const contentType = header(headers, 'content-type'),
            parsed = parseUrl(p.request.url);
          const body =
            text !== undefined
              ? makeBody(text, contentType, settings.maxBodyBytes)
              : p.request.hasPostData
                ? unavailable(
                    'Chrome did not expose this upload body; file content may be omitted.',
                  )
                : undefined;
          let operationName: string | undefined;
          if (body?.type === 'graphql') {
            try {
              operationName = (JSON.parse(body.text!) as { operationName?: string }).operationName;
            } catch {
              /* incomplete JSON */
            }
          }
          await this.context.update(scopedKey, () => ({
            id: uid(),
            timestamp: (p.wallTime ?? Date.now() / 1000) * 1000,
            tabId: source.tabId,
            frameId: p.frameId,
            pageUrl: p.documentURL,
            initiator:
              p.initiator?.url ?? p.initiator?.stack?.callFrames?.[0]?.url ?? p.initiator?.type,
            request: {
              url: p.request!.url,
              method: p.request!.method,
              protocol: parsed.protocol,
              headers,
              query: parsed.query,
              contentType,
              body,
            },
            metadata: {
              provider: 'debugger',
              resourceType: p.type ?? 'Other',
              state: 'pending',
              operationName,
              monotonicStart: p.timestamp,
            },
            workspaceId: settings.workspaceId,
            sessionId: settings.sessionId,
            tags: [],
            isFavorite: false,
            isPinned: false,
          }));
        } else if (method === 'Network.responseReceived' && p.response) {
          await this.context.update(scopedKey, (r) => r && this.withResponse(r, p.response!));
        } else if (method === 'Network.loadingFinished') {
          let body = unavailable(
            'Chrome did not expose this response body. It may be evicted, redirected, streamed or unavailable for this resource.',
          );
          try {
            if (
              p.encodedDataLength !== undefined &&
              p.encodedDataLength > settings.maxBodyBytes * 2
            ) {
              body = {
                ...unavailable(
                  'Response exceeds the capture buffer. Increase the body limit and repeat this request.',
                ),
                originalBytes: p.encodedDataLength,
              };
            } else {
              const result = (await this.command(source, 'Network.getResponseBody', {
                requestId: p.requestId,
              })) as { body: string; base64Encoded: boolean } | undefined;
              if (result)
                body = makeBody(result.body, '', settings.maxBodyBytes, result.base64Encoded);
            }
          } catch {
            /* explicit unavailable state is persisted */
          }
          await this.context.update(scopedKey, (r) => {
            if (!r) return;
            if (body.available && body.text !== undefined)
              body = {
                ...makeBody(
                  body.text,
                  r.response?.contentType,
                  settings.maxBodyBytes,
                  body.encoding === 'base64',
                ),
                truncated: body.truncated,
                originalBytes: body.originalBytes,
              };
            return {
              ...r,
              response: r.response && { ...r.response, body, size: p.encodedDataLength },
              timing: {
                ...r.timing,
                total:
                  p.timestamp !== undefined && r.metadata.monotonicStart !== undefined
                    ? Math.max(0, (p.timestamp - r.metadata.monotonicStart) * 1000)
                    : undefined,
              },
              metadata: { ...r.metadata, state: 'complete' },
            };
          });
        } else if (method === 'Network.loadingFailed') {
          await this.context.update(
            scopedKey,
            (r) =>
              r && {
                ...r,
                timing: {
                  ...r.timing,
                  total:
                    p.timestamp !== undefined && r.metadata.monotonicStart !== undefined
                      ? Math.max(0, (p.timestamp - r.metadata.monotonicStart) * 1000)
                      : undefined,
                },
                metadata: {
                  ...r.metadata,
                  state: 'error',
                  error:
                    p.blockedReason ?? p.errorText ?? (p.canceled ? 'Cancelled' : 'Network error'),
                },
              },
          );
        } else if (
          method === 'Network.webSocketCreated' &&
          p.url &&
          (await this.context.accepts(source.tabId!))
        ) {
          await this.context.update(scopedKey, () => ({
            id: uid(),
            timestamp: Date.now(),
            tabId: source.tabId,
            request: {
              method: 'GET',
              url: p.url!,
              protocol: new URL(p.url!).protocol,
              headers: [],
              query: parseUrl(p.url!).query,
            },
            metadata: {
              provider: 'debugger',
              resourceType: 'WebSocket',
              state: 'pending',
              connectionId: p.requestId,
              messages: [],
            },
            workspaceId: settings.workspaceId,
            sessionId: settings.sessionId,
            tags: [],
            isFavorite: false,
            isPinned: false,
          }));
        } else if (
          method === 'Network.webSocketFrameSent' ||
          method === 'Network.webSocketFrameReceived'
        ) {
          const frame = (raw as { response?: { opcode: number; payloadData: string } }).response;
          if (!frame) return;
          await this.context.update(scopedKey, (r) => {
            if (!r) return;
            const messages = r.metadata.messages ?? [];
            if (messages.length >= 200)
              return { ...r, metadata: { ...r.metadata, messageLimitReached: true } };
            return {
              ...r,
              metadata: {
                ...r.metadata,
                messages: [
                  ...messages,
                  {
                    direction: method.endsWith('Sent') ? 'sent' : 'received',
                    timestamp: Date.now(),
                    payload: frame.payloadData.slice(0, 16384),
                    opcode: frame.opcode,
                    truncated: frame.payloadData.length > 16384,
                  },
                ],
              },
            };
          });
        } else if (method === 'Network.webSocketClosed') {
          await this.context.update(
            scopedKey,
            (r) => r && { ...r, metadata: { ...r.metadata, state: 'complete' } },
          );
        }
      });
    });
  }
  private withResponse(r: CapturedRequest, response: CdpResponse): CapturedRequest {
    const t = response.timing;
    const duration = (start: number, end: number) =>
      start >= 0 && end >= start ? end - start : undefined;
    return {
      ...r,
      request: { ...r.request, protocol: response.protocol ?? r.request.protocol },
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: headersFromObject(response.headers),
        contentType: response.mimeType,
        body: unavailable('Waiting for the response to finish.'),
      },
      timing: t && {
        dns: duration(t.dnsStart, t.dnsEnd),
        connection: duration(t.connectStart, t.connectEnd),
        tls: duration(t.sslStart, t.sslEnd),
        request: duration(t.sendStart, t.sendEnd),
        response: duration(t.sendEnd, t.receiveHeadersEnd),
      },
      metadata: {
        ...r.metadata,
        mimeType: response.mimeType,
        fromCache: response.fromDiskCache,
        fromServiceWorker: response.fromServiceWorker,
        remoteAddress: response.remoteIPAddress,
        securityState: response.securityState,
      },
    };
  }
}
