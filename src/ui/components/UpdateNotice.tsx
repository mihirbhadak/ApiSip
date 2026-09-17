import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { sendCommand } from '../../shared/messages';
import { newerVersion, type UpdateStatus } from '../../shared/updates';
import { Dialog } from './Dialog';

export const openUpdates = () => window.dispatchEvent(new Event('apisip:updates'));

export function UpdateNotice() {
  const [status, setStatus] = useState<UpdateStatus>({});
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const seen = useRef(new Set<string>());
  const installed = globalThis.chrome?.runtime?.getManifest().version ?? '0.0.0';
  useEffect(() => {
    let active = true;
    const receive = (next: UpdateStatus) => {
      if (!active) return;
      setStatus(next);
      const release = next.latest;
      if (
        release &&
        newerVersion(release.version, installed) &&
        next.dismissedVersion !== release.version &&
        !seen.current.has(release.version)
      ) {
        seen.current.add(release.version);
        setOpen(true);
      }
    };
    const refresh = () => {
      void sendCommand({ type: 'update-status' })
        .then(receive)
        .catch(() => {});
    };
    const message = (data: { type?: string }) => {
      if (data.type === 'update-changed') refresh();
    };
    const manual = () => {
      setOpen(true);
      setBusy(true);
      setError('');
      void sendCommand({ type: 'check-updates' })
        .then(receive)
        .catch(() => {
          if (active)
            setError('Could not reach the update checker. Reload the inspector and try again.');
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    };
    refresh();
    chrome.runtime.onMessage.addListener(message);
    window.addEventListener('apisip:updates', manual);
    return () => {
      active = false;
      chrome.runtime.onMessage.removeListener(message);
      window.removeEventListener('apisip:updates', manual);
    };
  }, [installed]);
  const close = async () => {
    try {
      if (status.latest && newerVersion(status.latest.version, installed))
        setStatus(await sendCommand({ type: 'dismiss-update', version: status.latest.version }));
      setOpen(false);
    } catch {
      setError('Could not save this reminder preference. Please try again.');
    }
  };
  if (!open) return null;
  const release = status.latest;
  const available = release && newerVersion(release.version, installed);
  return (
    <Dialog
      title={available ? `ApiSip ${release.version} is available` : 'ApiSip updates'}
      wide
      onClose={() => void close()}
    >
      <p>
        Installed version: <strong>{installed}</strong>
        {release && (
          <>
            {' '}
            · Latest stable release: <strong>{release.version}</strong>
          </>
        )}
      </p>
      {busy && <p role="status">Checking GitHub for updates…</p>}
      {(error || status.error) && (
        <p role="alert" className="notice error">
          {error || status.error}
        </p>
      )}
      {!busy && !error && !status.error && !available && <p role="status">You’re up to date.</p>}
      {release && (
        <>
          <h3>{release.title}</h3>
          <h4>Changes and fixes</h4>
          <div className="release-notes" tabIndex={0} aria-label="Release notes">
            {release.notes}
          </div>
          <p className="notice">
            Unpacked extensions need a manual update. Export a backup, extract the new ZIP, replace
            the files in your existing extension folder, then click Reload in chrome://extensions.
            Keep the same folder to retain this installation’s data. Finish any replay or timed run
            before reloading.
          </p>
        </>
      )}
      <p className="small muted">
        Automatic checks contact GitHub at most once a day. No captured API data is sent. You can
        turn them off in Settings → Privacy &amp; storage.
      </p>
      <div className="dialog-actions">
        <button disabled={busy} onClick={openUpdates}>
          <RefreshCw size={14} /> Check again
        </button>
        {release && (
          <a className="button-link" href={release.url} target="_blank" rel="noopener noreferrer">
            View release on GitHub
          </a>
        )}
        {available && release.downloadUrl && (
          <a
            className="button-link primary"
            href={release.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download size={14} /> Download update
          </a>
        )}
        <button onClick={() => void close()}>
          {available ? 'Remind me with the next version' : 'Close'}
        </button>
      </div>
    </Dialog>
  );
}
