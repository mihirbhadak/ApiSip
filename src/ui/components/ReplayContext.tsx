import type { CapturedRequest, ReplayCookies, Settings } from '../../shared/model';
import { resolveReplayContext, targetOrigin } from '../../replay/context';
import { SearchSelect } from './SearchSelect';

export function ReplayContext({
  record,
  url,
  context,
  cookies,
  onChange,
}: {
  record: CapturedRequest;
  url: string;
  context: Settings['replayContext'];
  cookies?: ReplayCookies;
  onChange: (cookies?: ReplayCookies) => void;
}) {
  const resolved = resolveReplayContext(record, context);
  const origin = targetOrigin(url);
  const included = cookies?.mode === 'include' || (!cookies && resolved === 'browser');
  return (
    <section className="replay-context" aria-label="Context and authentication">
      <div className="section-heading">
        <strong>
          {context === 'auto' ? 'Automatic → ' : ''}
          {resolved === 'browser' ? 'Browser' : 'Extension'} request
        </strong>
        <label className="context-label">
          Browser cookies
          <SearchSelect
            aria-label="Browser cookies"
            value={cookies?.mode ?? 'default'}
            disabled={!origin}
            onValueChange={(mode) =>
              onChange(
                mode === 'default' ? undefined : { mode: mode as ReplayCookies['mode'], origin },
              )
            }
          >
            <option value="default">
              Context default ({resolved === 'browser' ? 'include' : 'omit'})
            </option>
            <option value="include">Use eligible browser cookies</option>
            <option value="omit">Do not send browser cookies</option>
          </SearchSelect>
        </label>
      </div>
      <p className="small">
        {resolved === 'browser'
          ? 'Runs from the captured source tab. Keep it open on the same origin; page CORS rules apply.'
          : 'Runs from ApiSip with granted site access. It does not run your page’s login code or read its localStorage.'}
      </p>
      <p className="small">
        <strong>
          {included ? 'Eligible cookies may be sent.' : 'Browser cookies will be omitted.'}
        </strong>{' '}
        Hiding header rows only excludes those rows. Chrome can still add cookies and other managed
        headers. Enabled Authorization and API-key headers are sent independently of this cookie
        setting.
      </p>
      {cookies && cookies.origin !== origin && (
        <p className="error-text" role="alert">
          Target origin changed. Choose the browser cookie setting again before sending.
        </p>
      )}
      {included && resolved === 'extension' && (
        <p className="notice small">
          Cookie access is enabled only for {cookies?.origin}. Redirects are blocked. Chrome’s
          cookie rules, partitioning and browser settings still apply; this cannot guarantee the
          same login as your source tab. Responses may update eligible cookies.
        </p>
      )}
      <details>
        <summary>Which context should I use? · Login troubleshooting</summary>
        <dl className="context-guide">
          <dt>Website session / cookie login</dt>
          <dd>
            Choose Browser and leave cookies at the context default. Hidden Cookie rows do not
            remove Chrome-managed session cookies.
          </dd>
          <dt>API token / API key</dt>
          <dd>
            Choose Extension. Keep Authorization or your API-key header enabled. ApiSip does not
            obtain a token from page storage or refresh it automatically.
          </dd>
          <dt>Cookie login from Extension</dt>
          <dd>
            Explicitly select Use eligible browser cookies for this API origin. Keep any required
            CSRF header enabled. If the site requires its page origin or a partitioned cookie, use
            Browser.
          </dd>
          <dt>Test without login</dt>
          <dd>
            Select Do not send browser cookies and exclude Authorization / API-key headers and
            credential fields in the URL and body.
          </dd>
          <dt>401 / 403 or “not logged in”</dt>
          <dd>
            Check cookies, expired tokens, missing CSRF fields and account permissions. ApiSip never
            retries in a different context automatically.
          </dd>
          <dt>Timed runs and Test lab</dt>
          <dd>
            Use extension requests with cookies omitted. This single-replay cookie choice does not
            carry over. Use explicit test-token headers or a Test lab login step with token
            extraction.
          </dd>
        </dl>
      </details>
    </section>
  );
}
