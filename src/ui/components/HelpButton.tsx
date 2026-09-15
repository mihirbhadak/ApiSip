import { CircleHelp } from 'lucide-react';
import type { HelpTopic } from '../help-content';
export function openHelp(topic: HelpTopic = 'start') {
  window.dispatchEvent(new CustomEvent('api-catcher:help', { detail: topic }));
}
export function HelpButton({
  topic,
  label = 'How to use this section',
}: {
  topic: HelpTopic;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="icon-button help-button"
      aria-label={label}
      title={label}
      onClick={() => openHelp(topic)}
    >
      <CircleHelp size={15} />
    </button>
  );
}
