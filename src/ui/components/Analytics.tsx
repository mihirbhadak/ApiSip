import { useMemo } from 'react';
import type { CapturedRequest } from '../../shared/model';
import { statistics } from '../../shared/analytics';
import { formatBytes, formatTime } from '../../shared/parse';
import { redactUrl } from '../../shared/security';
function Distribution({ title, data }: { title: string; data: [string, number][] }) {
  const max = Math.max(1, ...data.map(([, count]) => count));
  return (
    <section className="distribution">
      <h3>{title}</h3>
      {data.slice(0, 12).map(([name, count]) => (
        <div className="distribution-row" key={name}>
          <span title={name}>{name}</span>
          <div>
            <i style={{ width: (count / max) * 100 + '%' }} />
          </div>
          <strong className="mono">{count.toLocaleString()}</strong>
        </div>
      ))}
      {!data.length && <p className="muted">No data yet.</p>}
    </section>
  );
}
export function Analytics({
  rows,
  onSelect,
}: {
  rows: CapturedRequest[];
  onSelect: (r: CapturedRequest) => void;
}) {
  const stats = useMemo(() => statistics(rows), [rows]);
  return (
    <div className="analytics">
      <div className="analytics-heading">
        <h2>Traffic insights</h2>
        <span className="muted">Local analytics · current results</span>
      </div>
      <div className="analytics-metrics">
        {[
          ['Requests', stats.total.toLocaleString()],
          ['Successful', stats.success],
          ['Failed', stats.failed],
          ['Average', formatTime(stats.average)],
          ['P50', formatTime(stats.p50)],
          ['P95', formatTime(stats.p95)],
          ['P99', formatTime(stats.p99)],
          ['Transfer', formatBytes(stats.transfer)],
          ['Avg. size', formatBytes(stats.averageSize)],
        ].map(([name, value]) => (
          <div key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="small muted">
        Percentiles use measured durations only. P95 requires 20 samples; P99 requires 100. Transfer
        includes only sizes Chrome exposed.
      </p>
      <div className="analytics-grid">
        <Distribution title="Status distribution" data={stats.status} />
        <Distribution title="Resource types" data={stats.types} />
        <Distribution title="Domains" data={stats.domains} />
        <Distribution title="Latency distribution" data={stats.latency} />
        <Distribution title="Requests over time" data={stats.overTime} />
        <Distribution title="Most called endpoints" data={stats.endpoints} />
      </div>
      <div className="analytics-grid">
        {[
          ['Slowest requests', stats.slowest],
          ['Largest responses', stats.largest],
        ].map(([title, records]) => (
          <section key={String(title)}>
            <h3>{String(title)}</h3>
            {(records as CapturedRequest[]).map((r) => (
              <button className="endpoint-row" key={r.id} onClick={() => onSelect(r)}>
                <span className="mono">{redactUrl(r.request.url)}</span>
                <strong>
                  {title === 'Slowest requests'
                    ? formatTime(r.timing?.total)
                    : formatBytes(r.response?.size)}
                </strong>
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
