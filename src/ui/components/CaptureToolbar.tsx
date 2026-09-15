import { HelpButton } from './HelpButton';
import { SearchSelect } from './SearchSelect';
import {
  ArrowDownToLine,
  ListFilter,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { InspectorController } from '../use-inspector-controller';
export function CaptureToolbar({ controller }: { controller: InspectorController }) {
  const {
    view,
    entities,
    settings,
    task,
    updateSettings,
    capture,
    responseCapture,
    state,
    operationError,
    error,
    setOperationError,
    setModal,
    searchInput,
    search,
    setSearch,
    expression,
    setExpression,
    importInput,
    group,
    setGroup,
    setGroupValue,
    groups,
    groupValue,
    selected,
    deleteSelection,
    setSelected,
    clear,
  } = controller;
  return (
    <>
      {' '}
      <section className="capture-bar">
        <div>
          <h1>
            {view === 'analytics'
              ? 'Traffic insights'
              : view === 'saved'
                ? 'Saved APIs'
                : view.startsWith('collection:')
                  ? entities.find((e) => e.id === view.slice(11))?.name
                  : 'Network requests'}
          </h1>
          <span className="capture-description">
            {settings.scope === 'all'
              ? 'All permitted web tabs'
              : settings.activePageUrl
                ? new URL(settings.activePageUrl).host || 'Current tab'
                : 'Open a web page to select a capture target'}
          </span>
        </div>
        <div className="capture-controls">
          <HelpButton topic="capture" label="Help with capture" />
          <div className="segmented" aria-label="Capture scope">
            <button
              className={settings.scope === 'current' ? 'active' : ''}
              aria-pressed={settings.scope === 'current'}
              onClick={() => task(() => updateSettings({ scope: 'current' }))}
            >
              Current tab
            </button>
            <button
              className={settings.scope === 'all' ? 'active' : ''}
              aria-pressed={settings.scope === 'all'}
              onClick={() => task(() => updateSettings({ scope: 'all' }))}
            >
              All tabs
            </button>
          </div>
          <button
            className={'record-button ' + (settings.recording ? 'recording' : '')}
            onClick={() => task(capture)}
          >
            {settings.recording ? <Pause size={13} /> : <Play size={13} />}
            <span>{settings.recording ? 'Recording' : 'Start capture'}</span>
          </button>
        </div>
      </section>
      <div className="capability-bar">
        <label className="checkbox-label">
          <input
            type="checkbox"
            aria-label="Capture response bodies"
            checked={settings.provider === 'debugger'}
            onChange={() => task(responseCapture)}
          />
          Response capture{' '}
          <span className="muted">
            {settings.provider === 'debugger'
              ? 'CDP · ' + state.attachedTabs.length + ' attached'
              : 'Opt-in: Chrome debugging banner'}
          </span>
        </label>
        <span className="muted small">
          {settings.scope === 'all'
            ? 'All tabs: ' + state.count
            : 'Current page: ' + state.tabCount}
        </span>
      </div>
      {(operationError || error) && (
        <div className="app-error" role="alert">
          <span>{operationError || error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setOperationError('')}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {state.diagnostics.some((d) => d.level === 'error') && (
        <button className="diagnostic-banner" onClick={() => setModal('settings')}>
          Capture reported a limitation · View diagnostics
        </button>
      )}
      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            ref={searchInput}
            aria-label="Search APIs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search URL, headers, bodies, tags…"
          />
          {search ? (
            <button className="icon-button" aria-label="Clear search" onClick={() => setSearch('')}>
              <X size={13} />
            </button>
          ) : (
            <kbd>Ctrl K</kbd>
          )}
        </label>
        <button className={expression ? 'filter-active' : ''} onClick={() => setModal('filters')}>
          <ListFilter size={14} />
          Filters{expression && <span className="filter-dot" />}
        </button>
        <button title="Configure columns" aria-label="Columns" onClick={() => setModal('columns')}>
          <SlidersHorizontal size={14} />
          <span className="optional-label">Columns</span>
        </button>
        <button onClick={() => setModal('export')}>
          <ArrowDownToLine size={14} />
          <span className="optional-label">Export</span>
        </button>
        <button
          className="icon-button"
          aria-label="Import JSON or HAR"
          onClick={() => importInput.current?.click()}
        >
          <Upload size={15} />
        </button>
      </div>
      <div className="quick-filters">
        <button className={!expression ? 'active' : ''} onClick={() => setExpression('')}>
          All
        </button>
        {[
          ['Errors', 'status >= 400'],
          ['4xx', 'status >= 400 AND status < 500'],
          ['5xx', 'status >= 500'],
          ['Slow', 'timing.total > 1000'],
          ['Large', 'size > 1048576'],
        ].map(([name, expr]) => (
          <button
            key={name}
            className={expression === expr ? 'active' : ''}
            onClick={() => setExpression(expr!)}
          >
            {name}
          </button>
        ))}
        <span className="toolbar-spacer" />
        <HelpButton topic="requests" label="Help with request selection and columns" />
        <label className="group-select">
          Group
          <SearchSelect
            aria-label="Group requests"
            value={group}
            onValueChange={(value) => {
              setGroup(value);
              setGroupValue('');
            }}
          >
            {['none', 'URL', 'Domain', 'Method', 'Resource type', 'Session'].map((g) => (
              <option key={g} value={g}>
                {g === 'none' ? 'None' : g}
              </option>
            ))}
          </SearchSelect>
        </label>
        <button
          className="icon-button danger-text"
          aria-label="Clear current session"
          onClick={() => clear('Current session')}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {expression && (
        <div className="active-expression">
          <code>{expression}</code>
          <button
            className="icon-button"
            aria-label="Clear filters"
            onClick={() => setExpression('')}
          >
            <X size={13} />
          </button>
        </div>
      )}
      {groups.length > 0 && (
        <div className="group-list">
          <button onClick={() => setGroupValue('')} className={!groupValue ? 'active' : ''}>
            All groups
          </button>
          {groups.slice(0, 100).map(([name, count]) => (
            <button
              key={name}
              className={groupValue === name ? 'active' : ''}
              onClick={() => setGroupValue(name)}
            >
              {name} <strong>{count}</strong>
            </button>
          ))}
          {groups.length > 100 && <span>First 100 groups shown</span>}
        </div>
      )}
      {selected.size > 0 && (
        <div className="selection-bar">
          <span>{selected.size} selected</span>
          <button onClick={() => setModal('export')}>Export selected</button>
          <button onClick={() => setModal('collection')}>Add to collection</button>
          <button className="danger-text" onClick={deleteSelection}>
            Delete
          </button>
          <button onClick={() => setSelected(new Set())}>Deselect</button>
        </div>
      )}
    </>
  );
}
