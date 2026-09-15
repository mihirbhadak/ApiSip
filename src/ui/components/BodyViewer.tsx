import { TabBar } from './TabBar';
import { useMemo, useState } from 'react';
import { Copy, Expand, Search } from 'lucide-react';
import type { Body } from '../../shared/model';
import { formatBytes } from '../../shared/parse';
import { downloadFile } from '../../export/formats';
import { Dialog } from './Dialog';
type Copy = (value: string) => void;
function JsonNode({
  value,
  name = '$',
  path = '$',
  copy,
  expanded,
}: {
  value: unknown;
  name?: string;
  path?: string;
  copy: Copy;
  expanded: boolean;
}) {
  const [open, setOpen] = useState(expanded);
  if (value === null || typeof value !== 'object')
    return (
      <div className="json-leaf">
        <span className="json-key">{name}</span>
        <span className={typeof value === 'string' ? 'json-string' : 'json-value'}>
          {JSON.stringify(value)}
        </span>
        <button
          className="tiny-copy"
          title={'Copy path ' + path}
          aria-label={'Copy JSON path ' + path}
          onClick={() => copy(path)}
        >
          path
        </button>
        <button
          className="tiny-copy"
          aria-label={'Copy property ' + path}
          onClick={() => copy(JSON.stringify(value))}
        >
          copy
        </button>
      </div>
    );
  const entries = Object.entries(value);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="json-key">{name}</span>{' '}
        <span className="muted">
          {Array.isArray(value)
            ? '[' + entries.length + ' items]'
            : '{' + entries.length + ' properties}'}
        </span>
      </summary>
      {open && (
        <div className="json-children">
          {entries.slice(0, 200).map(([key, child]) => (
            <JsonNode
              key={key}
              name={key}
              value={child}
              path={path + '[' + JSON.stringify(key) + ']'}
              copy={copy}
              expanded={false}
            />
          ))}
          {entries.length > 200 && (
            <p className="muted">
              First 200 properties shown. Use Raw to view the entire captured body.
            </p>
          )}
        </div>
      )}
    </details>
  );
}
export function BodyViewer({
  body,
  copy,
  title = 'Response body',
}: {
  body?: Body;
  copy: Copy;
  title?: string;
}) {
  const [mode, setMode] = useState('Pretty'),
    [search, setSearch] = useState(''),
    [full, setFull] = useState(false),
    [expanded, setExpanded] = useState(true);
  const parsed = useMemo(() => {
    try {
      return { valid: true, value: JSON.parse(body?.text ?? '') as unknown };
    } catch {
      return { valid: false, value: undefined };
    }
  }, [body?.text]);
  if (!body)
    return <div className="empty-small">No body was sent or exposed for this request.</div>;
  if (!body.available)
    return (
      <div className="notice">
        <strong>{title} unavailable</strong>
        <p>{body.reason ?? 'Chrome did not expose this body.'}</p>
      </div>
    );
  const text = body.text ?? '';
  const pretty = parsed.valid ? JSON.stringify(parsed.value, null, 2) : text;
  const shown = mode === 'Raw' ? text : pretty;
  const matches = search
    ? shown.split('\n').filter((line) => line.toLowerCase().includes(search.toLowerCase()))
    : [];
  const content = (
    <div className="body-view">
      <div className="body-toolbar">
        <TabBar className="segmented" label={title + ' views'}>
          {['Pretty', 'Raw', ...(parsed.valid ? ['Tree'] : [])].map((item) => (
            <button
              key={item}
              className={mode === item ? 'active' : ''}
              onClick={() => setMode(item)}
            >
              {item}
            </button>
          ))}
        </TabBar>
        <span className="muted mono">
          {body.type} · {formatBytes(body.bytes)}
        </span>
        <button className="icon-button" aria-label={'Copy ' + title} onClick={() => copy(text)}>
          <Copy size={14} />
        </button>
        <button
          className="icon-button"
          aria-label="Expand body viewer"
          onClick={() => setFull(true)}
        >
          <Expand size={14} />
        </button>
      </div>
      {body.truncated && (
        <div className="notice warning">
          Body truncated · captured {formatBytes(body.bytes)}
          {body.originalBytes !== undefined ? ' of ' + formatBytes(body.originalBytes) : ''}.
          Increase the capture limit in settings and repeat the request.
        </div>
      )}
      {body.type === 'binary' ? (
        <div className="notice">
          <strong>Binary content</strong>
          <p>Base64 payload is displayed as text. Captured content is never executed.</p>
          <button onClick={() => downloadFile('body.base64.txt', text)}>Download base64</button>
        </div>
      ) : null}
      <label className="inline-search">
        <Search size={13} />
        <input
          aria-label={'Search ' + title}
          placeholder="Find in body…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && <span>{matches.length} lines</span>}
      </label>
      {mode === 'Tree' && !search ? (
        <div className="json-tree">
          <button className="text-button" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Collapse root' : 'Expand root'}
          </button>
          <JsonNode key={String(expanded)} value={parsed.value} copy={copy} expanded={expanded} />
        </div>
      ) : (
        <pre className="code-view" tabIndex={0}>
          {search ? matches.slice(0, 2000).join('\n') || 'No matching lines.' : shown}
        </pre>
      )}
      {(body.type === 'html' || body.type === 'xml') && (
        <p className="muted small">
          Markup is shown as inert text. Active HTML previews are disabled.
        </p>
      )}
      {body.fields && (
        <table className="kv-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {body.fields.map((p, i) => (
              <tr key={i}>
                <td>{p.name}</td>
                <td>{p.file ? 'File reference' : 'Text'}</td>
                <td>{p.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
  return (
    <>
      {content}
      {full && (
        <Dialog title={title} wide onClose={() => setFull(false)}>
          <pre className="code-view fullscreen" tabIndex={0}>
            {shown}
          </pre>
        </Dialog>
      )}
    </>
  );
}
