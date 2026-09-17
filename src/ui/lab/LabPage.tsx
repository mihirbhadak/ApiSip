import { useRef, useState } from 'react';
import { Activity, ArrowLeft, FlaskConical, Plus } from 'lucide-react';
import { useLab } from './use-lab';
import { StepEditor } from './StepEditor';
import { LabReport } from './LabReport';
import { EnvironmentDialog } from './EnvironmentDialog';
import { SearchSelect } from '../components/SearchSelect';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { HelpButton } from '../components/HelpButton';
import { HelpCenter } from '../components/HelpCenter';
import { focusInspector } from '../editor-actions';
import { newSuite, type Environment } from '../../lab/model';
import { exportSuite, importSuite } from '../../lab/export';
import { downloadFile } from '../../export/formats';
import { redactUrl } from '../../shared/security';
import { getSuite } from '../../storage/lab';
export default function LabPage({ initialId }: { initialId?: string }) {
  const lab = useLab(initialId),
    { suite } = lab;
  const [stepIndex, setStepIndex] = useState(0),
    [environment, setEnvironment] = useState<Environment | 'new'>(),
    [confirmation, setConfirmation] = useState<{ title: string; action: () => Promise<void> }>();
  const input = useRef<HTMLInputElement>(null);
  const selected = Math.min(stepIndex, Math.max(0, (suite?.steps.length ?? 1) - 1)),
    step = suite?.steps[selected];
  return (
    <div
      className="lab-page"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && !e.repeat && !document.querySelector('dialog[open]')) {
          if (e.key === 'Enter') {
            e.preventDefault();
            lab.task(lab.prepare);
          }
          if (e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (!lab.locked)
              lab.task(async () => {
                await lab.save();
              });
          }
        }
      }}
    >
      <header className="editor-page-heading">
        <div className="editor-brand">
          <Activity size={20} />
          <strong>ApiSip</strong>
          <span>Test lab</span>
        </div>
        <div className="button-row">
          <button onClick={() => lab.task(focusInspector)}>
            <ArrowLeft size={14} />
            Open inspector
          </button>
          <HelpButton topic="lab" label="Test lab guide" />
        </div>
      </header>
      <main className="lab-layout">
        <aside className="lab-library" aria-label="Test library">
          <h2>
            <FlaskConical size={18} /> Test suites
          </h2>
          <p className="small muted">
            Saved in the current workspace. Suite requests are independent copies of captures.
          </p>
          <button className="primary" disabled={lab.locked} onClick={lab.create}>
            <Plus size={14} />
            New suite
          </button>
          <button disabled={lab.locked} onClick={() => input.current?.click()}>
            Import suite JSON
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              lab.task(async () => {
                if (file.size > 2_100_000) throw new Error('Suite file exceeds 2 MB.');
                const imported = importSuite(await file.text(), lab.settings.workspaceId);
                lab.choose(imported);
              });
            }}
          />
          <nav aria-label="Saved test suites">
            {lab.data.suites.map((s) => (
              <button
                key={s.id}
                disabled={lab.locked}
                aria-current={suite?.id === s.id ? 'page' : undefined}
                className={suite?.id === s.id ? 'active' : ''}
                onClick={() => {
                  lab.task(async () => {
                    const loaded = await getSuite(s.id);
                    if (!loaded) throw new Error('Suite was deleted. Reload the library.');
                    lab.choose(loaded);
                    setStepIndex(0);
                  });
                }}
              >
                {s.name}
                <small>
                  {s.stepCount} step{s.stepCount === 1 ? '' : 's'}
                </small>
              </button>
            ))}
          </nav>
          <h3>Recent reports</h3>
          <p className="small muted">Latest 25 per workspace</p>
          {lab.data.reports.slice(0, 10).map((report) => (
            <button disabled={lab.locked} key={report.id} onClick={() => lab.setReport(report)}>
              {report.suiteName}
              <small>
                {report.state} · {new Date(report.timestamp).toLocaleString()}
              </small>
            </button>
          ))}
        </aside>
        <section className="lab-workspace" aria-label="Test workbench">
          <div className="lab-intro">
            <h1>Turn a real request into a repeatable test</h1>
            <ol>
              <li>
                <strong>Choose requests.</strong> Add a capture or create a request.
              </li>
              <li>
                <strong>Define expectations.</strong> Check responses and extract values for later
                steps.
              </li>
              <li>
                <strong>Review, then run.</strong> See destinations before sending traffic.
              </li>
            </ol>
            <p className="small muted">
              Ctrl / Cmd + S saves · Ctrl / Cmd + Enter reviews · Tab reaches every control
            </p>
          </div>
          {lab.loading && <p role="status">Loading test library…</p>}
          {lab.error && (
            <p role="alert" className="error-banner">
              {lab.error}
            </p>
          )}
          {lab.message && (
            <p role="status" className="success-text">
              {lab.message}
            </p>
          )}
          {!suite && !lab.loading && (
            <div className="empty-state">
              <h2>Create your first API test</h2>
              <p>
                In Requests, select an API and choose Create test. Or start here with New suite.
                Nothing is sent until you review and start.
              </p>
              <button onClick={lab.create}>Create first suite</button>
            </div>
          )}
          {suite && (
            <>
              <fieldset disabled={lab.locked} className="lab-controls">
                <legend>Suite configuration</legend>
                <label>
                  Suite name
                  <input
                    value={suite.name}
                    maxLength={120}
                    onChange={(e) => lab.edit({ ...suite, name: e.target.value })}
                  />
                </label>
                <div className="button-row">
                  <button
                    onClick={() =>
                      lab.task(async () => {
                        await lab.save();
                      })
                    }
                  >
                    Save suite
                  </button>
                  <span role="status" className="small muted">
                    {lab.saving
                      ? 'Saving…'
                      : lab.dirty
                        ? 'Unsaved changes'
                        : suite.revision
                          ? 'Saved locally'
                          : 'New suite · not saved'}
                  </span>
                  <button
                    onClick={() =>
                      downloadFile('apisip-suite.json', exportSuite(suite), 'application/json')
                    }
                  >
                    Export suite
                  </button>
                  <button
                    className="danger-text"
                    onClick={() =>
                      setConfirmation({
                        title: 'Delete this suite and its reports?',
                        action: () => lab.remove('suites', suite.id),
                      })
                    }
                  >
                    Delete suite
                  </button>
                </div>
                <p className="small muted">
                  Exports mask known secrets and omit environments. Review the file and replace
                  redacted values before running an imported suite.
                </p>
                <div className="lab-env">
                  <label>
                    Environment
                    <SearchSelect
                      aria-label="Test environment"
                      value={lab.environmentId}
                      onValueChange={(value) => {
                        lab.setEnvironmentId(value);
                        lab.setReview(undefined);
                      }}
                    >
                      <option value="">Captured origins</option>
                      {lab.data.environments.map((env) => (
                        <option key={env.id} value={env.id}>
                          {env.name}
                        </option>
                      ))}
                    </SearchSelect>
                  </label>
                  <button onClick={() => setEnvironment('new')}>New environment</button>
                  {lab.environment && (
                    <>
                      <button onClick={() => setEnvironment(lab.environment)}>
                        Edit environment
                      </button>
                      <button
                        className="danger-text"
                        onClick={() =>
                          setConfirmation({
                            title: 'Delete this environment?',
                            action: () => lab.remove('environments', lab.environment!.id),
                          })
                        }
                      >
                        Delete environment
                      </button>
                    </>
                  )}
                </div>
                <div className="lab-env">
                  <label>
                    Add captured request
                    <SearchSelect
                      aria-label="Add captured request"
                      value=""
                      disabled={suite.steps.length >= 30}
                      onValueChange={(id) => {
                        if (id) lab.task(() => lab.addCapture(id));
                      }}
                    >
                      <option value="">Choose from up to 2,000 workspace captures</option>
                      {lab.rows.map((record) => (
                        <option value={record.id} key={record.id}>
                          {record.request.method} {redactUrl(record.request.url).slice(0, 180)}
                        </option>
                      ))}
                    </SearchSelect>
                  </label>
                  <button
                    disabled={suite.steps.length >= 30}
                    onClick={() => {
                      lab.edit({
                        ...suite,
                        steps: [...suite.steps, newSuite(suite.workspaceId).steps[0]!],
                      });
                      setStepIndex(suite.steps.length);
                    }}
                  >
                    Add blank step
                  </button>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={suite.stopOnFailure}
                    onChange={(e) => lab.edit({ ...suite, stopOnFailure: e.target.checked })}
                  />
                  Stop after the first failed or inconclusive step
                </label>
              </fieldset>
              <nav className="lab-step-nav" aria-label="Suite steps">
                {suite.steps.map((s, i) => (
                  <button
                    disabled={lab.locked}
                    className={selected === i ? 'active' : ''}
                    aria-current={selected === i ? 'step' : undefined}
                    key={s.id}
                    onClick={() => setStepIndex(i)}
                  >
                    {i + 1}. {s.name}
                  </button>
                ))}
              </nav>
              {step && (
                <fieldset className="lab-controls" disabled={lab.locked}>
                  <legend>Step {selected + 1}</legend>
                  <div className="button-row">
                    <button
                      disabled={selected === 0}
                      onClick={() => {
                        const steps = [...suite.steps];
                        [steps[selected - 1], steps[selected]] = [
                          steps[selected]!,
                          steps[selected - 1]!,
                        ];
                        lab.edit({ ...suite, steps });
                        setStepIndex(selected - 1);
                      }}
                    >
                      Move earlier
                    </button>
                    <button
                      disabled={selected === suite.steps.length - 1}
                      onClick={() => {
                        const steps = [...suite.steps];
                        [steps[selected], steps[selected + 1]] = [
                          steps[selected + 1]!,
                          steps[selected]!,
                        ];
                        lab.edit({ ...suite, steps });
                        setStepIndex(selected + 1);
                      }}
                    >
                      Move later
                    </button>
                    <button
                      className="danger-text"
                      disabled={suite.steps.length === 1}
                      onClick={() =>
                        setConfirmation({
                          title: 'Delete this step?',
                          action: async () =>
                            lab.edit({
                              ...suite,
                              steps: suite.steps.filter((s) => s.id !== step.id),
                            }),
                        })
                      }
                    >
                      Delete step
                    </button>
                  </div>
                  <StepEditor
                    key={step.id}
                    step={step}
                    onChange={(next) =>
                      lab.edit({
                        ...suite,
                        steps: suite.steps.map((s) => (s.id === next.id ? next : s)),
                      })
                    }
                  />
                </fieldset>
              )}
              <div className="lab-runbar">
                <span className="small muted">
                  Sequential · extension context · no ambient cookies · 25 s timeout · 1 MB response
                  limit
                </span>
                {lab.busy ? (
                  <button className="danger" onClick={lab.stop}>
                    Stop suite
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={lab.locked}
                    onClick={() => lab.task(lab.prepare)}
                  >
                    Review suite
                  </button>
                )}
              </div>
              <p className="small muted">
                Keep this tab open during execution. Closing or reloading interrupts the run. Saved
                checkpoints never resend requests automatically. Existing timed runs are separate.
              </p>
            </>
          )}
          {lab.report && <LabReport report={lab.report} running={lab.busy} />}
        </section>
      </main>
      {environment && (
        <EnvironmentDialog
          initial={environment === 'new' ? undefined : environment}
          workspaceId={lab.settings.workspaceId}
          onClose={() => setEnvironment(undefined)}
          onSave={async (env) => {
            await lab.saveEnv(env);
            setEnvironment(undefined);
          }}
        />
      )}
      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          description="This removes the selected locally saved item. It does not undo requests already sent."
          onClose={() => setConfirmation(undefined)}
          onConfirm={() => {
            const action = confirmation.action;
            setConfirmation(undefined);
            lab.task(action);
          }}
        />
      )}
      {lab.review && (
        <Dialog title="Review API test suite" onClose={() => lab.setReview(undefined)}>
          <p>
            This sends {lab.review.length} sequential request(s). Methods can change server data.
            Check the destination and use test accounts/data.
          </p>
          <ol>
            {lab.review.map((item, i) => (
              <li key={i}>
                <strong>{item.method}</strong> {item.origin} — {item.name}
                {item.warnings.map((w) => (
                  <p className="small muted" key={w}>
                    {w}
                  </p>
                ))}
              </li>
            ))}
          </ol>
          <p className="notice">
            No redirects, automatic retries or ambient cookies. Variables from earlier steps are
            resolved during execution. Extraction failures stop the step.
          </p>
          <div className="dialog-actions">
            <button onClick={() => lab.setReview(undefined)}>Back to editing</button>
            <button className="primary" onClick={() => lab.task(lab.start)}>
              Start suite
            </button>
          </div>
        </Dialog>
      )}
      <HelpCenter />
    </div>
  );
}
