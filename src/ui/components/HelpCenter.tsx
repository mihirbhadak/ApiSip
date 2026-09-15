import { useEffect, useState } from 'react';
import { Search, BookOpen } from 'lucide-react';
import { helpTopics, type HelpTopic } from '../help-content';
import { Dialog } from './Dialog';
import { ShortcutList } from './KeyboardHints';
import { CreatorLinks } from './CreatorLinks';
import { CreatorAvatar } from './CreatorAvatar';
export function HelpCenter() {
  const [topic, setTopic] = useState<HelpTopic>();
  useEffect(() => {
    const show = (event: Event) => {
      const id: unknown = (event as CustomEvent).detail;
      setTopic(helpTopics.find((item) => item.id === id)?.id ?? 'start');
    };
    window.addEventListener('api-catcher:help', show);
    return () => window.removeEventListener('api-catcher:help', show);
  }, []);
  return topic ? (
    <HelpDialog key={topic} initial={topic} onClose={() => setTopic(undefined)} />
  ) : null;
}
export function HelpDialog({
  initial = 'start',
  onClose,
}: {
  initial?: HelpTopic;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<HelpTopic>(initial),
    [query, setQuery] = useState('');
  const matches = helpTopics.filter((topic) =>
    [topic.title, topic.summary, ...topic.steps, topic.note]
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const active = matches.find((topic) => topic.id === selected) ?? matches[0];
  return (
    <Dialog title="Help & guide" wide className="help-dialog" onClose={onClose}>
      <div className="help-search">
        <Search size={16} />
        <input
          autoFocus
          aria-label="Search help"
          placeholder="Search the guide: capture, replay, shortcuts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="help-layout">
        <nav aria-label="Help topics">
          {matches.map((topic) => (
            <button
              key={topic.id}
              className={active?.id === topic.id ? 'active' : ''}
              aria-current={active?.id === topic.id ? 'page' : undefined}
              onClick={() => setSelected(topic.id)}
            >
              {topic.title}
            </button>
          ))}
        </nav>
        {active ? (
          <article className="help-article" aria-label={active.title} key={active.id} tabIndex={0}>
            <div className="help-eyebrow">
              <BookOpen size={14} /> API CATCHER GUIDE
            </div>
            <h3>{active.title}</h3>
            <p className="muted">{active.summary}</p>
            {active.id === 'about' && (
              <div className="creator-profile">
                <CreatorAvatar />
                <div>
                  <strong>Mihir Bhadak</strong>
                  <span>Creator of API Catcher</span>
                </div>
              </div>
            )}
            <ol>
              {active.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {active.id === 'shortcuts' && <ShortcutList />}
            {active.id === 'about' && <CreatorLinks />}
            <p className="notice">{active.note}</p>
          </article>
        ) : (
          <div className="empty-state">
            <h3>No matching help topics</h3>
            <p>Try another term, such as replay or storage.</p>
            <button onClick={() => setQuery('')}>Clear search</button>
          </div>
        )}
      </div>
      <div className="help-footer">
        <span>
          Built by <strong>Mihir Bhadak</strong>
        </span>
        <span>Hold Ctrl / Cmd or Alt for 1 second to reveal shortcuts.</span>
      </div>
    </Dialog>
  );
}
