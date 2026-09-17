import type {
  CapturedRequest,
  ReplayCookies,
  ReplayResult,
  RequestData,
  Settings,
} from '../shared/model';

export type ReplaySender = (
  request: RequestData,
  context: Settings['replayContext'],
  cookies?: ReplayCookies,
) => Promise<ReplayResult>;
export const targetOrigin = (url: string) => {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : '';
  } catch {
    return '';
  }
};
export function resolveReplayContext(
  record: Pick<CapturedRequest, 'tabId'>,
  context: Settings['replayContext'],
) {
  return context === 'auto' ? (record.tabId !== undefined ? 'browser' : 'extension') : context;
}
export function replayCredentials(
  context: 'browser' | 'extension',
  url: string,
  cookies?: ReplayCookies,
) {
  if (cookies && cookies.origin !== targetOrigin(url))
    throw new Error(
      'The target origin changed. Choose the browser cookie setting again before sending.',
    );
  return cookies?.mode ?? (context === 'browser' ? 'include' : 'omit');
}
export function authenticationHint(replay: ReplayResult) {
  if (![401, 403].includes(replay.response?.status ?? 0)) return undefined;
  const included =
    replay.credentials === 'include' ||
    (replay.credentials === undefined && replay.context === 'browser');
  return included
    ? 'The server refused this request. Eligible browser cookies were requested, but Chrome may not have sent the required cookie. Check session expiry, cookie partitioning, CSRF headers and account permissions. A 403 is not proof that you are logged out. ApiSip does not retry automatically.'
    : 'The server refused this request. Browser cookies were omitted. For a cookie-based login, use Browser context or explicitly choose Use eligible browser cookies. For token authentication, enable a valid Authorization / API-key header. A 403 can also mean missing permissions or CSRF protection. ApiSip does not retry automatically.';
}
