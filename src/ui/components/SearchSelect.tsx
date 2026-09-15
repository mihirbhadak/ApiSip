import { Children, isValidElement, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
type Option = { value: string; label: string; disabled: boolean };
const text = (node: ReactNode): string =>
  Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child),
    )
    .join('');
function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>(child)
    )
      return [];
    if (child.type !== 'option') return optionsFrom(child.props.children);
    const label = text(child.props.children);
    return [{ value: String(child.props.value ?? label), label, disabled: !!child.props.disabled }];
  });
}
/** One editable ARIA combobox; typing filters, arrows navigate, Enter commits, Escape cancels. */
export function SearchSelect({
  value,
  onValueChange,
  children,
  'aria-label': label,
  disabled,
  className = '',
  allowCustom = false,
}: {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  'aria-label': string;
  disabled?: boolean;
  className?: string;
  allowCustom?: boolean;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [index, setIndex] = useState(0);
  const options = optionsFrom(children);
  const filtered = options.filter(
    (option) =>
      option.label.toLowerCase().includes(query.toLowerCase()) ||
      option.value.toLowerCase().includes(query.toLowerCase()),
  );
  if (allowCustom && query.trim() && !options.some((option) => option.value === query.trim()))
    filtered.unshift({ value: query.trim(), label: query.trim(), disabled: false });
  const current = options.find((option) => option.value === String(value));
  const active = filtered[index];
  const begin = () => {
    if (!disabled && !open) {
      setQuery('');
      setIndex(0);
      setOpen(true);
    }
  };
  const choose = (option: Option) => {
    if (option.disabled) return;
    setOpen(false);
    if (option.value !== String(value)) onValueChange(option.value);
    input.current?.focus();
  };
  const move = (direction: number) => {
    let next = index;
    for (let i = 0; i < filtered.length; i++) {
      next = (next + direction + filtered.length) % filtered.length;
      if (!filtered[next]?.disabled) {
        setIndex(next);
        break;
      }
    }
  };
  return (
    <span className={'search-select ' + className}>
      <input
        ref={input}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && active ? id + '-' + index : undefined}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        value={open ? query : (current?.label ?? String(value))}
        placeholder={open ? 'Search ' + label.toLowerCase() + '...' : 'Choose...'}
        onFocus={(event) => event.currentTarget.select()}
        onClick={begin}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            if (!open) begin();
            else move(e.key === 'ArrowDown' ? 1 : -1);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (!open) begin();
            else if (active) choose(active);
          } else if (open && e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          } else if (open && e.key === 'Tab') setOpen(false);
        }}
      />
      {open ? (
        <Search size={13} className="select-chevron" />
      ) : (
        <ChevronDown size={13} className="select-chevron" />
      )}
      {open && (
        <FloatingPanel
          anchor={input}
          role="listbox"
          id={id}
          label={label + ' options'}
          onClose={() => setOpen(false)}
          className="select-options"
        >
          {filtered.length ? (
            filtered.map((option, i) => (
              <div
                key={option.value}
                id={id + '-' + i}
                role="option"
                aria-selected={i === index && !option.disabled}
                aria-disabled={option.disabled || undefined}
                className={'select-option ' + (i === index ? 'highlighted' : '')}
                ref={(element) => {
                  if (i === index) element?.scrollIntoView?.({ block: 'nearest' });
                }}
                onPointerDown={(e) => e.preventDefault()}
                onPointerMove={() => setIndex(i)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  choose(option);
                }}
              >
                <span>{option.label}</span>
                {option.value === String(value) && <Check size={13} />}
              </div>
            ))
          ) : (
            <div className="select-empty" role="option" aria-selected={false} aria-disabled="true">
              No matching options
            </div>
          )}
        </FloatingPanel>
      )}
    </span>
  );
}
