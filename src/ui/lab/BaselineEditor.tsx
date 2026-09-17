import { useEffect, useRef, useState } from 'react';
import { capturedBaseline, createBaseline, type ResponseBaseline } from '../../lab/baseline';
import type { TestStep } from '../../lab/model';
import { getRecord } from '../../storage/repository';
import { ConfirmDialog } from '../components/Dialog';

export function BaselineEditor({
  step,
  onChange,
}: {
  step: TestStep;
  onChange: (step: TestStep) => void;
}) {
  const [sample, setSample] = useState('');
  const [candidate, setCandidate] = useState<ResponseBaseline>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const baseline = step.baseline;
  const capture = async () => {
    if (!step.sourceId) return;
    setBusy(true);
    setError('');
    setCandidate(undefined);
    try {
      const record = await getRecord(step.sourceId);
      const next = capturedBaseline(record?.response);
      if (alive.current) setCandidate(next);
    } catch (cause) {
      if (alive.current)
        setError(cause instanceof Error ? cause.message : 'Could not read this capture.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <details className="baseline-editor">
      <summary>
        Response baseline · {baseline ? baseline.name : 'Detect API structure changes'}
      </summary>
      <p className="small muted">
        Save field paths and JSON types, without response values. This is an observed example, not
        an OpenAPI contract. Arrays use exact indices: item counts and types matter. Scalar value
        changes, including timestamps and IDs, are ignored.
      </p>
      {baseline && (
        <>
          <label>
            Baseline name
            <input
              maxLength={120}
              value={baseline.name}
              onChange={(e) =>
                onChange({ ...step, baseline: { ...baseline, name: e.target.value } })
              }
            />
          </label>
          <p className="small">
            {baseline.fields.length} observed fields. All required unless their path is ignored.
          </p>
          <label>
            Ignored JSON paths (one per line)
            <textarea
              className="mono"
              rows={3}
              value={baseline.ignoredPaths.join('\n')}
              placeholder={'/generatedAt\n/items/0/debug'}
              onChange={(e) =>
                onChange({
                  ...step,
                  baseline: { ...baseline, ignoredPaths: e.target.value.split('\n') },
                })
              }
              onBlur={(e) =>
                onChange({
                  ...step,
                  baseline: {
                    ...baseline,
                    ignoredPaths: e.target.value.split('\n').filter(Boolean),
                  },
                })
              }
            />
          </label>
          <p className="small muted">
            Use exact JSON Pointers; each ignores the whole branch. No wildcards. Use ~1 for / and
            ~0 for ~ in a field name. Empty lines are removed on blur.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={baseline.allowAdditional}
              onChange={(e) =>
                onChange({ ...step, baseline: { ...baseline, allowAdditional: e.target.checked } })
              }
            />
            Allow additional fields / array items
          </label>
          <details>
            <summary>Inspect stored structure</summary>
            <pre>{baseline.fields.map((f) => `${f.path || '(root)'}  ${f.type}`).join('\n')}</pre>
          </details>
          <button className="danger-text" onClick={() => setRemove(true)}>
            Remove baseline
          </button>
        </>
      )}
      <div className="button-row">
        <strong>{baseline ? 'Replace baseline' : 'Create baseline'}</strong>
        {step.sourceId && (
          <button disabled={busy} onClick={() => void capture()}>
            {busy ? 'Reading capture…' : 'Read captured response'}
          </button>
        )}
      </div>
      <label>
        Or paste a JSON sample
        <textarea
          className="mono"
          rows={3}
          maxLength={1_048_576}
          value={sample}
          placeholder={'{"user":{"id":1,"name":"Ada"}}'}
          onChange={(e) => setSample(e.target.value)}
        />
      </label>
      <button
        disabled={!sample.trim()}
        onClick={() => {
          setError('');
          setCandidate(undefined);
          try {
            setCandidate(createBaseline(sample));
            setSample('');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Invalid JSON sample.');
          }
        }}
      >
        Preview sample structure
      </button>
      {candidate && (
        <div className="notice">
          <p>
            {candidate.fields.length} field paths and types ready. No sample values will be saved.
            Review the structure before using it.
          </p>
          <pre>{candidate.fields.map((f) => `${f.path || '(root)'}  ${f.type}`).join('\n')}</pre>
          <div className="button-row">
            <button
              onClick={() => {
                onChange({ ...step, baseline: candidate });
                setCandidate(undefined);
              }}
            >
              Use this baseline
            </button>
            <button onClick={() => setCandidate(undefined)}>Cancel preview</button>
          </div>
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {remove && (
        <ConfirmDialog
          title="Remove response baseline?"
          description="This removes the structural check from this step. Other assertions remain."
          onClose={() => setRemove(false)}
          onConfirm={() => {
            onChange({ ...step, baseline: undefined });
            setRemove(false);
          }}
        />
      )}
    </details>
  );
}
