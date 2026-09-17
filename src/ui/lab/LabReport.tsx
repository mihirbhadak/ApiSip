import { downloadFile } from '../../export/formats';
import { exportSuiteReport, junitReport } from '../../lab/export';
import type { SuiteReport } from '../../lab/model';
export function LabReport({ report, running = false }: { report: SuiteReport; running?: boolean }) {
  const previous = report.state === 'interrupted';
  return (
    <section className="lab-report" aria-label="Suite result">
      <div className="section-heading">
        <h3>
          {running
            ? 'Suite running'
            : previous
              ? 'Checkpoint · run may be interrupted'
              : `Suite ${report.state}`}{' '}
          · {report.steps.length}/{report.planned} steps
        </h3>
        <div className="button-row">
          <button
            onClick={() =>
              downloadFile('apisip-test-report.json', exportSuiteReport(report), 'application/json')
            }
          >
            Report JSON
          </button>
          <button
            onClick={() => downloadFile('apisip-junit.xml', junitReport(report), 'application/xml')}
          >
            JUnit XML
          </button>
        </div>
      </div>
      <p className="small muted">
        {Math.round(report.duration)} ms · {report.environment} ·{' '}
        {new Date(report.timestamp).toLocaleString()}. Reports retain outcomes, not response bodies
        or extracted values.
      </p>
      {report.steps.map((step, i) => (
        <details key={step.id} open={step.state !== 'passed'}>
          <summary>
            <span className={step.state === 'passed' ? 'status-success' : 'status-error'}>
              {step.state.toUpperCase()}
            </span>{' '}
            {i + 1}. {step.name} · {step.status ?? 'No status'} · {Math.round(step.duration)} ms
          </summary>
          {step.error && <p className="notice">{step.error}</p>}
          <ul>
            {step.checks.map((check, n) => (
              <li key={check.id}>
                Check {n + 1}: <strong>{check.state}</strong> — {check.message}
              </li>
            ))}
          </ul>
        </details>
      ))}
      {report.steps.length < report.planned && (
        <p className="notice">
          {report.planned - report.steps.length} step(s) have not been sent. Interrupted runs never
          restart automatically.
        </p>
      )}
    </section>
  );
}
