import { useState } from 'react';
import { Play, RotateCcw, Save } from 'lucide-react';
import type { CapturedRequest, ReplayResult, RequestData, Settings } from '../../shared/model';
import { header, makeBody, parseUrl, prettyJson } from '../../shared/parse';
import { redactBody, redactUrl } from '../../shared/security';
import { PairEditor } from './PairEditor';
export function RequestEditor({
  record,
  context: initialContext,
  onSend,
  onSave,
}: {
  record: CapturedRequest;
  context: Settings['replayContext'];
  onSend: (request: RequestData, context: Settings['replayContext']) => Promise<ReplayResult>;
  onSave: (request: RequestData) => void;
}) {
  const [draft, setDraft] = useState<RequestData>(() => structuredClone(record.request));
  const [context, setContext] = useState(initialContext),
    [tab, setTab] = useState('Headers'),
    [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const body = draft.body?.text ?? '',
    masked = redactBody(body, draft.body?.type),
    protectedBody = !reveal && body !== masked;
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
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          void send();
        }
      }}
    >
      <div className="section-heading">
        <h3>Request editor</h3>
        <label className="context-label">
          Context
          <select
            aria-label="Replay context"
            value={context}
            onChange={(e) => setContext(e.target.value as typeof context)}
          >
            <option value="auto">Automatic</option>
            <option value="browser">Browser</option>
            <option value="extension">Extension</option>
          </select>
        </label>
      </div>
      {protectedUrl && (
        <button className="text-button" onClick={() => setReveal(true)}>
          Reveal URL secrets to edit
        </button>
      )}
      <div className="request-line">
        <input
          className="method-input"
          aria-label="Request method"
          list="http-methods"
          value={draft.method}
          onChange={(e) => setDraft({ ...draft, method: e.target.value.toUpperCase() })}
        />
        <datalist id="http-methods">
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </datalist>
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
      <div className="tabs">
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
      </div>
      {tab === 'Headers' && (
        <PairEditor
          label="Request headers"
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
        <>
          <div className="button-row">
            <button
              onClick={() => {
                try {
                  setDraft({ ...draft, body: makeBody(prettyJson(body), 'application/json') });
                  setMessage('JSON formatted');
                } catch {
                  setError('Body is not valid JSON.');
                }
              }}
            >
              Format JSON
            </button>
            <button
              onClick={() => {
                try {
                  JSON.parse(body);
                  setMessage('Valid JSON');
                  setError('');
                } catch {
                  setError('Body is not valid JSON.');
                }
              }}
            >
              Validate
            </button>
            <button onClick={() => setReveal(!reveal)}>
              {reveal ? 'Mask secrets' : 'Reveal secrets'}
            </button>
            <button
              onClick={() => {
                setDraft({ ...draft, body: undefined });
                setMessage('Body removed');
              }}
            >
              Remove body
            </button>
          </div>
          {protectedBody && (
            <p className="small muted">
              Reveal secrets to edit this body. Sending preserves the original values.
            </p>
          )}
          <textarea
            aria-label="Request body"
            className="body-editor"
            readOnly={protectedBody}
            value={protectedBody ? masked : body}
            spellCheck={false}
            onChange={(e) =>
              setDraft({
                ...draft,
                body: makeBody(e.target.value, header(draft.headers, 'content-type')),
              })
            }
          />
        </>
      )}
      {draft.body &&
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
        <button onClick={() => onSave(draft)}>
          <Save size={13} />
          Save as new request
        </button>
        <span className="small muted">Ctrl / ⌘ + Enter to send</span>
      </div>
    </section>
  );
}
