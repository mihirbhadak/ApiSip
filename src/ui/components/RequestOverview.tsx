import { useEffect, useState } from 'react';
import { Copy, Pin, Star } from 'lucide-react';
import type { CapturedRequest, Settings } from '../../shared/model';
import { redactText } from '../../shared/security';
export function RequestOverview({
  record,
  r,
  settings,
  reveal,
  copy,
  onUpdate,
}: {
  record: CapturedRequest;
  r: CapturedRequest;
  settings: Settings;
  reveal: boolean;
  copy: (text: string) => void;
  onUpdate: (patch: Partial<CapturedRequest>) => void;
}) {
  const [tagText, setTagText] = useState(record.tags.join(', ')),
    [notes, setNotes] = useState(record.notes ?? '');
  useEffect(() => {
    setTagText(record.tags.join(', '));
    setNotes(record.notes ?? '');
  }, [record.tags, record.notes]);
  return (
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
            Status: r.response ? r.response.status + ' ' + r.response.statusText : 'Unavailable',
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
  );
}
