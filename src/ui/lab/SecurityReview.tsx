import { useMemo, useState } from 'react';
import type { CapturedRequest } from '../../shared/model';
import { aiContext, securityFindings } from '../../lab/security';
import { Dialog } from '../components/Dialog';
export function SecurityReview({ record }: { record: CapturedRequest }) {
  const findings = useMemo(() => securityFindings(record), [record]);
  const [context, setContext] = useState<string>(),
    [status, setStatus] = useState('');
  return (
    <section aria-label="Passive security review">
      <h3>Passive security review</h3>
      <p className="small muted">
        Examines this capture only. No probes are sent. Findings are review prompts, not confirmed
        vulnerabilities. Cookie/header visibility and body limits affect coverage.
      </p>
      {findings.length ? (
        findings.map((finding, i) => (
          <article className="security-finding" key={i}>
            <h4>{finding.title}</h4>
            <p>{finding.evidence}</p>
            <p className="small muted">{finding.guidance}</p>
          </article>
        ))
      ) : (
        <p className="notice">
          No findings from these limited checks. This does not establish that the API is secure.
        </p>
      )}
      <button
        onClick={() => {
          setContext(aiContext(record));
          setStatus('');
        }}
      >
        Prepare AI / bug-report context
      </button>
      {context !== undefined && (
        <Dialog title="Review context before sharing" wide onClose={() => setContext(undefined)}>
          <p>
            Known secrets are masked, but custom secret formats may remain. Review and remove
            anything private. Copying sends nothing to an AI provider; paste it into a tool you
            trust.
          </p>
          <textarea
            aria-label="Shareable API context"
            rows={18}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            spellCheck={false}
          />
          <div className="dialog-actions">
            <button
              onClick={() => {
                void navigator.clipboard
                  .writeText(context)
                  .then(() => setStatus('Reviewed context copied'))
                  .catch(() =>
                    setStatus('Clipboard unavailable. Select and copy the text manually.'),
                  );
              }}
            >
              Copy reviewed context
            </button>
          </div>
          {status && <p role="status">{status}</p>}
        </Dialog>
      )}
    </section>
  );
}
