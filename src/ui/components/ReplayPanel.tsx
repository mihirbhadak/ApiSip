import { useState } from 'react';
import type { CapturedRequest, RequestData, ReplayResult, Settings } from '../../shared/model';
import { formatTime } from '../../shared/parse';
import { compareReplay } from '../../shared/diff';
import { RequestEditor } from './RequestEditor';
import { BodyViewer } from './BodyViewer';
export function ReplayPanel({
  record,
  r,
  settings,
  copy,
  onSend,
  onSave,
}: {
  record: CapturedRequest;
  r: CapturedRequest;
  settings: Settings;
  copy: (text: string) => void;
  onSend: (request: RequestData, context: Settings['replayContext']) => Promise<ReplayResult>;
  onSave: (request: RequestData) => void;
}) {
  const [history, setHistory] = useState(-1);
  const replay = r.replayHistory?.[history < 0 ? (r.replayHistory?.length ?? 1) - 1 : history];
  return (
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
            {replay.context} · {replay.response?.status ?? 'Error'} · {formatTime(replay.duration)}
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
  );
}
