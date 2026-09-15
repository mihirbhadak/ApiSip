import { TabBar } from './TabBar';
import { HelpButton } from './HelpButton';
import { SearchSelect } from './SearchSelect';
import { useState } from 'react';
import { Copy, Eye, X } from 'lucide-react';
import type { CapturedRequest, ReplayResult, RequestData, Settings } from '../../shared/model';
import { formatBytes, formatTime, rawRequest, rawResponse } from '../../shared/parse';
import { redactRecord } from '../../shared/security';
import { generateCode, languages, type Language } from '../../export/generators';
import { Headers } from './Headers';
import { BodyViewer } from './BodyViewer';
import { RequestOverview } from './RequestOverview';
import { ReplayPanel } from './ReplayPanel';
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
    [language, setLanguage] = useState<Language>('cURL');
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
        <HelpButton
          topic={tab === 'Replay' ? 'replay' : tab === 'Code' ? 'export' : 'details'}
          label="Help with request details"
        />
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
      <TabBar className="tabs detail-tabs" label="Request sections">
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
      </TabBar>
      <div className="detail-content" role="tabpanel" aria-label={tab}>
        {tab === 'Overview' && (
          <RequestOverview
            record={record}
            r={r}
            settings={settings}
            reveal={reveal}
            copy={copy}
            onUpdate={onUpdate}
          />
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
              <SearchSelect
                aria-label="Code language"
                value={language}
                onValueChange={(value) => setLanguage(value as Language)}
              >
                {languages.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </SearchSelect>
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
          <ReplayPanel
            record={record}
            r={r}
            settings={settings}
            copy={copy}
            onSend={onSend}
            onSave={onSave}
          />
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
