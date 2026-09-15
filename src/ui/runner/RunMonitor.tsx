import { useState } from 'react';
import { Dialog, ConfirmDialog } from '../components/Dialog';
import { RunResults } from './RunResults';
import { RunToolbar } from './RunToolbar';
import { useRunner } from './use-runner';
import { deleteRun } from '../../storage/runs';
import { getRecord } from '../../storage/repository';
import { openEditorTab } from '../editor-actions';
export function RunMonitor({ onClose }: { onClose: () => void }) {
  const state = useRunner();
  const [selected, select] = useState(''),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false);
  const report =
    (!selected || state.active?.id === selected ? state.active : undefined) ??
    state.history.find((item) => item.id === selected) ??
    state.history[0];
  const task = (work: () => Promise<void>) => {
    setError('');
    void work().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : 'Could not manage timed runs.'),
    );
  };
  return (
    <Dialog title="Timed runs" wide className="run-monitor" onClose={onClose}>
      <p className="small muted">
        Local run history · latest 50 reports across workspaces. Start a run from an API's editor
        tab.
      </p>
      <RunToolbar
        history={state.history}
        active={state.active}
        report={report}
        selected={selected}
        select={select}
        stop={() => task(state.stop)}
        remove={() => setConfirm(true)}
      />
      {(error || state.error) && (
        <p role="alert" className="error-banner">
          {error || state.error}
        </p>
      )}
      {report ? (
        <>
          <div className="section-heading">
            <span className="mono">
              {report.method} {report.origin}
            </span>
            <button
              onClick={() =>
                task(async () => {
                  const source = await getRecord(report.sourceId);
                  if (!source) throw new Error('The source request was deleted.');
                  await openEditorTab(source, source.request, 'extension');
                })
              }
            >
              Open API editor
            </button>
          </div>
          <RunResults report={report} />
        </>
      ) : (
        <p className="empty-small">
          {state.loading
            ? 'Loading runs…'
            : 'No timed runs yet. Open a request in a new editor tab, then choose Timed run.'}
        </p>
      )}
      {confirm && report && (
        <ConfirmDialog
          title="Delete this run report?"
          description="Metrics and samples will be removed; the original request remains."
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            task(async () => {
              await deleteRun(report.id);
              select('');
              await state.refresh();
            });
          }}
        />
      )}
    </Dialog>
  );
}
