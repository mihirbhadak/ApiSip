import { useEffect, useRef } from 'react';
import { shortcuts, type ShortcutAction } from './shortcuts';
export function useShortcuts(actions: Record<ShortcutAction | 'delete' | 'close', () => void>) {
  const current = useRef(actions);
  current.current = actions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const target = e.target;
      const editable =
        target instanceof Element &&
        !!target.closest('input, textarea, select, [contenteditable="true"]');
      const dialog = !!document.querySelector('dialog[open]');
      if (dialog) return;
      const shortcut = shortcuts.find(
        (s) =>
          s.key === e.key.toLowerCase() &&
          !!s.shift === e.shiftKey &&
          (s.modifier === 'primary'
            ? (e.ctrlKey || e.metaKey) && !e.altKey
            : e.altKey && !e.ctrlKey && !e.metaKey),
      );
      if (shortcut) {
        e.preventDefault();
        current.current[shortcut.action]();
      } else if (e.key === '?' && !editable) {
        e.preventDefault();
        current.current.help();
      } else if (e.key === 'Delete' && !editable) {
        e.preventDefault();
        current.current.delete();
      } else if (e.key === 'Escape') current.current.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
