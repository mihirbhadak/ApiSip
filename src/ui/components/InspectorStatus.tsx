import { formatBytes, formatTime } from '../../shared/parse';
import type { InspectorController } from '../use-inspector-controller';
export function InspectorStatus({ controller }: { controller: InspectorController }) {
  const { settings, visible, summary, loading } = controller;
  return (
    <>
      {' '}
      <footer className="status-bar">
        <span className={'session-dot ' + (settings.recording ? 'live' : '')} />
        <strong>{visible.length.toLocaleString()} requests</strong>
        <span>{summary.errors} errors</span>
        <span>
          {summary.bytes === undefined
            ? 'Transfer unavailable'
            : formatBytes(summary.bytes) + ' known transfer'}
        </span>
        <span>{formatTime(summary.average)} average</span>
        <span className="toolbar-spacer" />
        {loading && <span role="status">Updating…</span>}
        <span>IndexedDB · local</span>
      </footer>
    </>
  );
}
