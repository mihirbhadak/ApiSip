import { Download, Square, Trash2 } from 'lucide-react';
import type { RunReport } from '../../runner/model';
import { isRunActive } from '../../runner/model';
import { downloadFile } from '../../export/formats';
import { runCsv, runJson } from '../../runner/export';
import { SearchSelect } from '../components/SearchSelect';

export function RunToolbar({
  history,
  active,
  report,
  selected,
  select,
  stop,
  remove,
}: {
  history: RunReport[];
  active: RunReport | null;
  report?: RunReport;
  selected: string;
  select: (id: string) => void;
  stop: () => void;
  remove: () => void;
}) {
  return (
    <div className="run-toolbar">
      <SearchSelect aria-label="Run history" value={selected} onValueChange={select}>
        <option value="">Latest run</option>
        {history.map((run) => (
          <option key={run.id} value={run.id}>
            {new Date(run.createdAt).toLocaleString()} · {run.config.count.toLocaleString()} ·{' '}
            {run.state}
          </option>
        ))}
      </SearchSelect>
      {active && (
        <button className="danger-text" disabled={active.state === 'stopping'} onClick={stop}>
          <Square size={13} /> {active.state === 'stopping' ? 'Stopping?' : 'Stop run'}
        </button>
      )}
      {report && (
        <>
          <button
            onClick={() =>
              downloadFile(
                'api-catcher-run-' + report.id + '.json',
                runJson(report),
                'application/json',
              )
            }
          >
            <Download size={13} /> Report JSON
          </button>
          <button
            onClick={() =>
              downloadFile(
                'api-catcher-run-samples-' + report.id + '.csv',
                runCsv(report),
                'text/csv',
              )
            }
          >
            Sample CSV
          </button>
          <button
            className="icon-button danger-text"
            aria-label="Delete run report"
            disabled={isRunActive(report.state)}
            onClick={remove}
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
}
