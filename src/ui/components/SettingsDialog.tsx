import { ShortcutList } from './KeyboardHints';
import { TabBar } from './TabBar';
import { SearchSelect } from './SearchSelect';
import { useEffect, useState } from 'react';
import type { Settings } from '../../shared/model';
import type { RuntimeState } from '../../shared/messages';
import { formatBytes } from '../../shared/parse';
import { Dialog } from './Dialog';
export function SettingsDialog({
  state,
  entityCounts,
  onSave,
  onRetry,
  onClear,
  onClose,
}: {
  state: RuntimeState;
  entityCounts: { workspaces: number; sessions: number };
  onSave: (patch: Partial<Settings>) => Promise<void>;
  onRetry: () => Promise<void>;
  onClear: (scope: string) => void;
  onClose: () => void;
}) {
  const [patch, setPatch] = useState<Partial<Settings>>({}),
    [tab, setTab] = useState('Capture'),
    [error, setError] = useState(''),
    [usage, setUsage] = useState<number>(),
    [busy, setBusy] = useState(false);
  const settings = { ...state.settings, ...patch };
  useEffect(() => {
    void navigator.storage
      ?.estimate()
      .then((e) => setUsage(e.usage))
      .catch(() => setUsage(undefined));
  }, []);
  const apply = async () => {
    setBusy(true);
    try {
      await onSave(patch);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Settings could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Settings" wide onClose={onClose}>
      <TabBar className="tabs" label="Settings sections">
        {['Capture', 'Privacy & storage', 'Export', 'Appearance', 'Shortcuts', 'Diagnostics'].map(
          (t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ),
        )}
      </TabBar>
      {tab === 'Capture' && (
        <>
          <label className="field">
            Default capture scope
            <SearchSelect
              aria-label="Capture mode"
              value={settings.scope}
              onValueChange={(value) => setPatch({ ...patch, scope: value as Settings['scope'] })}
            >
              <option value="current">Current tab</option>
              <option value="all">All tabs</option>
            </SearchSelect>
          </label>
          <label className="field">
            Badge count
            <SearchSelect
              aria-label="Badge behavior"
              value={settings.badge}
              onValueChange={(value) => setPatch({ ...patch, badge: value as Settings['badge'] })}
            >
              <option value="tab">Current tab</option>
              <option value="all">All stored requests</option>
              <option value="session">Current session</option>
              <option value="filter">Matching metadata filter (current session)</option>
            </SearchSelect>
          </label>
          {settings.badge === 'filter' && (
            <label className="field">
              Badge filter expression
              <input
                aria-label="Badge filter"
                value={settings.badgeFilter}
                onChange={(e) => setPatch({ ...patch, badgeFilter: e.target.value })}
              />
            </label>
          )}
          <label className="field">
            Maximum body size
            <SearchSelect
              aria-label="Maximum body size"
              value={settings.maxBodyBytes}
              onValueChange={(value) => setPatch({ ...patch, maxBodyBytes: Number(value) })}
            >
              {[1, 5, 10, 25].map((n) => (
                <option key={n} value={n * 1048576}>
                  {n} MB
                </option>
              ))}
            </SearchSelect>
          </label>
          <label className="field">
            Default replay context
            <SearchSelect
              aria-label="Default replay context"
              value={settings.replayContext}
              onValueChange={(value) =>
                setPatch({ ...patch, replayContext: value as Settings['replayContext'] })
              }
            >
              <option value="auto">Automatic</option>
              <option value="browser">Browser</option>
              <option value="extension">Extension</option>
            </SearchSelect>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.resetOnNavigation}
              onChange={(e) => setPatch({ ...patch, resetOnNavigation: e.target.checked })}
            />
            Clear unsaved completed requests from a tab when it reloads or navigates
          </label>
          <p className="small muted">
            Sessions continue through navigation by default. SPA and hash changes preserve history.
            Current-tab capture follows the last active HTTP(S) tab; the inspector does not become
            the capture target.
          </p>
        </>
      )}
      {tab === 'Export' && (
        <>
          <h3>Default export content</h3>
          <p className="small muted">
            These options apply when opening the export dialog. Including secrets always requires a
            separate choice for each export.
          </p>
          {Object.entries({
            requestHeaders: 'Request headers',
            requestBody: 'Request body',
            responseHeaders: 'Response headers',
            responseBody: 'Response body',
            cookies: 'Cookies',
            timing: 'Timing',
            metadata: 'Metadata',
          }).map(([key, label]) => (
            <label className="checkbox-label" key={key}>
              <input
                type="checkbox"
                checked={settings.exportDefaults[key as keyof Settings['exportDefaults']]}
                onChange={(e) =>
                  setPatch({
                    ...patch,
                    exportDefaults: { ...settings.exportDefaults, [key]: e.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
        </>
      )}
      {tab === 'Privacy & storage' && (
        <>
          <div className="storage-summary">
            <span>
              <strong>{formatBytes(usage)}</strong> profile storage estimate
            </span>
            <span>
              <strong>{state.count.toLocaleString()}</strong> requests
            </span>
            <span>
              <strong>{entityCounts.sessions}</strong> sessions
            </span>
            <span>
              <strong>{entityCounts.workspaces}</strong> workspaces
            </span>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.maskSecrets}
              onChange={(e) => setPatch({ ...patch, maskSecrets: e.target.checked })}
            />
            Mask sensitive values in the inspector
          </label>
          <label className="field">
            Retention
            <SearchSelect
              aria-label="Retention"
              value={settings.retentionDays}
              onValueChange={(value) =>
                setPatch({
                  ...patch,
                  retentionDays: Number(value) as Settings['retentionDays'],
                })
              }
            >
              <option value={0}>Keep forever</option>
              {[7, 30, 90].map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </SearchSelect>
          </label>
          <label className="field">
            Maximum request count
            <input
              type="number"
              min={100}
              max={100000}
              aria-label="Maximum request count"
              value={settings.maxRequests}
              onChange={(e) => setPatch({ ...patch, maxRequests: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            Approximate storage budget (MB)
            <input
              type="number"
              min={10}
              max={10000}
              aria-label="Storage budget"
              value={settings.maxStorageMB}
              onChange={(e) => setPatch({ ...patch, maxStorageMB: Number(e.target.value) })}
            />
          </label>
          <p className="small muted">
            Cleanup runs every five minutes. Favorites, pinned requests and collections are
            preserved and can exceed these limits. Storage is local and persistent; masking is not
            encryption. No telemetry, cloud sync or remote service.
          </p>
          <div className="button-row wrap">
            {[
              'Current session',
              'Current workspace',
              'All captured requests',
              'All stored data',
            ].map((scope) => (
              <button className="danger-outline" key={scope} onClick={() => onClear(scope)}>
                Clear {scope.toLowerCase()}
              </button>
            ))}
          </div>
        </>
      )}
      {tab === 'Appearance' && (
        <label className="field">
          Theme
          <SearchSelect
            aria-label="Theme"
            value={settings.theme}
            onValueChange={(value) => setPatch({ ...patch, theme: value as Settings['theme'] })}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </SearchSelect>
        </label>
      )}
      {tab === 'Shortcuts' && (
        <>
          <p className="muted">
            Hold Ctrl / Cmd or Alt alone for one second to reveal shortcuts. Release to dismiss.
          </p>
          <ShortcutList />
        </>
      )}
      {tab === 'Diagnostics' && (
        <>
          <div className="notice">
            <strong>Capture capability</strong>
            <p>Build: {state.buildId ?? 'Connecting...'}</p>
            {state.captureQueue && (
              <p>
                Capture writes pending: {state.captureQueue.pendingWrites}. Peak queue this worker
                lifetime: {state.captureQueue.largestQueue}.
              </p>
            )}
            <p>
              {state.hostsGranted ? 'HTTP(S) site access granted' : 'Site access not granted'} ·{' '}
              {state.attachedTabs.length} debugger target(s) attached.
            </p>
            <p>
              Passive mode exposes metadata and available upload data. Response mode adds bodies and
              WebSockets where Chrome makes them available. Internal pages, inaccessible child
              targets, evicted bodies and pre-attachment traffic cannot be recovered.
            </p>
          </div>
          <button
            onClick={() =>
              void onRetry().catch((e: unknown) =>
                setError(e instanceof Error ? e.message : 'Could not retry.'),
              )
            }
          >
            Retry debugger attachment
          </button>
          <div className="diagnostics">
            {state.diagnostics.length ? (
              state.diagnostics
                .slice()
                .reverse()
                .map((d, i) => (
                  <p key={i} className={d.level === 'error' ? 'error-text' : 'muted'}>
                    <time>{new Date(d.timestamp).toLocaleTimeString()}</time> {d.message}
                  </p>
                ))
            ) : (
              <p className="muted">No diagnostics recorded during this worker lifetime.</p>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy} onClick={() => void apply()}>
          Save settings
        </button>
      </div>
    </Dialog>
  );
}
