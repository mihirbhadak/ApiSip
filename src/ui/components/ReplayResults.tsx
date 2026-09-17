import { SearchSelect } from './SearchSelect';
import { useState } from 'react';
import type { CapturedRequest } from '../../shared/model';
import { formatTime } from '../../shared/parse';
import { compareReplay } from '../../shared/diff';
import { BodyViewer } from './BodyViewer';
import { Headers } from './Headers';
import { authenticationHint } from '../../replay/context';
export function ReplayResults({ r, copy }: { r: CapturedRequest; copy: (text: string) => void }) {
  const [history, setHistory] = useState(-1);
  const replay = r.replayHistory?.[history < 0 ? (r.replayHistory?.length ?? 1) - 1 : history];
  return (
    <>
      <div className="section-heading">
        <h3>
          Replay history <span className="muted">{r.replayHistory?.length ?? 0}</span>
        </h3>
        {!!r.replayHistory?.length && (
          <SearchSelect
            aria-label="Replay history"
            value={history}
            onValueChange={(value) => setHistory(Number(value))}
          >
            <option value={-1}>Latest replay</option>
            {r.replayHistory.map((h, i) => (
              <option key={h.id} value={i}>
                Replay #{i + 1} · {new Date(h.timestamp).toLocaleTimeString()}
              </option>
            ))}
          </SearchSelect>
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
          <p className="small muted">
            Browser cookies:{' '}
            {replay.credentials ?? (replay.context === 'browser' ? 'include' : 'omit')} · Header
            exclusion does not control Chrome-managed headers.
          </p>
          {authenticationHint(replay) && (
            <p className="notice warning" role="status">
              {authenticationHint(replay)}
            </p>
          )}
          {replay.warnings.map((w, i) => (
            <p className="notice small" key={i}>
              {w}
            </p>
          ))}
          <BodyViewer body={replay.response?.body} title="Replay response body" copy={copy} />
          <details className="replay-headers">
            <summary>Response headers</summary>
            <Headers
              pairs={replay.response?.headers ?? []}
              title="Replay response headers"
              copy={copy}
              mask={false}
            />
          </details>
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
        <div className="empty-small">No replays yet. Edit the request and send it.</div>
      )}
    </>
  );
}
