import type { Distribution, RunReport } from '../../runner/model';
import { formatBytes, formatTime } from '../../shared/parse';

function TimingRow({ title, stats }: { title: string; stats: Distribution }) {
  return (
    <tr>
      <th scope="row">{title}</th>
      <td>{stats.count.toLocaleString()}</td>
      {[stats.min, stats.mean, stats.p50, stats.p95, stats.p99, stats.max, stats.stddev].map(
        (value, i) => (
          <td key={i}>{formatTime(value)}</td>
        ),
      )}
    </tr>
  );
}
function RunChart({ report }: { report: RunReport }) {
  const buckets = report.timeline;
  const peak = Math.max(
    1,
    ...buckets.map((bucket) => bucket.starts),
    ...buckets.map((bucket) => bucket.finished),
  );
  const points = (key: 'starts' | 'finished') =>
    buckets
      .map(
        (bucket, i) =>
          `${8 + (i / Math.max(1, buckets.length - 1)) * 584},${112 - (bucket[key] / peak) * 100}`,
      )
      .join(' ');
  return (
    <figure className="run-chart">
      <figcaption>
        Requests over time{' '}
        <span className="muted">
          {(report.bucketMs / 1000).toFixed(1)} s buckets · starts / finished
        </span>
      </figcaption>
      <svg
        viewBox="0 0 600 125"
        role="img"
        aria-label="Request starts and finished attempts over time"
      >
        <title>Peak bucket: {peak} requests. Solid line: starts. Dashed line: finished.</title>
        <line x1="8" y1="112" x2="592" y2="112" className="run-chart-axis" />
        <polyline points={points('starts')} className="run-chart-starts" />
        <polyline points={points('finished')} className="run-chart-finishes" />
      </svg>
      <div className="run-chart-labels">
        <span>0 s</span>
        <span>Counts per bucket; the last bucket may be partial.</span>
        <span>{(report.elapsedMs / 1000).toFixed(1)} s elapsed</span>
      </div>
    </figure>
  );
}
export function RunResults({ report: r }: { report: RunReport }) {
  const startSeconds = Math.max(0.001, Math.min(r.elapsedMs / 1000, r.config.durationSeconds));
  const failureCount = r.finished - r.outcomes.ok;
  const metrics: [string, string, string?][] = [
    ['Started', r.started.toLocaleString(), 'run-started'],
    ['Finished', r.finished.toLocaleString(), 'run-finished'],
    ['Passed checks', r.outcomes.ok.toLocaleString(), 'run-passed'],
    ['Failed / cancelled', failureCount.toLocaleString(), 'run-failed'],
    ['Not started', r.notStarted.toLocaleString(), 'run-not-started'],
    [
      r.state === 'interrupted' ? 'Unresolved / peak' : 'Active / peak',
      r.inFlight + ' / ' + r.peakConcurrency,
    ],
    ['Actual starts/s', (r.started / startSeconds).toFixed(2)],
    ['Passed/s', (r.outcomes.ok / Math.max(0.001, r.elapsedMs / 1000)).toFixed(2)],
    ['Failure rate', (r.finished ? (100 * failureCount) / r.finished : 0).toFixed(2) + '%'],
    ['Decoded bytes read', formatBytes(r.bytes)],
    ['Average bytes/attempt', formatBytes(r.finished ? r.bytes / r.finished : 0)],
    ['Elapsed', formatTime(r.elapsedMs)],
  ];
  const maxBand = Math.max(1, ...r.latencyBands.map((item) => item.count));
  return (
    <div className="run-results" aria-label="Timed run analytics">
      <div className="run-result-heading">
        <div>
          <h2>Run analytics</h2>
          <span className={'run-state ' + r.state} role="status" data-testid="run-state">
            {r.state}
          </span>
        </div>
        <span className="small muted">{new Date(r.createdAt).toLocaleString()}</span>
      </div>
      {r.reason && (
        <p className="notice" role="status">
          {r.reason}
        </p>
      )}
      <progress
        aria-label="Scheduled slots accounted for"
        max={r.config.count}
        value={r.started + r.missedCapacity + r.missedDelay}
      />
      <div className="analytics-metrics run-metrics">
        {metrics.map(([label, value, id]) => (
          <div key={label}>
            <span>{label}</span>
            <strong data-testid={id}>{value}</strong>
          </div>
        ))}
      </div>
      <p className="small muted">
        Missed due to concurrency: <strong>{r.missedCapacity.toLocaleString()}</strong> · Missed due
        to timing: <strong>{r.missedDelay.toLocaleString()}</strong>. Not started also includes
        future or stopped slots. Counts refer to fetch attempts; browser preflight traffic is
        separate.
      </p>
      <RunChart report={r} />
      <h3>Timing breakdown</h3>
      <div className="run-table-scroll">
        <table className="run-data-table" aria-label="Run timing statistics">
          <thead>
            <tr>
              {[
                'Measurement',
                'Samples',
                'Min',
                'Mean',
                'P50 ≈',
                'P95 ≈',
                'P99 ≈',
                'Max',
                'Std. dev.',
              ].map((text) => (
                <th key={text} scope="col">
                  {text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TimingRow title="Attempt duration" stats={r.latency} />
            <TimingRow title="Headers received" stats={r.headers} />
            <TimingRow title="Body read" stats={r.body} />
            <TimingRow title="Start delay" stats={r.delay} />
            <TimingRow title="Scheduler lag" stats={r.schedulerLag} />
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Attempt duration includes failed and cancelled attempts. Headers received measures fetch
        start to exposed response headers, including browser queueing. Body read may be partial on
        cancellation. Start delay is actual start minus planned start. Scheduler lag measures timer
        lateness. Percentiles are histogram estimates (about 2% relative precision); P95 needs 20
        samples and P99 needs 100.
      </p>
      <div className="run-distributions">
        <section>
          <h3>Attempt duration distribution</h3>
          {r.latencyBands.map((band, i) => (
            <div className="distribution-row" key={i}>
              <span>
                {i ? r.latencyBands[i - 1]!.upperMs : 0}–{band.upperMs ?? '∞'} ms
              </span>
              <div>
                <i style={{ width: (band.count / maxBand) * 100 + '%' }} />
              </div>
              <strong>{band.count.toLocaleString()}</strong>
            </div>
          ))}
        </section>
        <section>
          <h3>Outcomes & HTTP statuses</h3>
          <dl className="run-outcomes">
            {Object.entries(r.outcomes).map(([key, count]) => (
              <div key={key}>
                <dt>{key.replaceAll('-', ' ')}</dt>
                <dd>{count.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          <p className="mono small">
            {Object.entries(r.statuses)
              .map(([status, count]) => status + ': ' + count)
              .join(' · ') || 'No HTTP response statuses exposed yet.'}
          </p>
        </section>
      </div>
      <details className="run-options">
        <summary>Recent attempts & failure samples</summary>
        <p className="small muted">
          Last 100 attempts and first 20 failures are retained. Every outcome contributes to the
          aggregate statistics. No response body, URL, cookie or header is stored in samples.
        </p>
        <div className="run-table-scroll">
          <table className="run-data-table" aria-label="Run request samples">
            <thead>
              <tr>
                {['Slot', 'Outcome', 'Status', 'Start delay', 'Duration', 'Bytes read'].map(
                  (value) => (
                    <th key={value}>{value}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {[...new Map([...r.failures, ...r.recent].map((item) => [item.index, item])).values()]
                .sort((a, b) => b.index - a.index)
                .map((item) => (
                  <tr key={item.index}>
                    <td>{item.index}</td>
                    <td>{item.outcome}</td>
                    <td>{item.status ?? '—'}</td>
                    <td>{formatTime(item.delayMs)}</td>
                    <td>{formatTime(item.durationMs)}</td>
                    <td>{formatBytes(item.bytes)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="run-options">
        <summary>Measurement and resource limits</summary>
        <p>
          DNS, connection, TLS, exact first-byte timing, compressed wire bytes, server processing
          time and computer-wide CPU/memory are not reliably exposed by this fetch runner. They are
          unavailable here; zero values are not substituted.
        </p>
        <p>
          Response chunks are counted and discarded, without decoding or storing their bodies.
          Concurrency is bounded, statistics use fixed histograms, samples are capped, UI updates
          once a second and checkpoints occur about every two seconds. These reduce overhead; actual
          CPU and memory still depend on Chrome, payload sizes and the target rate.
        </p>
        <p>
          Chrome/network scheduling and computer sleep can affect pacing. A closed editor does not
          stop the run. Closing Chrome, reloading the extension or losing the offscreen worker
          interrupts it; saved checkpoints are recovered without automatic retries.
        </p>
      </details>
      {r.warnings.map((warning) => (
        <p className="notice small" key={warning}>
          {warning}
        </p>
      ))}
    </div>
  );
}
