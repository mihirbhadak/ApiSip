import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { fields, operators, type FilterNode } from '../../filters/engine';
import { parseFilter, printFilter } from '../../filters/parser';
import { Dialog } from './Dialog';
const predicate = (): FilterNode => ({
  type: 'predicate',
  field: 'url',
  operator: 'contains',
  value: '/api/',
});
export function FilterGroup({
  node,
  onChange,
  depth = 0,
}: {
  node: FilterNode;
  onChange: (n: FilterNode) => void;
  depth?: number;
}) {
  if (node.type === 'predicate')
    return (
      <div className="filter-rule">
        <input
          aria-label="Filter field"
          list="filter-fields"
          value={node.field}
          onChange={(e) => onChange({ ...node, field: e.target.value })}
        />
        <select
          aria-label="Filter operator"
          value={node.operator}
          onChange={(e) => onChange({ ...node, operator: e.target.value as typeof node.operator })}
        >
          {operators.map((op) => (
            <option key={op}>{op}</option>
          ))}
        </select>
        {!node.operator.includes('exists') && (
          <input
            aria-label="Filter value"
            placeholder="Value"
            value={node.value}
            onChange={(e) => onChange({ ...node, value: e.target.value })}
          />
        )}
      </div>
    );
  if (node.type === 'not')
    return (
      <div className="filter-group">
        <div className="section-heading">
          <strong>NOT</strong>
          <button className="text-button" onClick={() => onChange(node.child)}>
            Remove NOT
          </button>
        </div>
        <FilterGroup
          node={node.child}
          onChange={(child) => onChange({ ...node, child })}
          depth={depth + 1}
        />
      </div>
    );
  return (
    <div className="filter-group">
      <div className="section-heading">
        <select
          aria-label="Group operator"
          value={node.type}
          onChange={(e) => onChange({ ...node, type: e.target.value as 'and' | 'or' })}
        >
          <option value="and">Match ALL · AND</option>
          <option value="or">Match ANY · OR</option>
        </select>
        <span className="muted">Group {depth + 1}</span>
      </div>
      {node.children.map((child, i) => (
        <div className="filter-child" key={i}>
          <FilterGroup
            node={child}
            depth={depth + 1}
            onChange={(next) =>
              onChange({
                ...node,
                children: node.children.map((n, index) => (index === i ? next : n)),
              })
            }
          />
          <button
            className="icon-button"
            aria-label="Remove filter rule"
            onClick={() =>
              onChange({ ...node, children: node.children.filter((_, index) => index !== i) })
            }
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="button-row">
        <button
          className="text-button"
          onClick={() => onChange({ ...node, children: [...node.children, predicate()] })}
        >
          <Plus size={13} />
          Rule
        </button>
        {depth < 8 && (
          <>
            <button
              className="text-button"
              onClick={() =>
                onChange({
                  ...node,
                  children: [...node.children, { type: 'or', children: [predicate()] }],
                })
              }
            >
              <Plus size={13} />
              Group
            </button>
            <button
              className="text-button"
              onClick={() =>
                onChange({
                  ...node,
                  children: [...node.children, { type: 'not', child: predicate() }],
                })
              }
            >
              NOT rule
            </button>
          </>
        )}
      </div>
    </div>
  );
}
export function FilterBuilder({
  expression,
  onApply,
  onSave,
  onClose,
}: {
  expression: string;
  onApply: (value: string) => void;
  onSave: (name: string, value: string) => void;
  onClose: () => void;
}) {
  const initial = () => {
    try {
      const parsed = parseFilter(expression);
      return parsed.type === 'and' || parsed.type === 'or'
        ? parsed
        : { type: 'and' as const, children: [parsed] };
    } catch {
      return { type: 'and' as const, children: [predicate()] };
    }
  };
  const [node, setNode] = useState<FilterNode>(initial),
    [raw, setRaw] = useState(expression),
    [tab, setTab] = useState('Visual'),
    [error, setError] = useState(''),
    [name, setName] = useState('');
  const value = tab === 'Visual' ? printFilter(node) : raw;
  const validate = (save: boolean) => {
    try {
      parseFilter(value);
      if (save) {
        if (!name.trim()) throw new Error('Give this filter a name.');
        onSave(name.trim(), value);
      } else onApply(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid filter');
    }
  };
  return (
    <Dialog title="Advanced filters" wide onClose={onClose}>
      <p className="muted">Combine rules to find exactly the requests you need.</p>
      <datalist id="filter-fields">
        {fields.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <div className="tabs">
        {['Visual', 'Expression'].map((t) => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            onClick={() => {
              if (t === 'Expression') setRaw(printFilter(node));
              else {
                try {
                  setNode(parseFilter(raw));
                } catch (e) {
                  setError(String(e));
                  return;
                }
              }
              setTab(t);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Visual' ? (
        <FilterGroup node={node} onChange={setNode} />
      ) : (
        <textarea
          className="expression-editor"
          aria-label="Filter expression"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={'method = POST AND (status >= 400 OR timing.total > 1000)'}
        />
      )}
      <p className="small muted">
        Named values: requestHeader.Authorization, queryParam.page, timing.total. Quote strings with
        double quotes. Regex supports a safe subset; invalid patterns are rejected.
      </p>
      <pre className="filter-preview">{value || 'All requests'}</pre>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <input
          aria-label="Saved filter name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Filter name"
        />
        <button onClick={() => validate(true)}>Save filter</button>
        <button className="primary" onClick={() => validate(false)}>
          Apply filter
        </button>
      </div>
    </Dialog>
  );
}
