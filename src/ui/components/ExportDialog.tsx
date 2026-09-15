import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  defaultExportOptions,
  downloadFile,
  exportRecords,
  type ExportFormat,
} from '../../export/formats';
import type { CapturedRequest, Entity, Settings } from '../../shared/model';
import { getRecord, listRows } from '../../storage/repository';
import { Dialog } from './Dialog';
export function ExportDialog({
  selected,
  filtered,
  settings,
  entities,
  onClose,
  notify,
}: {
  selected: Set<string>;
  filtered: CapturedRequest[];
  settings: Settings;
  entities: Entity[];
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const [format, setFormat] = useState<ExportFormat>('JSON'),
    [scope, setScope] = useState(selected.size ? 'Selected requests' : 'Filtered requests');
  const [options, setOptions] = useState({
      ...defaultExportOptions,
      ...settings.exportDefaults,
      secrets: false,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const rows =
        scope === 'Filtered requests'
          ? filtered
          : scope === 'Selected requests'
            ? (await listRows()).filter((r) => selected.has(r.id))
            : await listRows(
                scope === 'Current session'
                  ? { sessionId: settings.sessionId }
                  : scope === 'Current workspace'
                    ? { workspaceId: settings.workspaceId }
                    : {},
              );
      const estimated = rows.reduce(
        (n, r) =>
          n +
          (options.requestBody ? (r.request.body?.bytes ?? 0) : 0) +
          (options.responseBody ? (r.response?.body?.bytes ?? 0) : 0) +
          2048,
        0,
      );
      if (estimated > 100 * 1048576)
        throw new Error(
          'This export may exceed 100 MB. Export a smaller selection or exclude bodies.',
        );
      const records: CapturedRequest[] = [];
      for (let i = 0; i < rows.length; i += 50) {
        const chunk = await Promise.all(rows.slice(i, i + 50).map((r) => getRecord(r.id)));
        records.push(...chunk.filter((r): r is CapturedRequest => !!r));
      }
      const includeEntities =
        scope === 'Entire history'
          ? entities
          : scope === 'Current workspace'
            ? entities.filter((e) => e.workspaceId === settings.workspaceId)
            : [];
      const content = exportRecords(format, records, options, includeEntities);
      const extension = format === 'Markdown' ? 'md' : format.toLowerCase();
      downloadFile(
        'api-catcher-' + new Date().toISOString().slice(0, 10) + '.' + extension,
        content,
        format === 'JSON' || format === 'HAR' ? 'application/json' : 'text/plain',
      );
      notify('Export complete · ' + records.length + ' requests');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };
  const labels = {
    requestHeaders: 'Request headers',
    requestBody: 'Request body',
    responseHeaders: 'Response headers',
    responseBody: 'Response body',
    cookies: 'Cookies',
    timing: 'Timing',
    metadata: 'Metadata',
    secrets: 'Include sensitive values',
  };
  return (
    <Dialog title="Export requests" onClose={onClose}>
      <p className="muted">Take your debugging context with you.</p>
      <label className="field">
        Scope
        <select aria-label="Export scope" value={scope} onChange={(e) => setScope(e.target.value)}>
          {[
            'Selected requests',
            'Filtered requests',
            'Current session',
            'Current workspace',
            'Entire history',
          ].map((s) => (
            <option key={s} disabled={s === 'Selected requests' && !selected.size}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Format
        <select
          aria-label="Export format"
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
        >
          {['JSON', 'CSV', 'Markdown', 'HAR', 'TXT'].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <fieldset className="export-options">
        <legend>Include in export</legend>
        {Object.entries(labels).map(([key, label]) => (
          <label
            key={key}
            className={'checkbox-label ' + (key === 'secrets' ? 'sensitive-option' : '')}
          >
            <input
              type="checkbox"
              checked={options[key as keyof typeof options]}
              onChange={(e) => setOptions({ ...options, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="notice small">
        {options.secrets
          ? 'Sensitive values will be included. Review the file before sharing.'
          : 'Recognized secrets are redacted. Arbitrary tokens in unstructured content may need manual review.'}
        {(format === 'CSV' || format === 'Markdown') &&
          ' This format is a summary table; use JSON or HAR for payloads and headers.'}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy} onClick={() => void run()}>
          <Download size={14} />
          {busy ? 'Exporting…' : 'Export'}
        </button>
      </div>
    </Dialog>
  );
}
