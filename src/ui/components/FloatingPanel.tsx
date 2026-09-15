import {
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
  type KeyboardEventHandler,
} from 'react';

/** Native top-layer placement works inside dialogs and clipped/resizable panes. */
export function FloatingPanel({
  anchor,
  children,
  onClose,
  role,
  label,
  id,
  className = '',
  onKeyDown,
}: {
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  onClose: () => void;
  role: 'menu' | 'listbox';
  label: string;
  id?: string;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const element = panel.current,
      trigger = anchor.current;
    if (!element || !trigger) return;
    window.dispatchEvent(new Event('api-catcher:close-popovers'));
    element.showPopover?.();
    const position = () => {
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upward = below < 220 && above > below;
      element.style.width = width + 'px';
      element.style.maxHeight = Math.max(80, Math.min(320, upward ? above : below)) + 'px';
      element.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + 'px';
      element.style.top =
        (upward ? Math.max(12, rect.top - element.offsetHeight - 5) : rect.bottom + 5) + 'px';
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    const scroll = (event: Event) => {
      if (event.target instanceof Node && !element.contains(event.target)) close.current();
    };
    document.addEventListener('scroll', scroll, true);
    const outside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !element.contains(target) && !trigger.contains(target))
        close.current();
    };
    const closeOthers = () => close.current();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', closeOthers);
    window.addEventListener('blur', closeOthers);
    window.addEventListener('api-catcher:close-popovers', closeOthers);
    return () => {
      observer.disconnect();
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', closeOthers);
      window.removeEventListener('blur', closeOthers);
      window.removeEventListener('api-catcher:close-popovers', closeOthers);
    };
  }, [anchor]);
  return (
    <div
      ref={panel}
      popover="manual"
      id={id}
      role={role}
      aria-label={label}
      className={'floating-panel ' + className}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
