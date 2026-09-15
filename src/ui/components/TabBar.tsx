import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react';
/** Roving tab focus; arrow navigation selects the next panel without traversing every tab. */
export function TabBar({
  children,
  className = 'tabs',
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      className={className}
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
        ];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        event.stopPropagation();
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
        buttons[next]?.click();
        buttons[next]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }}
    >
      {Children.map(children, (child) => {
        if (
          !isValidElement<ButtonHTMLAttributes<HTMLButtonElement>>(child) ||
          child.type !== 'button'
        )
          return child;
        const selected =
          child.props['aria-selected'] ??
          child.props.className?.split(' ').includes('active') ??
          false;
        return cloneElement(child, {
          role: 'tab',
          'aria-selected': selected,
          tabIndex: selected ? 0 : -1,
        });
      })}
    </div>
  );
}
