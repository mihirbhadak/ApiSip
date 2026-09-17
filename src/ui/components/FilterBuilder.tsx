import { TabBar } from './TabBar';
import { SearchSelect } from './SearchSelect';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { operators, type FilterNode } from '../../filters/engine';
import { parseFilter, printFilter } from '../../filters/parser';
import { Dialog } from './Dialog';
import { buildFilterSuggestions, type FilterSuggestions } from '../../filters/suggestions';
import { listRows, type Scope } from '../../storage/repository';
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
  suggestions = buildFilterSuggestions([]),
  onApply,
}: {
  node: FilterNode;
  onChange: (n: FilterNode) => void;
  depth?: number;
  suggestions?: FilterSuggestions;
  onApply?: () => void;
}) {
  if (node.type === 'predicate')
    return (
      <div className="filter-rule">
        <SearchSelect
          aria-label="Filter field"
          allowCustom
          value={node.field}
          onValueChange={(value) => onChange({ ...node, field: value })}
        >
          {suggestions.fields.map((field) => (
            <option key={field}>{field}</option>
          ))}
        </SearchSelect>
        <SearchSelect
          aria-label="Filter operator"
          value={node.operator}
          onValueChange={(value) => onChange({ ...node, operator: value as typeof node.operator })}
        >
          {operators.map((op) => (
            <option key={op}>{op}</option>
          ))}
        </SearchSelect>
        {!node.operator.includes('exists') && (
          <SearchSelect
            aria-label="Filter value"
            allowCustom
            updateCustomWhileTyping
            value={node.value}
            onValueChange={(value) => onChange({ ...node, value })}
            onEnter={onApply}
          >
            {(suggestions.values.get(node.field) ?? []).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </SearchSelect>
        )}
      </div>
    );
  if (node.type === 'not')
    return (
      <div className="filter-group">
        <div className="section-heading">
          <strong>NOT</strong>
          <button className="text-button danger-text" onClick={() => onChange(node.child)}>
            Remove NOT
          </button>
        </div>
        <FilterGroup
          node={node.child}
          onChange={(child) => onChange({ ...node, child })}
          depth={depth + 1}
          suggestions={suggestions}
          onApply={onApply}
        />
      </div>
    );
  return (
    <div className="filter-group">
      <div className="section-heading">
        <SearchSelect
          aria-label="Group operator"
          value={node.type}
          onValueChange={(value) => onChange({ ...node, type: value as 'and' | 'or' })}
        >
          <option value="and">Match ALL · AND</option>
          <option value="or">Match ANY · OR</option>
        </SearchSelect>
        <span className="muted">Group {depth + 1}</span>
      </div>
      {node.children.map((child, i) => (
        <div className="filter-child" key={i}>
          <FilterGroup
            node={child}
            depth={depth + 1}
            suggestions={suggestions}
            onApply={onApply}
            onChange={(next) =>
              onChange({
                ...node,
                children: node.children.map((n, index) => (index === i ? next : n)),
              })
            }
          />
          <button
            className="icon-button danger-text"
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
  scope,
}: {
  expression: string;
  onApply: (value: string) => void;
  onSave: (name: string, value: string) => void;
  onClose: () => void;
  scope?: Scope;
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
  const [suggestions, setSuggestions] = useState(() => buildFilterSuggestions([]));
  const [suggestionError, setSuggestionError] = useState('');
  const workspaceId = scope?.workspaceId,
    sessionId = scope?.sessionId,
    tabId = scope?.tabId;
  useEffect(() => {
    if (!workspaceId && !sessionId && tabId === undefined) return;
    let active = true;
    void listRows({ workspaceId, sessionId, tabId })
      .then((records) => {
        if (active) setSuggestions(buildFilterSuggestions(records));
      })
      .catch(() => {
        if (active)
          setSuggestionError('Captured suggestions are unavailable. You can still type any value.');
      });
    return () => {
      active = false;
    };
  }, [workspaceId, sessionId, tabId]);
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
      <TabBar className="tabs" label="Filter modes">
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
      </TabBar>
      {tab === 'Visual' ? (
        <FilterGroup
          node={node}
          onChange={setNode}
          suggestions={suggestions}
          onApply={() => validate(false)}
        />
      ) : (
        <textarea
          className="expression-editor"
          aria-label="Filter expression"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              validate(false);
            }
          }}
          placeholder={'method = POST AND (status >= 400 OR timing.total > 1000)'}
        />
      )}
      <p className="small muted">
        Pick a suggestion or type a custom value, then press Enter again to apply. In expression
        mode, Enter applies; Shift + Enter adds a line. XHR and XMLHttpRequest are equivalent.
        {suggestionError}
      </p>
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
