import { HelpButton } from './HelpButton';
import type { HelpTopic } from '../help-content';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  const helpTopic: HelpTopic | undefined = title.includes('filter')
    ? 'filters'
    : title.includes('Export')
      ? 'export'
      : title.includes('Settings')
        ? 'settings'
        : title.includes('collection')
          ? 'collections'
          : title.includes('columns')
            ? 'requests'
            : /workspace|session/i.test(title)
              ? 'workspaces'
              : undefined;
  return (
    <dialog
      ref={ref}
      className={(wide ? 'dialog wide ' : 'dialog ') + className}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        {helpTopic && <HelpButton topic={helpTopic} label={'Help with ' + title.toLowerCase()} />}
        <button aria-label="Close dialog" className="icon-button" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ConfirmDialog({
  title,
  description,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p>{description}</p>
      <div className="dialog-actions">
        <button autoFocus onClick={onClose}>
          Cancel
        </button>
        <button className="danger" onClick={onConfirm}>
          Delete
        </button>
      </div>
    </Dialog>
  );
}
