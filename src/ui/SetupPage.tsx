import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Keyboard, LockKeyhole, ShieldCheck } from 'lucide-react';
import { hasCaptureAccess, requestCaptureAccess } from '../shared/permissions';
import { sendCommand } from '../shared/messages';
import { useCaptureShortcut } from './use-capture-shortcut';

export default function SetupPage() {
  const [granted, setGranted] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shortcut = useCaptureShortcut();
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void hasCaptureAccess()
        .then((value) => {
          if (mounted) setGranted(value);
        })
        .catch(() => {
          if (mounted) setError('Could not check site access. Reload this page to try again.');
        });
    };
    refresh();
    chrome.permissions.onAdded.addListener(refresh);
    chrome.permissions.onRemoved.addListener(refresh);
    return () => {
      mounted = false;
      chrome.permissions.onAdded.removeListener(refresh);
      chrome.permissions.onRemoved.removeListener(refresh);
    };
  }, []);
  const allow = async () => {
    setError('');
    setBusy(true);
    try {
      // The permission request must run directly in this user-initiated click.
      const allowed = await requestCaptureAccess();
      setGranted(allowed);
      if (!allowed)
        setError(
          'Site access was not granted. Recording stays off. You can try again or continue without capture.',
        );
      else await sendCommand({ type: 'changed' });
    } catch {
      setError(
        'Chrome could not grant site access. Try again or check ApiSip in chrome://extensions.',
      );
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    setError('');
    setBusy(true);
    try {
      await sendCommand({ type: 'settings', patch: { recording: true } });
      location.hash = '';
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start recording.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="setup-page">
      <div className="setup-content">
        <div className="setup-brand">
          <Activity size={27} aria-hidden="true" />
          <strong>ApiSip</strong>
          <span>FIRST CAPTURE</span>
        </div>
        <h1>Your APIs. Your browser. Your control.</h1>
        <p className="setup-intro">
          Review website access before recording. Everything you capture stays in this browser
          profile.
        </p>
        <section className="setup-permissions" aria-labelledby="setup-permissions-title">
          <h2 id="setup-permissions-title">
            <ShieldCheck size={20} aria-hidden="true" /> Website access
          </h2>
          <p>
            ApiSip needs access to HTTP and HTTPS websites to observe requests from a page and its
            API servers, which can use different domains. Chrome calls this “read and change your
            data on websites.”
          </p>
          <ul>
            <li>
              <strong>You choose the scope.</strong> Current tab follows your active webpage. All
              tabs captures supported traffic across permitted tabs.
            </li>
            <li>
              <strong>You control recording.</strong> Granting access alone does not start
              recording. Pause whenever you need, or revoke site access in Chrome.
            </li>
            <li>
              <strong>Response capture is on by default.</strong> Starting recording attaches
              Chrome’s debugger so ApiSip can read available response bodies. Chrome displays a
              debugging notice. Turn off Response capture in the inspector for passive capture.
              Debugger access is declared at installation because Chrome requires it.
            </li>
          </ul>
          <p className="setup-privacy">
            <LockKeyhole size={16} aria-hidden="true" /> Local storage, masked secrets, no extension
            telemetry. Chrome internal pages are not captured.
          </p>
          <div className="setup-actions">
            {granted ? (
              <>
                <span className="setup-granted" role="status">
                  <CheckCircle2 size={17} aria-hidden="true" /> Website access granted
                </span>
                <button className="primary" disabled={busy} onClick={() => void start()}>
                  Start recording
                </button>
              </>
            ) : (
              <button
                className="primary"
                disabled={busy || granted === undefined}
                onClick={() => void allow()}
              >
                {busy
                  ? 'Waiting for Chrome…'
                  : granted === undefined
                    ? 'Checking site access…'
                    : 'Allow website access'}
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => {
                location.hash = '';
              }}
            >
              {granted ? 'Open inspector without recording' : 'Continue without capture'}
            </button>
          </div>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </section>
        <section className="setup-shortcut" aria-labelledby="setup-shortcut-title">
          <Keyboard size={21} aria-hidden="true" />
          <div>
            <h2 id="setup-shortcut-title">Record from any browser tab</h2>
            <p>
              Recording shortcut: <kbd>{shortcut}</kbd>. Once assigned, it starts or stops recording
              even with the inspector closed.
            </p>
            <p className="muted">
              Teal pulse icon: recording. Gray pause icon: paused. The badge still shows your saved
              request count.
            </p>
            <button
              onClick={() => {
                void chrome.tabs
                  .create({ url: 'chrome://extensions/shortcuts' })
                  .catch(() =>
                    setError(
                      'Open chrome://extensions/shortcuts to customize the keyboard shortcut.',
                    ),
                  );
              }}
            >
              Customize Chrome shortcuts
            </button>
          </div>
        </section>
        <p className="muted">
          Next: open a website, start recording, trigger an API request, then click ApiSip to
          inspect it.
        </p>
      </div>
    </main>
  );
}
