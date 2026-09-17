import { TabBar } from './TabBar';
import { SearchSelect } from './SearchSelect';
import { useState } from 'react';
import { Play, RotateCcw, Save, ExternalLink } from 'lucide-react';
import type { CapturedRequest, ReplayResult, RequestData, Settings } from '../../shared/model';
import { requestSchema } from '../../shared/model';
import { header, parseUrl } from '../../shared/parse';
import { isHttpPseudoHeader, redactUrl } from '../../shared/security';
import { PairEditor } from './PairEditor';
import { RequestBodyEditor } from './RequestBodyEditor';
export function RequestEditor({
  record,
  context: initialContext,
  onSend,
  onSave,
  initialRequest,
  onDraftChange,
  onOpenInTab,
}: {
  record: CapturedRequest;
  context: Settings['replayContext'];
  onSend: (request: RequestData, context: Settings['replayContext']) => Promise<ReplayResult>;
  onSave: (request: RequestData) => void | Promise<void>;
  initialRequest?: RequestData;
  onDraftChange?: (request: RequestData, context: Settings['replayContext']) => void;
  onOpenInTab?: (request: RequestData, context: Settings['replayContext']) => Promise<void>;
}) {
  const [draft, setDraftState] = useState<RequestData>(() =>
    structuredClone(initialRequest ?? record.request),
  );
  const [context, setContextState] = useState(initialContext),
    [tab, setTab] = useState('Headers'),
    [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const setDraft = (request: RequestData) => {
    setDraftState(request);
    onDraftChange?.(request, context);
  };
  const setContext = (next: Settings['replayContext']) => {
    setContextState(next);
    onDraftChange?.(draft, next);
  };
  const [opening, setOpening] = useState(false);
  const openTab = async () => {
    if (!onOpenInTab || opening) return;
    setOpening(true);
    setError('');
    try {
      await onOpenInTab(draft, context);
      setMessage('Editor opened in a new tab');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the editor tab.');
    } finally {
      setOpening(false);
    }
  };
  const save = async () => {
    setError('');
    try {
      await onSave(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this request.');
    }
  };
  const maskedUrl = redactUrl(draft.url),
    protectedUrl = !reveal && maskedUrl !== draft.url;
  const updateUrl = (url: string) => {
    try {
      setDraft({ ...draft, url, query: parseUrl(url).query });
    } catch {
      setDraft({ ...draft, url });
    }
  };
  const send = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!requestSchema.safeParse(draft).success)
        throw new Error('Enter a valid request URL, method and headers before sending.');
      const result = await onSend(draft, context);
      if (result.error) setError(result.error);
      else
        setMessage(
          'Request replayed · ' +
            result.response?.status +
            ' · ' +
            Math.round(result.duration) +
            ' ms',
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replay failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="request-editor"
      onKeyDown={(e) => {
        if (
          !e.repeat &&
          !document.querySelector('dialog[open]') &&
          (e.ctrlKey || e.metaKey) &&
          e.key === 'Enter'
        ) {
          e.preventDefault();
          void send();
        }
      }}
    >
      {onOpenInTab && (
        <div className="editor-detach-row">
          <button onClick={() => void openTab()} disabled={opening || busy}>
            <ExternalLink size={14} /> {opening ? 'Opening...' : 'Open in new tab'}
          </button>
        </div>
      )}
      <div className="section-heading">
        <h3>Request editor</h3>
        <label className="context-label">
          Context
          <SearchSelect
            aria-label="Replay context"
            value={context}
            onValueChange={(value) => setContext(value as typeof context)}
          >
            <option value="auto">Automatic</option>
            <option value="browser">Browser</option>
            <option value="extension">Extension</option>
          </SearchSelect>
        </label>
      </div>
      {protectedUrl && (
        <button className="text-button" onClick={() => setReveal(true)}>
          Reveal URL secrets to edit
        </button>
      )}
      <div className="request-line">
        <SearchSelect
          className="method-input"
          aria-label="Request method"
          allowCustom
          value={draft.method}
          onValueChange={(method) => setDraft({ ...draft, method: method.toUpperCase() })}
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => (
            <option key={method}>{method}</option>
          ))}
        </SearchSelect>
        <input
          aria-label="Request URL"
          value={protectedUrl ? maskedUrl : draft.url}
          readOnly={protectedUrl}
          onChange={(e) => updateUrl(e.target.value)}
          spellCheck={false}
        />
        <button className="primary" disabled={busy} onClick={() => void send()}>
          <Play size={13} />
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      <p className="small muted">
        Browser uses the source tab’s cookies and CORS rules. Extension omits ambient cookies.
        Chrome controls Cookie, Origin, Host and other restricted headers.
      </p>
      {draft.headers.some((h) => isHttpPseudoHeader(h.name)) && (
        <p className="notice small">
          Captured HTTP/2 and HTTP/3 pseudo-headers (such as :authority, :method, :path and :scheme)
          are kept for inspection and omitted when sending. Edit the URL and method above to change
          the replay target.
        </p>
      )}
      <TabBar className="tabs" label="Editor sections">
        {['Headers', 'Query', 'Body'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
            {t === 'Headers'
              ? ' · ' + draft.headers.length
              : t === 'Query'
                ? ' · ' + draft.query.length
                : ''}
          </button>
        ))}
      </TabBar>
      {tab === 'Headers' && (
        <PairEditor
          label="Request headers"
          inclusionControls
          pairs={draft.headers}
          onChange={(headers) => setDraft({ ...draft, headers })}
        />
      )}
      {tab === 'Query' && (
        <>
          <PairEditor
            label="Query parameters"
            pairs={draft.query}
            onChange={(query) => {
              try {
                const u = new URL(draft.url);
                u.search = new URLSearchParams(query.map((p) => [p.name, p.value])).toString();
                setDraft({ ...draft, url: u.href, query });
              } catch {
                setError('Enter a valid URL before editing query parameters.');
              }
            }}
          />
          <pre className="url-preview">{reveal ? draft.url : maskedUrl}</pre>
        </>
      )}
      {tab === 'Body' && (
        <RequestBodyEditor
          body={draft.body}
          contentType={header(draft.headers, 'content-type') ?? ''}
          onChange={(body) => setDraft({ ...draft, body })}
        />
      )}
      {draft.body &&
        draft.body.enabled !== false &&
        (!draft.body.available ||
          draft.body.truncated ||
          draft.body.encoding === 'base64' ||
          draft.body.type === 'multipart') && (
          <div className="notice warning">
            This body cannot be replayed faithfully. Replace or remove it before sending.
          </div>
        )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success-text">
          {message}
        </p>
      )}
      <div className="button-row">
        <button
          onClick={() => {
            setDraft(structuredClone(record.request));
            setMessage('Editor reset');
            setError('');
          }}
        >
          <RotateCcw size={13} />
          Reset
        </button>
        <button onClick={() => void save()}>
          <Save size={13} />
          Save as new request
        </button>
        <span className="small muted">Ctrl / ⌘ + Enter to send</span>
      </div>
    </section>
  );
}
