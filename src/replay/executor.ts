import {
  uid,
  type CapturedRequest,
  type ReplayResult,
  type RequestData,
  type Settings,
} from '../shared/model';
import { makeBody, parseUrl } from '../shared/parse';
import { prepareHeaders, safeHttpUrl } from '../shared/security';
import { fetchInContext, type FetchInput } from './fetch';
import { materializeRequest } from '../shared/request-fields';

export async function executeReplay(
  original: CapturedRequest,
  draft: RequestData,
  context: Settings['replayContext'],
  maxBytes: number,
): Promise<ReplayResult> {
  draft = materializeRequest(draft);
  safeHttpUrl(draft.url);
  if (['CONNECT', 'TRACE', 'TRACK'].includes(draft.method.toUpperCase()))
    throw new Error('Chrome fetch does not support this HTTP method.');
  if (
    draft.body?.truncated ||
    draft.body?.encoding === 'base64' ||
    draft.body?.type === 'multipart' ||
    (draft.body && !draft.body.available)
  )
    throw new Error(
      'This body is incomplete or cannot be reproduced as text. Replace it in the editor before sending.',
    );
  const prepared = prepareHeaders(draft.headers);
  const omitBody = ['GET', 'HEAD'].includes(draft.method.toUpperCase());
  if (omitBody && draft.body?.text)
    prepared.warnings.push('Chrome fetch omits bodies for GET and HEAD requests.');
  const selected =
    context === 'auto' ? (original.tabId !== undefined ? 'browser' : 'extension') : context;
  const request = {
    ...draft,
    method: draft.method.toUpperCase(),
    headers: prepared.headers,
    body: omitBody ? undefined : draft.body,
    cookies: undefined,
    query: parseUrl(draft.url).query,
  };
  const result: ReplayResult = {
    id: uid(),
    timestamp: Date.now(),
    context: selected,
    request,
    duration: 0,
    warnings: prepared.warnings,
  };
  const input: FetchInput = {
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: request.body?.text,
    maxBytes,
    credentials: selected === 'browser' ? 'include' : 'omit',
  };
  const start = performance.now();
  try {
    let output;
    if (selected === 'browser') {
      if (original.tabId === undefined)
        throw new Error('This request has no source tab. Choose extension context.');
      const tab = await chrome.tabs.get(original.tabId);
      if (!tab.url || !/^https?:/.test(tab.url))
        throw new Error('Source tab is unavailable or restricted.');
      input.expectedOrigin = new URL(
        original.pageUrl && /^https?:/.test(original.pageUrl) ? original.pageUrl : tab.url,
      ).origin;
      const results = await chrome.scripting.executeScript({
        target: { tabId: original.tabId },
        world: 'ISOLATED',
        func: fetchInContext,
        args: [input],
      });
      const first = results[0];
      if (!first?.result)
        throw new Error(
          'Browser replay failed. The tab may have navigated, closed, or blocked the request through CORS.',
        );
      output = first.result;
    } else {
      const origin = safeHttpUrl(request.url).origin + '/*';
      if (!(await chrome.permissions.contains({ origins: [origin] })))
        throw new Error(
          'Site access is required for extension replay. Grant site access in capture settings.',
        );
      output = await fetchInContext(input);
      result.warnings.push(
        'Extension replay omits ambient cookies. Redirect destinations still require host access.',
      );
    }
    const body = makeBody(output.text, output.contentType, maxBytes, output.binary);
    body.truncated = output.truncated;
    if (output.truncated) body.originalBytes = undefined;
    result.response = {
      status: output.status,
      statusText: output.statusText,
      headers: output.headers,
      contentType: output.contentType,
      body,
      size: output.bytes,
    };
    if (output.url !== input.url)
      result.warnings.push(
        'Followed redirect to ' + new URL(output.url).origin + new URL(output.url).pathname,
      );
    result.duration = output.duration;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Replay failed.';
    if (/fetch|abort/i.test(result.error))
      result.error += ' Check CORS, connectivity, permissions and the 25-second timeout.';
    result.duration = performance.now() - start;
  }
  return result;
}
