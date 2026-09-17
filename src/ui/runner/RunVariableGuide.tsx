import { useMemo, useState } from 'react';
import type { Pair, RequestData } from '../../shared/model';
import { insertVariable, uniqueVariableName, variableFields } from '../../runner/variable-guide';
import { runRowsSchema } from '../../runner/model';
import { SearchSelect } from '../components/SearchSelect';

export function RunVariableGuide({
  request,
  variables,
  rows,
  onApply,
}: {
  request: RequestData;
  variables: Pair[];
  rows: string;
  onApply: (request: RequestData, variables: Pair[], rows: string) => void;
}) {
  const fields = useMemo(() => variableFields(request), [request]);
  const [selected, select] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const field = fields.find((item) => item.id === selected) ?? fields[0];
  const name = field && uniqueVariableName(field.name, variables, rows);
  const placeholder = name ? '{{' + name + '}}' : '{{customerName}}';
  const apply = () => {
    if (!field || !name) return;
    setError('');
    try {
      let nextRows = rows;
      // Custom values are text. A typed row preserves captured JSON number/boolean/null values.
      if (typeof field.value !== 'string') {
        if (rows.length > 1_000_000) throw new Error('Data rows must fit within 1 MB.');
        const parsed = runRowsSchema.parse(JSON.parse(rows || '[]'));
        nextRows = JSON.stringify(
          (parsed.length ? parsed : [{}]).map((row) => ({ ...row, [name]: field.value })),
          null,
          2,
        );
      }
      const next = insertVariable(request, field, name);
      onApply(next, [...variables, { name, value: String(field.value ?? '') }], nextRows);
      setMessage(
        `Inserted ${placeholder} into ${field.label}. Its current value is the starting example below; change it for your test.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Check your data rows before inserting a variable.',
      );
    }
  };
  return (
    <div className="variable-guide">
      <ol>
        <li>
          <strong>Choose a field.</strong> Insert a placeholder into its value, such as{' '}
          <code>{placeholder}</code>.
        </li>
        <li>
          <strong>Define its value.</strong> Custom variables repeat the same text. Data rows change
          values on each scheduled request.
        </li>
        <li>
          <strong>Check the preview.</strong> Review the first three requests below. Only{' '}
          <strong>Start run</strong> sends traffic.
        </li>
      </ol>
      {!!fields.length && (
        <div className="variable-example">
          <label>
            Example from this request
            <SearchSelect
              aria-label="Variable example field"
              value={field!.id}
              onValueChange={select}
            >
              {fields.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label}
                </option>
              ))}
            </SearchSelect>
          </label>
          <p>
            <code>{JSON.stringify(field!.value)}</code> → <code>{JSON.stringify(placeholder)}</code>
          </p>
          <button type="button" onClick={apply}>
            Insert placeholder &amp; define value
          </button>
          <p className="small muted">
            Uses this field’s current value. No request is sent. Recognized secrets and excluded
            fields are left out of suggestions.
          </p>
        </div>
      )}
      {!fields.length && (
        <p className="small muted">
          No additional nonsecret fields to suggest. In the editor, replace a header/body/query
          value with <code>{'{{customerName}}'}</code>, then add <code>customerName</code> below.
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success-text">
          {message}
        </p>
      )}
      <details>
        <summary>Built-in variables and data-row examples</summary>
        <dl className="variable-builtins">
          <dt>
            <code>{'{{index}}'}</code>
          </dt>
          <dd>1, 2, 3… Scheduled slot number; missed slots leave gaps.</dd>
          <dt>
            <code>{'{{uuid}}'}</code>
          </dt>
          <dd>A new UUID for each request.</dd>
          <dt>
            <code>{'{{timestamp}}'}</code>
          </dt>
          <dd>Unix time in milliseconds at request generation.</dd>
          <dt>
            <code>{'{{randomInt}}'}</code>
          </dt>
          <dd>A seeded integer from 0 to 999,999.</dd>
        </dl>
        <p className="small">
          For changing values, add JSON data rows. Row 1 is used by request 1, row 2 by request 2,
          then rows repeat. Row values override custom variables.
        </p>
        <pre tabIndex={0} aria-label="Example data rows">
          {JSON.stringify(
            [
              { [name ?? 'customerName']: field ? field.value : 'Mihir' },
              { [name ?? 'customerName']: field ? field.value : 'Mihir' },
            ],
            null,
            2,
          )}
        </pre>
        <p className="small muted">
          These two examples start with the current value. Edit the second row to a different valid
          test value. Wrap JSON placeholders in quotes: <code>{'"{{userId}}"'}</code>. A whole
          placeholder keeps a data-row number, boolean or null; custom variable values are text.
          Variables can change paths, query values, headers and bodies, but not the URL origin.
        </p>
      </details>
    </div>
  );
}
