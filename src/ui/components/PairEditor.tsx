import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Pair } from '../../shared/model';
import { sensitiveName } from '../../shared/security';
export function PairEditor({
  pairs,
  onChange,
  label,
}: {
  pairs: Pair[];
  onChange: (pairs: Pair[]) => void;
  label: string;
}) {
  const [reveal, setReveal] = useState(false);
  const update = (index: number, key: keyof Pair, value: string) =>
    onChange(pairs.map((p, i) => (i === index ? { ...p, [key]: value } : p)));
  return (
    <section className="pair-editor" aria-label={label}>
      <div className="section-heading">
        <h3>{label}</h3>
        <button className="text-button" onClick={() => setReveal(!reveal)}>
          {reveal ? <EyeOff size={13} /> : <Eye size={13} />} {reveal ? 'Mask' : 'Reveal'}
        </button>
      </div>
      <div className="pair-labels">
        <span>Key</span>
        <span>Value</span>
      </div>
      {pairs.map((pair, i) => (
        <div className="pair-edit-row" key={i}>
          <input
            aria-label={label + ' key ' + (i + 1)}
            value={pair.name}
            onChange={(e) => update(i, 'name', e.target.value)}
            spellCheck={false}
          />
          <input
            aria-label={label + ' value ' + (i + 1)}
            type={!reveal && sensitiveName(pair.name) ? 'password' : 'text'}
            value={pair.value}
            onChange={(e) => update(i, 'value', e.target.value)}
            spellCheck={false}
          />
          <button
            className="icon-button danger-text"
            aria-label={'Delete ' + label + ' row ' + (i + 1)}
            onClick={() => onChange(pairs.filter((_, index) => index !== i))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button className="text-button" onClick={() => onChange([...pairs, { name: '', value: '' }])}>
        <Plus size={14} />
        Add row
      </button>
    </section>
  );
}
