import { useMemo, useState } from 'react';
import type { Pair, RequestData } from '../../shared/model';
import { defaultRunConfig, runPlanSchema, type RunPlan } from '../../runner/model';
import { compileRunRequest } from '../../runner/templates';
import { redactRequest } from '../../shared/security';
import { sendCommand } from '../../shared/messages';
import { deleteRun } from '../../storage/runs';
import { Dialog, ConfirmDialog } from '../components/Dialog';
import { HelpButton } from '../components/HelpButton';
import { RunForm } from './RunForm';
import { RunResults } from './RunResults';
import { RunToolbar } from './RunToolbar';
import { useRunner } from './use-runner';

export function RunnerPanel({
  sourceId,
  request,
  onRequestChange,
}: {
  sourceId: string;
  request: RequestData;
  onRequestChange: (request: RequestData) => void;
}) {
  const state = useRunner(sourceId);
  const [config, setConfig] = useState(defaultRunConfig);
  const [variables, setVariables] = useState<Pair[]>([]),
    [rows, setRows] = useState('[]'),
    [seed, setSeed] = useState(1);
  const [selected, select] = useState(''),
    [review, setReview] = useState<RunPlan>();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const report =
    (state.active?.sourceId === sourceId && (!selected || selected === state.active.id)
      ? state.active
      : undefined) ??
    state.history.find((item) => item.id === selected) ??
    state.history[0];
  const task = (work: () => Promise<void>) => {
    setError('');
    void work().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : 'Timed run operation failed.'),
    );
  };
  const prepare = () => {
    setError('');
    try {
      if (rows.length > 1_000_000) throw new Error('Data rows must fit within 1 MB.');
      let data: unknown;
      try {
        data = JSON.parse(rows || '[]');
      } catch {
        throw new Error('Data rows must be a valid JSON array.');
      }
      const parsed = runPlanSchema.safeParse({
        sourceId,
        request,
        config,
        variables,
        rows: data,
        seed,
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((issue) => issue.path.join('.') + ': ' + issue.message)
            .slice(0, 3)
            .join(' '),
        );
      compileRunRequest(parsed.data);
      setReview(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check the run configuration.');
    }
  };
  const start = async () => {
    if (!review || busy) return;
    setBusy(true);
    setError('');
    try {
      await sendCommand({ type: 'runner-start', plan: review });
      select('');
      setReview(undefined);
      await state.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the run.');
    } finally {
      setBusy(false);
    }
  };
  const preview = useMemo(() => {
    if (!review) return undefined;
    const rendered = compileRunRequest(review).render(0, 0, '00000000-0000-4000-8000-000000000000');
    return redactRequest({
      ...request,
      url: rendered.url,
      headers: rendered.headers.map(([name, value]) => ({ name, value })),
      body: rendered.body === undefined ? undefined : { ...request.body!, text: rendered.body },
    });
  }, [review, request]);
  return (
    <main className="runner-panel">
      <section
        className="runner-plan"
        aria-label="Timed run configuration"
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key === 'Enter' &&
            !event.repeat &&
            !state.active &&
            !busy &&
            !document.querySelector('dialog[open]')
          ) {
            event.preventDefault();
            prepare();
          }
        }}
      >
        <div className="section-heading">
          <h2>Timed API run</h2>
          <HelpButton topic="runner" label="Help with timed runs" />
        </div>
        <p className="run-endpoint mono">
          {request.method} {redactRequest(request).url}
        </p>
        <p className="notice small">
          Extension context · no ambient page cookies. Runs continue when this editor closes. Open{' '}
          <strong>Timed runs</strong> in the dashboard to monitor or stop them.
        </p>
        {state.active && (
          <p className="notice" role="status">
            A run is active{state.active.sourceId !== sourceId ? ' for another API' : ''}. One timed
            run can execute at a time.
          </p>
        )}
        {(error || state.error) && (
          <p className="error-banner" role="alert">
            {error || state.error}
          </p>
        )}
        <RunForm
          request={request}
          onRequestChange={onRequestChange}
          config={config}
          setConfig={setConfig}
          variables={variables}
          setVariables={setVariables}
          rows={rows}
          setRows={setRows}
          seed={seed}
          setSeed={setSeed}
          disabled={busy || !!state.active || state.loading}
          onReview={prepare}
        />
        <p className="small muted">
          Ctrl / Cmd + Enter to review. Only Start run sends traffic. Keep tests within the target
          API's capacity. Run reports retain metrics, not request credentials or response bodies.
        </p>
      </section>
      <section className="runner-analysis" aria-label="Run results">
        <RunToolbar
          history={state.history}
          active={state.active}
          report={report}
          selected={selected}
          select={select}
          stop={() => task(state.stop)}
          remove={() => setConfirm(true)}
        />
        {report ? (
          <RunResults report={report} />
        ) : (
          <div className="empty-state">
            <h2>{state.loading ? 'Loading runs…' : 'No timed runs yet'}</h2>
            <p>
              Set a request count and start window, review the plan, then start. Real measurements
              will appear here.
            </p>
          </div>
        )}
      </section>
      {review && (
        <Dialog
          title="Start timed run"
          onClose={() => {
            if (!busy) setReview(undefined);
          }}
          wide
        >
          <p>
            <strong>{review.config.count.toLocaleString()} planned requests</strong> over{' '}
            <strong>{review.config.durationSeconds} seconds</strong>, up to{' '}
            <strong>{review.config.concurrency} in flight</strong>.
          </p>
          <p className="mono run-endpoint">
            {preview?.method} {preview?.url}
          </p>
          <p>
            Starts follow a fixed window
            {review.config.rampSeconds ? ` with a ${review.config.rampSeconds}-second ramp` : ''}.
            Missed slots are not retried. Requests already in flight may finish after the window.
            This sends the edited API request repeatedly.
          </p>
          <details>
            <summary>First-slot preview (secrets masked)</summary>
            <pre className="run-preview">
              {JSON.stringify(
                { url: preview?.url, headers: preview?.headers, body: preview?.body?.text },
                null,
                2,
              )}
            </pre>
            <p className="small muted">
              Timestamp and UUID use preview placeholders here; real values are generated per
              request.
            </p>
          </details>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button autoFocus disabled={busy} onClick={() => setReview(undefined)}>
              Cancel
            </button>
            <button className="primary" disabled={busy} onClick={() => void start()}>
              {busy ? 'Starting…' : 'Start run'}
            </button>
          </div>
        </Dialog>
      )}
      {confirm && report && (
        <ConfirmDialog
          title="Delete this run report?"
          description="Stored metrics and samples for this run will be removed. The API request remains saved."
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
    </main>
  );
}
