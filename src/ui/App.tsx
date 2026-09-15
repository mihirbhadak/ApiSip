import { useInspectorController } from './use-inspector-controller';
import { Sidebar } from './components/Sidebar';
import { InspectorHeader } from './components/InspectorHeader';
import { CaptureToolbar } from './components/CaptureToolbar';
import { TrafficPanes } from './components/TrafficPanes';
import { InspectorStatus } from './components/InspectorStatus';
import { InspectorOverlays } from './components/InspectorOverlays';
export default function App() {
  const controller = useInspectorController();
  const {
    settings,
    entities,
    rows,
    view,
    setView,
    viewSession,
    setViewSession,
    task,
    updateSettings,
    expression,
    setExpression,
    management,
  } = controller;
  return (
    <div className="app-shell">
      <InspectorHeader controller={controller} />
      <Sidebar
        settings={settings}
        entities={entities}
        count={rows.length}
        view={view}
        setView={setView}
        viewSession={viewSession}
        setSession={(id) => {
          setViewSession(id);
          const s = entities.find((e) => e.id === id);
          if (s && !s.archived) task(() => updateSettings({ sessionId: id }));
        }}
        expression={expression}
        setExpression={setExpression}
        management={management}
        task={task}
      />

      <main className="main">
        <CaptureToolbar controller={controller} />
        <TrafficPanes controller={controller} />
        <InspectorStatus controller={controller} />
      </main>
      <InspectorOverlays controller={controller} />
    </div>
  );
}
