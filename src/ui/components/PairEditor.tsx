import { LockKeyhole, UnlockKeyhole, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Pair } from '../../shared/model';
import { sensitiveName } from '../../shared/security';
import { SendToggle } from './SendToggle';
export function PairEditor({
  pairs,
  onChange,
  label,
  inclusionControls = false,
  keyPlaceholder,
  valuePlaceholder,
}: {
  pairs: Pair[];
  onChange: (pairs: Pair[]) => void;
  label: string;
  inclusionControls?: boolean;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const [reveal, setReveal] = useState(false);
  const update = (index: number, key: keyof Pair, value: string | boolean) =>
    onChange(pairs.map((p, i) => (i === index ? { ...p, [key]: value } : p)));
  return (
    <section
      className={'pair-editor ' + (inclusionControls ? 'with-send-toggles' : '')}
      aria-label={label}
    >
      <div className="section-heading">
        <h3>{label}</h3>
        <button
          type="button"
          className="text-button"
          title="Show or mask secrets on screen; this does not change what is sent"
          onClick={() => setReveal(!reveal)}
        >
          {reveal ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}{' '}
          {reveal ? 'Mask' : 'Reveal'}
        </button>
      </div>
      {inclusionControls && (
        <p className="small muted">
          Open eye = send. Closed eye = exclude and blur. Values stay saved in this draft.
        </p>
      )}
      <div className="pair-labels">
        {inclusionControls && <span>Send</span>}
        <span>Key</span>
        <span>Value</span>
      </div>
      {pairs.map((pair, i) => (
        <div className="pair-edit-row" key={i}>
          {inclusionControls && (
            <SendToggle
              label={label + ' row ' + (i + 1)}
              included={pair.enabled !== false}
              onChange={(enabled) => update(i, 'enabled', enabled)}
            />
          )}
          <input
            aria-label={label + ' key ' + (i + 1)}
            value={pair.name}
            onChange={(e) => update(i, 'name', e.target.value)}
            spellCheck={false}
            disabled={inclusionControls && pair.enabled === false}
            placeholder={keyPlaceholder}
          />
          <input
            aria-label={label + ' value ' + (i + 1)}
            type={!reveal && sensitiveName(pair.name) ? 'password' : 'text'}
            value={pair.value}
            onChange={(e) => update(i, 'value', e.target.value)}
            spellCheck={false}
            className={inclusionControls && pair.enabled === false ? 'excluded-value' : ''}
            disabled={inclusionControls && pair.enabled === false}
            placeholder={valuePlaceholder}
          />
          <button
            type="button"
            className="icon-button danger-text"
            aria-label={'Delete ' + label + ' row ' + (i + 1)}
            onClick={() => onChange(pairs.filter((_, index) => index !== i))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() => onChange([...pairs, { name: '', value: '' }])}
      >
        <Plus size={14} />
        Add row
      </button>
    </section>
  );
}
