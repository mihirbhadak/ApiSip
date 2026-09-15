import { useEffect, useState } from 'react';
import { Copy, Eye, Pin, Star, X } from 'lucide-react';
import type { CapturedRequest, ReplayResult, RequestData, Settings } from '../../shared/model';
import { formatBytes, formatTime, rawRequest, rawResponse } from '../../shared/parse';
import { redactRecord, redactText } from '../../shared/security';
import { compareReplay } from '../../shared/diff';
import { generateCode, languages, type Language } from '../../export/generators';
import { Headers } from './Headers';
import { BodyViewer } from './BodyViewer';
import { RequestEditor } from './RequestEditor';
export function RequestDetails({
  record,
  settings,
  copy,
  tab,
  setTab,
  onClose,
  onUpdate,
  onSend,
  onSave,
}: {
  record: CapturedRequest;
  settings: Settings;
  copy: (text: string) => void;
  tab: string;
  setTab: (t: string) => void;
  onClose: () => void;
  onUpdate: (patch: Partial<CapturedRequest>) => void;
  onSend: (request: RequestData, context: Settings['replayContext']) => Promise<ReplayResult>;
  onSave: (r: RequestData) => void;
}) {
  const [reveal, setReveal] = useState(false),
    [language, setLanguage] = useState<Language>('cURL'),
    [history, setHistory] = useState(-1);
  const [tagText, setTagText] = useState(record.tags.join(', ')),
    [notes, setNotes] = useState(record.notes ?? '');
  useEffect(() => {
    setTagText(record.tags.join(', '));
    setNotes(record.notes ?? '');
  }, [record.tags, record.notes]);
  const r = settings.maskSecrets && !reveal ? redactRecord(record) : record;
  const tabs = [
    'Overview',
    'Request',
    'Response',
    'Headers',
    ...(r.request.query.length ? ['Query'] : []),
    'Body',
    ...(r.request.headers.some((h) => /^cookie$/i.test(h.name)) ||
    r.response?.headers.some((h) => /^set-cookie$/i.test(h.name))
      ? ['Cookies']
      : []),
    'Timing',
    'Security',
    'Raw',
    'Replay',
    'Code',
    ...(r.metadata.resourceType === 'WebSocket' ? ['Messages'] : []),
  ];
  let code = '';
  if (tab === 'Code') {
    try {
      code = generateCode(language, record.request, reveal || !settings.maskSecrets);
    } catch (e) {
      code = e instanceof Error ? e.message : 'Code generation failed.';
    }
  }
  const replay = r.replayHistory?.[history < 0 ? (r.replayHistory?.length ?? 1) - 1 : history];
  return (
    <aside className="details" aria-label="Request details">
      <div className="detail-heading">
        <span className={'method method-' + r.request.method.toLowerCase()}>
          {r.request.method}
        </span>
        <span className="detail-url mono" title={r.request.url}>
          {r.request.url}
        </span>
        <button className="icon-button" aria-label="Copy URL" onClick={() => copy(r.request.url)}>
          <Copy size={14} />
        </button>
        <button className="icon-button" aria-label="Close details" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="detail-meta">
        <span
          className={
            r.metadata.error || (r.response?.status ?? 0) >= 400 ? 'status-error' : 'status-success'
          }
        >
          {r.metadata.error
            ? 'Network error'
            : r.response
              ? r.response.status + ' ' + r.response.statusText
              : 'Pending'}
        </span>
        <span>{formatTime(r.timing?.total)}</span>
        <span>{formatBytes(r.response?.size)}</span>
        <span className="source-label">
          {r.metadata.provider === 'debugger' ? 'CDP' : r.metadata.provider}
        </span>
      </div>
      <div className="tabs detail-tabs" role="tablist" aria-label="Request sections">
        {tabs.map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="detail-content" role="tabpanel" aria-label={tab}>
        {tab === 'Overview' && (
          <>
            <div className="section-heading">
              <h3>General</h3>
              <div className="button-row">
                <button
                  className="icon-button"
                  aria-label={r.isFavorite ? 'Unsave selected request' : 'Save selected request'}
                  onClick={() => onUpdate({ isFavorite: !r.isFavorite })}
                >
                  <Star size={15} fill={r.isFavorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Pin request"
                  aria-pressed={r.isPinned}
                  onClick={() => onUpdate({ isPinned: !r.isPinned })}
                >
                  <Pin size={15} />
                </button>
              </div>
            </div>
            <table className="kv-table">
              <tbody>
                {Object.entries({
                  URL: r.request.url,
                  Method: r.request.method,
                  Status: r.response
                    ? r.response.status + ' ' + r.response.statusText
                    : 'Unavailable',
                  Protocol: r.request.protocol ?? 'Unavailable',
                  'Resource type': r.metadata.resourceType,
                  'Captured at': new Date(r.timestamp).toLocaleString(),
                  'Source page': r.pageUrl ?? 'Unavailable',
                  Initiator: r.initiator ?? 'Unavailable',
                  Tab: r.tabId ?? 'Imported / unavailable',
                  Frame: r.frameId ?? 'Unavailable',
                  Cache:
                    r.metadata.fromCache === undefined
                      ? 'Unavailable'
                      : r.metadata.fromCache
                        ? 'Served from cache'
                        : 'Network',
                  'Service worker':
                    r.metadata.fromServiceWorker === undefined
                      ? 'Unavailable'
                      : String(r.metadata.fromServiceWorker),
                }).map(([key, value]) => (
                  <tr key={key}>
                    <th scope="row">{key}</th>
                    <td className="mono">{value}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={'Copy ' + key}
                        onClick={() => copy(String(value))}
                      >
                        <Copy size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.metadata.error && (
              <p role="alert" className="notice warning">
                {r.metadata.error}
              </p>
            )}
            <h3>Organize</h3>
            <label className="field">
              Tags{' '}
              <input
                aria-label="Request tags"
                value={settings.maskSecrets && !reveal ? redactText(tagText) : tagText}
                readOnly={settings.maskSecrets && !reveal && redactText(tagText) !== tagText}
                onChange={(e) => setTagText(e.target.value)}
                onBlur={() =>
                  onUpdate({
                    tags: tagText
                      .split(',')
                      .map((t) => t.trim().replace(/^#/, ''))
                      .filter(Boolean)
                      .slice(0, 100),
                  })
                }
                placeholder="auth, slow, production"
              />
            </label>
            <label className="field">
              Notes
              <textarea
                aria-label="Request notes"
                value={settings.maskSecrets && !reveal ? redactText(notes) : notes}
                readOnly={settings.maskSecrets && !reveal && redactText(notes) !== notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => onUpdate({ notes })}
                placeholder="Add debugging notes…"
              />
            </label>
          </>
        )}
        {tab === 'Headers' && (
          <>
            <Headers
              pairs={record.request.headers}
              title="Request headers"
              copy={copy}
              mask={settings.maskSecrets && !reveal}
            />
            <Headers
              pairs={record.response?.headers ?? []}
              title="Response headers"
              copy={copy}
              mask={settings.maskSecrets && !reveal}
            />
          </>
        )}
        {tab === 'Request' && (
          <>
            <Headers
              pairs={record.request.headers}
              title="Request headers"
              copy={copy}
              mask={settings.maskSecrets && !reveal}
            />
            <BodyViewer body={r.request.body} copy={copy} title="Request body" />
          </>
        )}
        {tab === 'Response' && (
          <>
            <BodyViewer body={r.response?.body} copy={copy} />
            <Headers
              pairs={record.response?.headers ?? []}
              title="Response headers"
              copy={copy}
              mask={settings.maskSecrets && !reveal}
            />
          </>
        )}
        {tab === 'Body' && (
          <>
            <h3>Request body</h3>
            <BodyViewer body={r.request.body} copy={copy} title="Request body" />
            {r.request.body?.type === 'graphql' && (
              <p className="notice">
                GraphQL operation: {r.metadata.operationName ?? 'Anonymous'}. Query and variables
                are included above.
              </p>
            )}
            <h3>Response body</h3>
            <BodyViewer body={r.response?.body} copy={copy} />
          </>
        )}
        {tab === 'Query' && (
          <>
            <div className="section-heading">
              <h3>Query parameters</h3>
              <button onClick={() => setTab('Replay')}>Edit in replay</button>
            </div>
            <table className="kv-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Value</th>
                  <th>Encoded value</th>
                  <th>Copy</th>
                </tr>
              </thead>
              <tbody>
                {r.request.query.map((p, i) => (
                  <tr key={i}>
                    <th>{p.name}</th>
                    <td>{p.value}</td>
                    <td className="mono">{encodeURIComponent(p.value)}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={'Copy query ' + p.name}
                        onClick={() => copy(p.name + '=' + p.value)}
                      >
                        <Copy size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {tab === 'Cookies' && (
          <>
            <p className="muted small">
              Only cookie headers exposed by Chrome are shown. HttpOnly and policy restrictions
              still apply to replay.
            </p>
            <Headers
              pairs={record.request.headers.filter((h) => /^cookie$/i.test(h.name))}
              title="Request cookies"
              copy={copy}
              mask={settings.maskSecrets && !reveal}
            />
            <Headers
              pairs={(record.response?.headers ?? []).filter((h) => /^set-cookie$/i.test(h.name))}
              title="Response cookies"
              copy={copy}
              mask={settings.maskSecrets && !reveal}
            />
          </>
        )}
        {tab === 'Timing' && (
          <>
            <h3>Timing breakdown</h3>
            {Object.entries(r.timing ?? {})
              .filter(([, value]) => value !== undefined)
              .map(([key, value]) => (
                <div className="timing-row" key={key}>
                  <span>{key.toUpperCase()}</span>
                  <div>
                    <i
                      style={{
                        width:
                          Math.max(1, Math.min(100, (value! / (r.timing?.total || 1)) * 100)) + '%',
                      }}
                    />
                  </div>
                  <span className="mono">{formatTime(value)}</span>
                </div>
              ))}
            <p className="muted small">
              Only timings exposed by the capture provider are shown. TLS is part of connection
              time. Passive capture exposes total duration only.
            </p>
            <button onClick={() => copy(JSON.stringify(r.timing ?? {}, null, 2))}>
              Copy timing
            </button>
          </>
        )}
        {tab === 'Security' && (
          <>
            <h3>Connection & privacy</h3>
            <p>
              Transport: <strong>{new URL(r.request.url).protocol}</strong>
            </p>
            <p>Chrome security state: {r.metadata.securityState ?? 'Unavailable'}</p>
            <p>Remote address: {r.metadata.remoteAddress ?? 'Unavailable'}</p>
            <div className="notice">
              Captured data stays in this Chrome profile. Masking changes display and export; it
              does not encrypt stored credentials. Use retention controls to remove sensitive
              history.
            </div>
            <button onClick={() => setReveal(!reveal)}>
              <Eye size={14} />
              {reveal ? 'Mask sensitive values' : 'Reveal sensitive values'}
            </button>
          </>
        )}
        {tab === 'Raw' && (
          <>
            <div className="section-heading">
              <h3>Raw request</h3>
              <button onClick={() => copy(rawRequest(r.request))}>Copy request</button>
            </div>
            <pre className="code-view">{rawRequest(r.request)}</pre>
            <div className="section-heading">
              <h3>Raw response</h3>
              <button onClick={() => copy(rawResponse(r))}>Copy response</button>
            </div>
            <pre className="code-view">{rawResponse(r)}</pre>
            <p className="small muted">
              Reconstructed from exposed fields; this is not a byte-for-byte wire transcript.
            </p>
          </>
        )}
        {tab === 'Code' && (
          <>
            <div className="section-heading">
              <select
                aria-label="Code language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                {languages.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <button onClick={() => copy(code)}>
                <Copy size={13} />
                Copy code
              </button>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={reveal}
                onChange={(e) => setReveal(e.target.checked)}
              />
              Include sensitive values
            </label>
            <p className="small muted">
              Client libraries and Chrome may control headers or merge duplicates. Review the
              snippet before running it. CMD output is for a .cmd file.
            </p>
            <pre className="code-view">{code}</pre>
          </>
        )}
        {tab === 'Replay' && (
          <>
            <RequestEditor
              key={record.id}
              record={record}
              context={settings.replayContext}
              onSend={onSend}
              onSave={onSave}
            />
            <hr />
            <div className="section-heading">
              <h3>
                Replay history <span className="muted">{r.replayHistory?.length ?? 0}</span>
              </h3>
              {!!r.replayHistory?.length && (
                <select
                  aria-label="Replay history"
                  value={history}
                  onChange={(e) => setHistory(Number(e.target.value))}
                >
                  <option value={-1}>Latest replay</option>
                  {r.replayHistory.map((h, i) => (
                    <option key={h.id} value={i}>
                      Replay #{i + 1} · {new Date(h.timestamp).toLocaleTimeString()}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {replay ? (
              <>
                <p className="mono">
                  {replay.context} · {replay.response?.status ?? 'Error'} ·{' '}
                  {formatTime(replay.duration)}
                </p>
                {replay.error && (
                  <p className="error-text" role="alert">
                    {replay.error}
                  </p>
                )}
                {replay.warnings.map((w, i) => (
                  <p className="notice small" key={i}>
                    {w}
                  </p>
                ))}
                <BodyViewer body={replay.response?.body} title="Replay response body" copy={copy} />
                <h3>Original → replay diff</h3>
                <div className="diff-list">
                  {compareReplay(r, replay)
                    .slice(0, 500)
                    .map((d, i) => (
                      <div key={i} className={'diff-line ' + d.kind}>
                        <span className="mono">
                          {d.kind === 'added' ? '+' : d.kind === 'removed' ? '−' : '~'} {d.path}
                        </span>
                        <pre>
                          {JSON.stringify(d.before)} → {JSON.stringify(d.after)}
                        </pre>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <div className="empty-small">No replays yet. Edit the request above and send it.</div>
            )}
          </>
        )}
        {tab === 'Messages' && (
          <>
            <h3>WebSocket messages</h3>
            <p className="small muted">
              Up to 200 messages per connection; each payload is capped at 16 KB. Binary opcodes are
              shown as base64.
            </p>
            {r.metadata.messageLimitReached && (
              <p className="notice warning">Message limit reached.</p>
            )}
            {r.metadata.messages?.map((m, i) => (
              <div className="socket-message" key={i}>
                <span>
                  {m.direction === 'sent' ? '↑ Sent' : '↓ Received'} ·{' '}
                  {new Date(m.timestamp).toLocaleTimeString()} · opcode {m.opcode}
                  {m.truncated ? ' · truncated' : ''}
                </span>
                <pre>{m.payload}</pre>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="detail-footer">
        <button className="text-button" onClick={() => copy(JSON.stringify(r, null, 2))}>
          <Copy size={12} />
          Copy everything
        </button>
        <span className="muted small">
          {settings.maskSecrets && !reveal ? 'Sensitive values masked' : 'Sensitive values visible'}
        </span>
      </div>
    </aside>
  );
}
