import type { TestStep } from '../../lab/model';
import { parseUrl } from '../../shared/parse';
import { redactUrl } from '../../shared/security';
import { useState } from 'react';
import { PairEditor } from '../components/PairEditor';
import { RequestBodyEditor } from '../components/RequestBodyEditor';
import { SearchSelect } from '../components/SearchSelect';
import { CheckEditor } from './CheckEditor';
export function StepEditor({
  step,
  onChange,
}: {
  step: TestStep;
  onChange: (step: TestStep) => void;
}) {
  const [reveal, setReveal] = useState(false);
  const masked = redactUrl(step.request.url),
    protectedUrl = !reveal && masked !== step.request.url;
  return (
    <section className="lab-step" aria-label="Test step editor">
      <label>
        Step name
        <input
          value={step.name}
          maxLength={120}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
        />
      </label>
      <div className="request-line">
        <SearchSelect
          className="method-input"
          aria-label="Step method"
          value={step.request.method}
          onValueChange={(method) => onChange({ ...step, request: { ...step.request, method } })}
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => (
            <option key={method}>{method}</option>
          ))}
        </SearchSelect>
        <input
          aria-label="Step URL"
          readOnly={protectedUrl}
          value={protectedUrl ? masked : step.request.url}
          onChange={(e) => {
            let query = step.request.query;
            try {
              query = parseUrl(e.target.value).query;
            } catch {
              /* Allow unfinished URL edits. */
            }
            onChange({ ...step, request: { ...step.request, url: e.target.value, query } });
          }}
        />
      </div>
      {protectedUrl && <button onClick={() => setReveal(true)}>Reveal URL secrets to edit</button>}
      <details>
        <summary>Headers and body · edit request fields</summary>
        <PairEditor
          label="Test headers"
          inclusionControls
          pairs={step.request.headers}
          onChange={(headers) => onChange({ ...step, request: { ...step.request, headers } })}
        />
        <RequestBodyEditor
          body={step.request.body}
          contentType={
            step.request.headers.find((h) => /^content-type$/i.test(h.name))?.value ?? ''
          }
          onChange={(body) => onChange({ ...step, request: { ...step.request, body } })}
        />
      </details>
      <CheckEditor step={step} onChange={onChange} />
    </section>
  );
}
