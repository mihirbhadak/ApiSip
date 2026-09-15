import { useState } from 'react';
import type { Pair } from '../../shared/model';
import type { RunConfig } from '../../runner/model';
import { SearchSelect } from '../components/SearchSelect';
import { PairEditor } from '../components/PairEditor';

export function RunForm({
  config,
  setConfig,
  variables,
  setVariables,
  rows,
  setRows,
  seed,
  setSeed,
  disabled,
  onReview,
}: {
  config: RunConfig;
  setConfig: (value: RunConfig) => void;
  variables: Pair[];
  setVariables: (value: Pair[]) => void;
  rows: string;
  setRows: (value: string) => void;
  seed: number;
  setSeed: (value: number) => void;
  disabled: boolean;
  onReview: () => void;
}) {
  const [unit, setUnit] = useState('seconds');
  const change = (key: keyof RunConfig, value: number | boolean) =>
    setConfig({ ...config, [key]: value });
  const numeric = (label: string, key: keyof RunConfig, min: number, max: number, step = 1) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(config[key])}
        onChange={(event) => change(key, Number(event.target.value))}
      />
    </label>
  );
  return (
    <div className="run-form">
      <fieldset disabled={disabled}>
        <legend>Plan this API test</legend>
        <div className="run-form-grid">
          {numeric('Requests to schedule', 'count', 1, 1_000_000)}
          <label>
            Start window
            <div className="run-duration">
              <input
                aria-label="Run duration"
                type="number"
                min={unit === 'seconds' ? 1 : 1 / 60}
                max={unit === 'seconds' ? 3600 : 60}
                step="any"
                value={config.durationSeconds / (unit === 'seconds' ? 1 : 60)}
                onChange={(event) =>
                  change(
                    'durationSeconds',
                    Number(event.target.value) * (unit === 'seconds' ? 1 : 60),
                  )
                }
              />
              <SearchSelect
                aria-label="Duration unit"
                value={unit}
                onValueChange={(value) => setUnit(value)}
              >
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
              </SearchSelect>
            </div>
          </label>
          {numeric('Maximum concurrency', 'concurrency', 1, 128)}
          {numeric('Request timeout (ms)', 'timeoutMs', 100, 120000, 100)}
        </div>
        <p className="run-rate mono">
          {(config.count / Math.max(1, config.durationSeconds)).toFixed(2)} requests/s planned
          average
        </p>
        <p className="small muted">
          Requests are paced across this start window. Slow servers, concurrency limits or browser
          delays can leave starts unsent. A small margin (at most 1% of the window, capped at 50 ms)
          is reserved for timer delays. In-flight requests finish afterward, within their timeout.
        </p>
        <details className="run-options">
          <summary>Advanced scheduling & checks</summary>
          <div className="run-form-grid">
            {numeric('Ramp-up (seconds)', 'rampSeconds', 0, config.durationSeconds)}
            {numeric('Maximum start delay (ms)', 'maxStartDelayMs', 10, 1000)}
            {numeric('Expected status from', 'expectedStatusMin', 100, 599)}
            {numeric('Expected status through', 'expectedStatusMax', 100, 599)}
            {numeric('Latency budget (ms, 0 = off)', 'latencyBudgetMs', 0, 120000)}
            {numeric('Consecutive failures to stop (0 = off)', 'stopAfterFailures', 0, 1000)}
            <label>
              Response read limit
              <SearchSelect
                aria-label="Response read limit"
                value={config.maxResponseBytes}
                onValueChange={(value) => change('maxResponseBytes', Number(value))}
              >
                {[1, 5, 10, 25].map((mb) => (
                  <option key={mb} value={mb * 1024 * 1024}>
                    {mb} MB per response
                  </option>
                ))}
              </SearchSelect>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.stopOn429}
                onChange={(event) => change('stopOn429', event.target.checked)}
              />{' '}
              Stop on HTTP 429
            </label>
          </div>
          <p className="small muted">
            The runner never retries requests or follows redirects. A response above the read limit
            is cancelled and counted separately. The failure limit uses consecutive completed
            outcomes.
          </p>
        </details>
        <details className="run-options">
          <summary>Variables & data rows</summary>
          <p className="small">
            Use <code>{'{{index}}'}</code>, <code>{'{{uuid}}'}</code>,{' '}
            <code>{'{{timestamp}}'}</code> or <code>{'{{randomInt}}'}</code> in the request editor.
            Index starts at 1 and refers to the scheduled slot, so missed slots leave gaps.
          </p>
          <PairEditor label="Run variables" pairs={variables} onChange={setVariables} />
          <label>
            Data rows (JSON array)
            <textarea
              aria-label="Data rows"
              rows={5}
              value={rows}
              onChange={(event) => setRows(event.target.value)}
              placeholder={'[{"userId":1,"name":"Mihir"},{"userId":2,"name":"Ada"}]'}
              spellCheck={false}
            />
          </label>
          <label>
            Random seed
            <input
              aria-label="Random seed"
              type="number"
              min={0}
              max={0xffffffff}
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value))}
            />
          </label>
          <p className="small muted">
            Rows cycle by scheduled index and override custom variables. JSON string placeholders
            are escaped safely; a whole placeholder preserves number/boolean types. URL and form
            values are encoded. Headers and plain text use literal values. The origin stays fixed.
            Variables and rows remain only in memory for this run.
          </p>
        </details>
        <button className="primary run-start" type="button" onClick={onReview}>
          Review run
        </button>
      </fieldset>
    </div>
  );
}
