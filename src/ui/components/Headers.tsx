import { useState } from 'react';
import { Copy, Eye, EyeOff, Search } from 'lucide-react';
import type { Pair } from '../../shared/model';
import { MASK, redactText, sensitiveName } from '../../shared/security';
export function Headers({
  pairs,
  title,
  copy,
  mask = true,
}: {
  pairs: Pair[];
  title: string;
  copy: (text: string) => void;
  mask?: boolean;
}) {
  const [search, setSearch] = useState(''),
    [revealed, setRevealed] = useState<Set<number>>(new Set());
  const value = (pair: Pair, index: number) =>
    mask && !revealed.has(index)
      ? sensitiveName(pair.name)
        ? MASK
        : redactText(pair.value)
      : pair.value;
  return (
    <section className="header-view">
      <div className="section-heading">
        <h3>
          {title} <span className="muted">{pairs.length}</span>
        </h3>
        <button
          className="text-button"
          onClick={() => copy(pairs.map((p, i) => p.name + ': ' + value(p, i)).join('\n'))}
        >
          <Copy size={13} />
          Copy all
        </button>
      </div>
      <label className="inline-search">
        <Search size={13} />
        <input
          aria-label={'Search ' + title}
          value={search}
          placeholder="Find header…"
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <table className="kv-table">
        <tbody>
          {pairs
            .map((pair, i) => ({ pair, i }))
            .filter(({ pair }) =>
              (pair.name + ' ' + (mask ? '' : pair.value))
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map(({ pair, i }) => (
              <tr key={i}>
                <th scope="row">{pair.name}</th>
                <td className="mono">{value(pair, i)}</td>
                <td className="row-actions">
                  {mask && sensitiveName(pair.name) && (
                    <button
                      className="icon-button"
                      aria-label={'Reveal ' + pair.name}
                      onClick={() =>
                        setRevealed((old) => {
                          const next = new Set(old);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                    >
                      {revealed.has(i) ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={'Copy value of ' + pair.name}
                    onClick={() => copy(value(pair, i))}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    className="tiny-copy"
                    aria-label={'Copy header ' + pair.name}
                    onClick={() => copy(pair.name + ': ' + value(pair, i))}
                  >
                    line
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {!pairs.length && <p className="muted">Chrome did not expose any headers.</p>}
    </section>
  );
}
