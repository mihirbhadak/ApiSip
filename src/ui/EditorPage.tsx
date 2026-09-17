import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, Check, Trash2 } from 'lucide-react';
import { redactRecord } from '../shared/security';
import { focusInspector } from './editor-actions';
import { useEditorPage } from './use-editor-page';
import { RequestEditor } from './components/RequestEditor';
import { ReplayResults } from './components/ReplayResults';
import { HelpButton } from './components/HelpButton';
import { HelpCenter } from './components/HelpCenter';
import { ConfirmDialog } from './components/Dialog';
import type { RequestData } from '../shared/model';
import { RunnerPanel } from './runner/RunnerPanel';

export default function EditorPage({ id }: { id: string }) {
  const editor = useEditorPage(id);
  const { record, draft, settings, fatal, error, status, saveError, toast, task } = editor;
  const [confirm, setConfirm] = useState(false),
    [reveal, setReveal] = useState(false);
  const [runRequest, setRunRequest] = useState<RequestData>();
  const [showRunner, setShowRunner] = useState(false),
    [editorRevision, setEditorRevision] = useState(0);
  const safe = useMemo(
    () => record && (settings.maskSecrets && !reveal ? redactRecord(record) : record),
    [record, settings.maskSecrets, reveal],
  );
  useEffect(() => {
    document.title = record
      ? record.request.method + ' - Request editor | ApiSip'
      : 'Request editor | ApiSip';
    return () => {
      document.title = 'ApiSip';
    };
  }, [record]);
  return (
    <div className="editor-page">
      <header className="editor-page-heading">
        <div className="editor-brand">
          <Activity size={20} />
          <strong>ApiSip</strong>
          <span>Request editor</span>
        </div>
        <div className="button-row">
          {!fatal && draft && (
            <button
              onClick={() =>
                showRunner
                  ? setShowRunner(false)
                  : task(async () => {
                      setRunRequest(await editor.prepareRun());
                      setShowRunner(true);
                    })
              }
            >
              {showRunner ? 'Back to editor' : 'Timed run'}
            </button>
          )}
          <button onClick={() => task(focusInspector)}>
            <ArrowLeft size={14} /> Open inspector
          </button>
          <HelpButton topic="editor" label="Help with editor tabs" />
          {!fatal && draft && (
            <button className="danger-text" onClick={() => setConfirm(true)}>
              <Trash2 size={14} /> Discard draft
            </button>
          )}
        </div>
      </header>
      {fatal ? (
        <main className="empty-state" role="alert">
          <h1>Editor unavailable</h1>
          <p>{fatal}</p>
          <button onClick={() => task(focusInspector)}>Open inspector</button>
        </main>
      ) : !record || !draft || !safe ? (
        <main className="empty-state" role="status">
          Loading editor draft...
        </main>
      ) : (
        <main className="editor-page-content" hidden={showRunner}>
          <section className="editor-workspace" aria-label="Request draft">
            <div
              className={'draft-status ' + (saveError ? 'error-text' : 'muted')}
              role={saveError ? 'alert' : 'status'}
            >
              {!saveError && <Check size={14} />} {status}
              {saveError && <button onClick={() => location.reload()}>Reload draft</button>}
            </div>
            <RequestEditor
              key={draft.id + ':' + editorRevision}
              record={record}
              initialRequest={draft.request}
              context={draft.context}
              onDraftChange={editor.change}
              onSend={editor.send}
              onSave={editor.save}
            />
            <p className="editor-draft-note small muted">
              Edits are saved locally. Sending adds to the original request's replay history. Ctrl /
              Cmd + Enter to send.
            </p>
          </section>
          <section className="editor-response" aria-label="Replay results">
            <div className="section-heading">
              <h2>Response & comparison</h2>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={reveal}
                  onChange={(event) => setReveal(event.target.checked)}
                />{' '}
                Reveal response secrets
              </label>
            </div>
            <ReplayResults r={safe} copy={editor.copy} />
          </section>
        </main>
      )}
      {!fatal && record && draft && runRequest && (
        <div hidden={!showRunner}>
          <RunnerPanel
            sourceId={record.id}
            request={runRequest}
            onRequestChange={(request) => {
              setRunRequest(request);
              editor.change(request, draft.context);
              setEditorRevision((revision) => revision + 1);
            }}
          />
        </div>
      )}
      {error && (
        <div className="editor-page-error error-banner" role="alert">
          {error}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          title="Discard this editor draft?"
          description="Your edits in this draft will be removed. The original request and replay history remain in the inspector."
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            task(editor.discard);
          }}
        />
      )}
      <HelpCenter />
    </div>
  );
}
