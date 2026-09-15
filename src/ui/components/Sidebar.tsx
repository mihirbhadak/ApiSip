import { HelpButton, openHelp } from './HelpButton';
import { CreatorLinks } from './CreatorLinks';
import { CreatorAvatar } from './CreatorAvatar';
import { ActionMenu } from './ActionMenu';
import { SearchSelect } from './SearchSelect';
import {
  Activity,
  Bookmark,
  Folder,
  FolderPlus,
  Globe,
  Layers,
  ListFilter,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import type { Entity, Settings } from '../../shared/model';
import type { Management } from '../use-management';
export function Sidebar({
  settings,
  entities,
  view,
  setView,
  viewSession,
  setSession,
  expression,
  setExpression,
  count,
  management: m,
  task,
}: {
  settings: Settings;
  entities: Entity[];
  view: string;
  setView: (view: string) => void;
  viewSession: string;
  setSession: (session: string) => void;
  expression: string;
  setExpression: (expression: string) => void;
  count: number;
  management: Management;
  task: (fn: () => Promise<void>) => void;
}) {
  const scoped = entities.filter((e) => e.workspaceId === settings.workspaceId),
    workspace = entities.find((e) => e.id === settings.workspaceId);
  const menu = (e: Entity) => (
    <ActionMenu
      label={'Manage ' + e.name}
      actions={[
        { name: 'Rename', run: () => m.rename(e) },
        ...(e.kind === 'workspace'
          ? [{ name: 'Duplicate', run: () => task(() => m.duplicate(e)) }]
          : []),
        ...(e.kind === 'session'
          ? [{ name: e.archived ? 'Unarchive' : 'Archive', run: () => task(() => m.archive(e)) }]
          : []),
        { name: 'Delete', danger: true, run: () => m.remove(e) },
      ]}
    />
  );
  return (
    <aside className="sidebar">
      <div className="workspace-control">
        <SearchSelect
          aria-label="Workspace"
          value={settings.workspaceId}
          onValueChange={(value) => task(() => m.switchWorkspace(value))}
        >
          {entities
            .filter((e) => e.kind === 'workspace')
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          {!entities.length && <option value="default">My workspace</option>}
        </SearchSelect>
        {workspace && menu(workspace)}
      </div>
      <button className="sidebar-create" onClick={() => m.create('workspace')}>
        <Plus size={13} />
        New workspace
      </button>
      <nav aria-label="Inspector views">
        <button
          aria-label="Requests"
          className={view === 'requests' ? 'active' : ''}
          onClick={() => setView('requests')}
        >
          <Activity size={15} />
          Requests<span>{count.toLocaleString()}</span>
        </button>
        <button
          aria-label="Saved APIs"
          className={view === 'saved' ? 'active' : ''}
          onClick={() => {
            setView('saved');
            setSession('all');
          }}
        >
          <Bookmark size={15} />
          Saved APIs
        </button>
        <button
          aria-label="Insights"
          className={view === 'analytics' ? 'active' : ''}
          onClick={() => setView('analytics')}
        >
          <Layers size={15} />
          Insights
        </button>
      </nav>
      <div className="sidebar-section">
        <div className="sidebar-label">
          <span>SESSIONS</span>
          <HelpButton topic="workspaces" label="Help with workspaces and sessions" />
          <button
            className="icon-button"
            aria-label="New session"
            onClick={() => m.create('session')}
          >
            <Plus size={14} />
          </button>
        </div>
        <button
          className={'sidebar-item ' + (viewSession === 'all' ? 'active' : '')}
          onClick={() => setSession('all')}
        >
          <Globe size={13} />
          All sessions
        </button>
        {scoped
          .filter((e) => e.kind === 'session')
          .map((e) => (
            <div className="entity-row" key={e.id}>
              <button
                className={
                  'sidebar-item ' + ((viewSession || settings.sessionId) === e.id ? 'active' : '')
                }
                onClick={() => {
                  setSession(e.id);
                  setView('requests');
                }}
              >
                <span
                  className={
                    'session-dot ' +
                    (e.id === settings.sessionId && settings.recording ? 'live' : '')
                  }
                />
                <span>
                  {e.name}
                  {e.archived ? ' · archived' : ''}
                </span>
              </button>
              {menu(e)}
            </div>
          ))}
      </div>
      <div className="sidebar-section">
        <div className="sidebar-label">
          <span>COLLECTIONS</span>
          <HelpButton topic="collections" label="Help with collections" />
          <button
            className="icon-button"
            aria-label="New collection"
            onClick={() => m.create('collection')}
          >
            <Plus size={14} />
          </button>
        </div>
        {scoped
          .filter((e) => e.kind === 'collection')
          .map((e) => (
            <div className="entity-row" key={e.id}>
              <button
                className={'sidebar-item ' + (view === 'collection:' + e.id ? 'active' : '')}
                onClick={() => {
                  setView('collection:' + e.id);
                  setSession('all');
                }}
              >
                <Folder size={13} />
                {e.name}
              </button>
              {menu(e)}
            </div>
          ))}
        {!scoped.some((e) => e.kind === 'collection') && (
          <button className="sidebar-empty" onClick={() => m.create('collection')}>
            <FolderPlus size={16} />
            <span>
              Organize saved requests
              <br />
              Create a collection
            </span>
          </button>
        )}
      </div>
      <div className="sidebar-section">
        <div className="sidebar-label">
          <span>SAVED FILTERS</span>
          <HelpButton topic="filters" label="Help with saved filters" />
        </div>
        {scoped
          .filter((e) => e.kind === 'filter')
          .map((e) => (
            <div className="entity-row" key={e.id}>
              <button
                className={'sidebar-item ' + (expression === e.expression ? 'active' : '')}
                onClick={() => setExpression(e.expression ?? '')}
              >
                <ListFilter size={13} />
                {e.name}
              </button>
              {menu(e)}
            </div>
          ))}
      </div>
      <div className="sidebar-bottom">
        <div className="creator-credit">
          <button onClick={() => openHelp('about')} title="About Mihir Bhadak">
            <CreatorAvatar />
            <span>
              <small>CREATED BY</small>
              <strong>Mihir Bhadak</strong>
            </span>
          </button>
          <CreatorLinks compact />
        </div>
        <div className="local-note">
          <ShieldCheck size={14} />
          <span>On your device. Always local.</span>
        </div>
      </div>
    </aside>
  );
}
