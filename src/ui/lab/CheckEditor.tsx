import { uid } from '../../shared/model';
import type { Assertion, TestStep } from '../../lab/model';
import { SearchSelect } from '../components/SearchSelect';
const sources: Record<Assertion['source'], string> = {
  status: 'Status',
  header: 'Response header',
  json: 'JSON value',
  body: 'Response text',
  duration: 'Duration (ms)',
};
const operators: Record<Assertion['operator'], string> = {
  equals: 'equals',
  notEquals: 'does not equal',
  contains: 'contains text',
  exists: 'exists',
  absent: 'does not exist',
  lt: 'less than',
  lte: 'at most',
  gt: 'greater than',
  gte: 'at least',
  type: 'has type',
};
export function CheckEditor({
  step,
  onChange,
}: {
  step: TestStep;
  onChange: (step: TestStep) => void;
}) {
  const update = (id: string, patch: Partial<Assertion>) =>
    onChange({
      ...step,
      assertions: step.assertions.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  return (
    <section aria-label="Step checks">
      <div className="section-heading">
        <h3>Checks</h3>
        <button
          disabled={step.assertions.length >= 50}
          onClick={() =>
            onChange({
              ...step,
              assertions: [
                ...step.assertions,
                { id: uid(), source: 'json', selector: '/id', operator: 'exists', expected: '' },
              ],
            })
          }
        >
          Add check
        </button>
      </div>
      <p className="small muted">
        All checks must pass. JSON Pointer: /user/id, /items/0/name. Use ~1 for a slash in a key.
        Missing or truncated bodies are inconclusive, never a pass. Equality compares scalar values.
      </p>
      {step.assertions.map((a, i) => (
        <fieldset className="lab-check" key={a.id}>
          <legend>Check {i + 1}</legend>
          <SearchSelect
            aria-label={`Check ${i + 1} source`}
            value={a.source}
            onValueChange={(source) => update(a.id, { source: source as Assertion['source'] })}
          >
            {Object.entries(sources).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SearchSelect>
          {(a.source === 'json' || a.source === 'header') && (
            <input
              aria-label={`Check ${i + 1} selector`}
              placeholder={a.source === 'json' ? '/user/id' : 'content-type'}
              value={a.selector}
              onChange={(e) => update(a.id, { selector: e.target.value })}
            />
          )}
          <SearchSelect
            aria-label={`Check ${i + 1} operator`}
            value={a.operator}
            onValueChange={(operator) =>
              update(a.id, { operator: operator as Assertion['operator'] })
            }
          >
            {Object.entries(operators).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SearchSelect>
          {!['exists', 'absent'].includes(a.operator) && (
            <input
              aria-label={`Check ${i + 1} expected`}
              value={a.expected}
              placeholder={
                a.source === 'status' ? '200' : a.source === 'duration' ? '500' : 'Expected value'
              }
              onChange={(e) => update(a.id, { expected: e.target.value })}
            />
          )}
          <button
            className="danger-text"
            aria-label={`Delete check ${i + 1}`}
            disabled={step.assertions.length === 1}
            onClick={() =>
              onChange({ ...step, assertions: step.assertions.filter((item) => item.id !== a.id) })
            }
          >
            Delete
          </button>
        </fieldset>
      ))}
      <div className="section-heading">
        <h3>Extract for the next step</h3>
        <button
          disabled={step.extract.length >= 20}
          onClick={() =>
            onChange({
              ...step,
              extract: [...step.extract, { name: 'userId', source: 'json', selector: '/id' }],
            })
          }
        >
          Add extraction
        </button>
      </div>
      <p className="small muted">
        After this step passes, save a scalar value. Use {'{{userId}}'} in a later URL, header or
        quoted JSON value. Extracted values stay in memory and are never saved in reports.
      </p>
      {step.extract.map((item, i) => (
        <fieldset className="lab-check" key={i}>
          <legend>Extraction {i + 1}</legend>
          <input
            aria-label={`Extraction ${i + 1} variable`}
            value={item.name}
            placeholder="userId"
            onChange={(e) =>
              onChange({
                ...step,
                extract: step.extract.map((v, n) => (n === i ? { ...v, name: e.target.value } : v)),
              })
            }
          />
          <SearchSelect
            aria-label={`Extraction ${i + 1} source`}
            value={item.source}
            onValueChange={(source) =>
              onChange({
                ...step,
                extract: step.extract.map((v, n) =>
                  n === i ? { ...v, source: source as 'json' | 'header' } : v,
                ),
              })
            }
          >
            <option value="json">JSON value</option>
            <option value="header">Response header</option>
          </SearchSelect>
          <input
            aria-label={`Extraction ${i + 1} selector`}
            value={item.selector}
            placeholder="/id"
            onChange={(e) =>
              onChange({
                ...step,
                extract: step.extract.map((v, n) =>
                  n === i ? { ...v, selector: e.target.value } : v,
                ),
              })
            }
          />
          <button
            className="danger-text"
            aria-label={`Delete extraction ${i + 1}`}
            onClick={() => onChange({ ...step, extract: step.extract.filter((_, n) => n !== i) })}
          >
            Delete
          </button>
        </fieldset>
      ))}
    </section>
  );
}
