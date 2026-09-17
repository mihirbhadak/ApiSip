import { useDeferredValue, useMemo } from 'react';
import type { Pair, RequestData } from '../../shared/model';
import { compileRunRequest } from '../../runner/templates';
import { type RunConfig, runPlanSchema } from '../../runner/model';
import { redactRequest } from '../../shared/security';
import { makeBody } from '../../shared/parse';

export function RunVariablePreview({
  request,
  variables,
  rows,
  seed,
  config,
}: {
  request: RequestData;
  variables: Pair[];
  rows: string;
  seed: number;
  config: RunConfig;
}) {
  const input = useDeferredValue(
    useMemo(
      () => ({ request, variables, rows, seed, config }),
      [request, variables, rows, seed, config],
    ),
  );
  const preview = useMemo(() => {
    try {
      if (input.rows.length > 1_000_000) throw new Error('Data rows must fit within 1 MB.');
      let data: unknown;
      try {
        data = JSON.parse(input.rows || '[]');
      } catch {
        throw new Error('Enter a valid JSON array for data rows.');
      }
      const plan = runPlanSchema.safeParse({ sourceId: 'preview', ...input, rows: data });
      if (!plan.success) throw new Error(plan.error.issues[0]?.message ?? 'Check the run values.');
      const compiled = compileRunRequest(plan.data);
      const slots = Array.from({ length: Math.min(3, input.config.count) }, (_, index) => {
        const rendered = compiled.render(
          index,
          1700000000000 + index,
          '00000000-0000-4000-8000-00000000000' + (index + 1),
        );
        const safe = redactRequest({
          method: rendered.method,
          url: rendered.url,
          query: [],
          headers: rendered.headers.map(([name, value]) => ({ name, value })),
          body: rendered.body === undefined ? undefined : makeBody(rendered.body, '', 1_048_576),
        });
        return JSON.stringify(
          { method: safe.method, url: safe.url, headers: safe.headers, body: safe.body?.text },
          null,
          2,
        ).slice(0, 16000);
      });
      return { slots, warnings: compiled.warnings };
    } catch (cause) {
      return {
        error: cause instanceof Error ? cause.message : 'Check the template and variables.',
      };
    }
  }, [input]);
  return (
    <section className="slot-preview" aria-label="Variable request preview">
      <h3>First requests · preview only</h3>
      <p className="small muted">
        Uses your current field selections, variables and rows. Secrets are masked. UUID/time are
        illustrative; nothing is sent. Large previews are limited to 16,000 characters per slot.
      </p>
      {preview.error && (
        <p role="status" className="notice">
          {preview.error} Define custom names below or in every data row.
        </p>
      )}
      {preview.slots?.map((slot, index) => (
        <details key={index} open={index === 0}>
          <summary>Request {index + 1}</summary>
          <pre tabIndex={0} aria-label={'Request ' + (index + 1) + ' preview'}>
            {slot}
          </pre>
        </details>
      ))}
      {preview.warnings?.map((warning) => (
        <p className="small muted" key={warning}>
          {warning}
        </p>
      ))}
    </section>
  );
}
