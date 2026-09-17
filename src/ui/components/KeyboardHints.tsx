import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { shortcuts, localShortcuts } from '../shortcuts';
import { useCaptureShortcut } from '../use-capture-shortcut';
export function ShortcutList({
  compact = false,
  modifier,
}: {
  compact?: boolean;
  modifier?: 'primary' | 'alt';
}) {
  const captureShortcut = useCaptureShortcut();
  const items = [
    ...shortcuts
      .filter((s) => !modifier || s.modifier === modifier)
      .map((s) => (s.action === 'capture' ? { ...s, keys: captureShortcut } : s)),
    ...(!modifier ? localShortcuts : []),
  ];
  return (
    <dl className={'shortcut-list ' + (compact ? 'compact' : '')}>
      {items.map((item) => (
        <div key={item.keys}>
          <dt>
            <kbd>{item.keys}</kbd>
          </dt>
          <dd>{item.label}</dd>
        </div>
      ))}
    </dl>
  );
}
export function KeyboardHints() {
  const [modifier, setModifier] = useState<'primary' | 'alt'>();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      clearTimeout(timer);
      timer = undefined;
      setModifier(undefined);
    };
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      reset();
      if (
        ['Control', 'Meta', 'Alt'].includes(event.key) &&
        !(event.ctrlKey && event.altKey) &&
        !event.shiftKey
      )
        timer = setTimeout(() => setModifier(event.key === 'Alt' ? 'alt' : 'primary'), 1000);
    };
    const up = (event: KeyboardEvent) => {
      if (['Control', 'Meta', 'Alt'].includes(event.key)) reset();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', reset);
    };
  }, []);
  useLayoutEffect(() => {
    if (modifier) panel.current?.showPopover?.();
  }, [modifier]);
  return modifier ? (
    <div
      ref={panel}
      popover="manual"
      className="keyboard-hints"
      role="status"
      aria-label="Keyboard shortcuts"
    >
      <div className="section-heading">
        <strong>
          <Keyboard size={16} /> Keyboard shortcuts
        </strong>
        <span className="muted">Release to hide</span>
      </div>
      <ShortcutList compact modifier={modifier} />
      <p className="small muted">
        Shortcuts apply in the inspector. In dialogs, use Tab, arrows, Enter and Escape. More in ?
        Help.
      </p>
    </div>
  ) : null;
}
