import { HelpButton } from './HelpButton';
import { Activity, Command, Settings2 } from 'lucide-react';
import type { InspectorController } from '../use-inspector-controller';
export function InspectorHeader({ controller }: { controller: InspectorController }) {
  const { workspace, session, viewSession, setModal } = controller;
  return (
    <>
      {' '}
      <header className="app-header">
        <a href="inspector.html" className="brand">
          <span className="brand-mark">
            <Activity size={19} />
          </span>
          <strong>API Catcher</strong>
          <span className="version">LOCAL</span>
        </a>
        <div className="header-breadcrumb">
          <span>{workspace?.name ?? 'My workspace'}</span>
          <span>/</span>
          <strong>{session?.name ?? (viewSession === 'all' ? 'All sessions' : 'Session')}</strong>
        </div>
        <div className="header-actions">
          <button onClick={() => setModal('runs')}>Timed runs</button>
          <span className="shortcut-prompt">Hold Ctrl / Alt for shortcuts</span>
          <HelpButton topic="start" label="Open help and guide" />
          <button
            className="icon-button"
            title="Command palette (Ctrl / Cmd + Shift + P)"
            aria-label="Open command palette"
            onClick={() => setModal('commands')}
          >
            <Command size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => setModal('settings')}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>
    </>
  );
}
