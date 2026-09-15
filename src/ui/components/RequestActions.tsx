import { useEffect, useState } from 'react';
import { Folder, Plus } from 'lucide-react';
import type { Entity } from '../../shared/model';
import { allColumns, defaultColumns, type ColumnConfig } from './RequestTable';
import { Dialog } from './Dialog';
export function ColumnsDialog({
  columns,
  setColumns,
  onClose,
}: {
  columns: ColumnConfig[];
  setColumns: (columns: ColumnConfig[]) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="Table columns" onClose={onClose}>
      <p className="muted">
        Choose visible columns. Drag header dividers to resize; use arrows to reorder.
      </p>
      {allColumns.map((name) => {
        const index = columns.findIndex((c) => c.name === name);
        const move = (direction: number) => {
          const next = [...columns];
          [next[index + direction], next[index]] = [next[index]!, next[index + direction]!];
          setColumns(next);
        };
        return (
          <div className="column-option" key={name}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={index >= 0}
                disabled={index >= 0 && columns.length === 1}
                onChange={(e) =>
                  setColumns(
                    e.target.checked
                      ? [...columns, { name, width: name === 'URL' ? 300 : 100 }]
                      : columns.filter((c) => c.name !== name),
                  )
                }
              />
              {name}
            </label>
            {index >= 0 && (
              <div>
                <button
                  aria-label={'Move ' + name + ' left'}
                  disabled={index === 0}
                  onClick={() => move(-1)}
                >
                  ←
                </button>
                <button
                  aria-label={'Move ' + name + ' right'}
                  disabled={index === columns.length - 1}
                  onClick={() => move(1)}
                >
                  →
                </button>
              </div>
            )}
          </div>
        );
      })}
      <div className="dialog-actions">
        <button onClick={() => setColumns(defaultColumns)}>Reset columns</button>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
export function CollectionDialog({
  entities,
  count,
  onSelect,
  onCreate,
  onClose,
}: {
  entities: Entity[];
  count: number;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const matches = entities.filter(
    (e) => e.kind === 'collection' && e.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Dialog title="Add to collection" onClose={onClose}>
      <p className="muted">Save {count} request(s) to a collection.</p>
      <input
        autoFocus
        className="collection-search"
        aria-label="Search collections"
        placeholder="Search collections..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {matches.map((e) => (
        <button className="collection-choice" key={e.id} onClick={() => onSelect(e.id)}>
          <Folder size={15} />
          {e.name}
        </button>
      ))}
      {!matches.length && <p className="muted">No matching collections.</p>}
      <button onClick={onCreate}>
        <Plus size={13} />
        New collection
      </button>
    </Dialog>
  );
}
export function RequestMenu({
  position,
  actions,
  onClose,
}: {
  position: { x: number; y: number };
  actions: { name: string; run: () => void }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="menu-backdrop"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="context-menu"
        role="menu"
        aria-label="Request actions"
        style={{
          left: Math.max(0, Math.min(position.x, window.innerWidth - 235)),
          top: Math.max(0, Math.min(position.y, window.innerHeight - 380)),
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
          if (e.key === 'Tab') onClose();
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            const items = [...e.currentTarget.querySelectorAll('button')];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            items[
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? items.length - 1
                  : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
            ]?.focus();
          }
        }}
      >
        {actions.map((action, i) => (
          <button
            autoFocus={i === 0}
            role="menuitem"
            className={action.name.startsWith('Delete') ? 'danger-text' : ''}
            key={action.name}
            onClick={() => {
              action.run();
              onClose();
            }}
          >
            {action.name}
          </button>
        ))}
      </div>
    </div>
  );
}
