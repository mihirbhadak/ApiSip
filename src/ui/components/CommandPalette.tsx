import { useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog } from './Dialog';
export type PaletteCommand = { name: string; shortcut?: string; run: () => void };
export function CommandPalette({
  commands,
  onClose,
}: {
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState(''),
    [index, setIndex] = useState(0);
  const matches = commands.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <Dialog title="Command palette" onClose={onClose}>
      <label className="palette-search">
        <Search size={18} />
        <input
          autoFocus
          aria-label="Search commands"
          placeholder="What would you like to do?"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex(Math.min(matches.length - 1, index + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex(Math.max(0, index - 1));
            }
            if (e.key === 'Enter' && matches[index]) {
              onClose();
              matches[index].run();
            }
          }}
        />
      </label>
      <div className="command-list" role="listbox" aria-label="Commands">
        {matches.map((c, i) => (
          <button
            role="option"
            aria-selected={i === index}
            key={c.name}
            className={index === i ? 'active' : ''}
            onClick={() => {
              onClose();
              c.run();
            }}
          >
            <span>{c.name}</span>
            {c.shortcut && <kbd>{c.shortcut}</kbd>}
          </button>
        ))}
      </div>
      {!matches.length && <p className="empty-small">No matching commands.</p>}
    </Dialog>
  );
}
