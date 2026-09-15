import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
export type MenuAction = { name: string; run: () => void; danger?: boolean };
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const trigger = useRef<HTMLButtonElement>(null),
    [open, setOpen] = useState(false);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (open) items.current[0]?.focus();
  }, [open]);
  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  };
  return (
    <span className="action-menu">
      <button
        ref={trigger}
        className="icon-button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <FloatingPanel
          anchor={trigger}
          role="menu"
          label={label}
          onClose={() => close()}
          className="action-options"
          onKeyDown={(e) => {
            const index = items.current.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close(true);
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              const next =
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? actions.length - 1
                    : (index + (e.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length;
              items.current[next]?.focus();
            } else if (e.key === 'Tab') close();
            else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
              const next = actions.findIndex(
                (action, i) =>
                  i > index && action.name.toLowerCase().startsWith(e.key.toLowerCase()),
              );
              items.current[
                next < 0
                  ? actions.findIndex((action) =>
                      action.name.toLowerCase().startsWith(e.key.toLowerCase()),
                    )
                  : next
              ]?.focus();
            }
          }}
        >
          {actions.map((action, i) => (
            <button
              key={action.name}
              ref={(element) => {
                items.current[i] = element;
              }}
              role="menuitem"
              className={action.danger ? 'danger-text' : ''}
              onClick={() => {
                close(true);
                action.run();
              }}
            >
              {action.name}
            </button>
          ))}
        </FloatingPanel>
      )}
    </span>
  );
}
