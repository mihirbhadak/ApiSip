import { useEffect } from 'react';
export function useShortcuts(actions: {
  search: () => void;
  commands: () => void;
  export: () => void;
  copy: () => void;
  delete: () => void;
  close: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const editable = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? '');
      const dialog = !!document.querySelector('dialog[open]');
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        actions.commands();
      } else if (!dialog && (e.ctrlKey || e.metaKey) && ['k', 'f'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        actions.search();
      } else if (!dialog && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        actions.export();
      } else if (!dialog && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        actions.copy();
      } else if (!dialog && e.key === 'Delete' && !editable) {
        e.preventDefault();
        actions.delete();
      } else if (!dialog && e.key === 'Escape') actions.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);
}
