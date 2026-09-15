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
  return (
    <Dialog title="Add to collection" onClose={onClose}>
      <p className="muted">Save {count} request(s) to a collection.</p>
      {entities
        .filter((e) => e.kind === 'collection')
        .map((e) => (
          <button className="collection-choice" key={e.id} onClick={() => onSelect(e.id)}>
            <Folder size={15} />
            {e.name}
          </button>
        ))}
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
          if (e.key === 'Escape') onClose();
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const items = [...e.currentTarget.querySelectorAll('button')];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            items[
              (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
            ]?.focus();
          }
        }}
      >
        {actions.map((action, i) => (
          <button
            autoFocus={i === 0}
            role="menuitem"
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
