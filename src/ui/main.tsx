import { Component, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import EditorPage from './EditorPage';
import SetupPage from './SetupPage';
import { lazy, Suspense } from 'react';
const LabPage = lazy(() => import('./lab/LabPage'));
import { UpdateNotice } from './components/UpdateNotice';
import { editorRoute } from '../shared/editor';
import './styles.css';
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal-error">
        <h1>The inspector could not render this view</h1>
        <p>Your captured data remains in local storage. Reload the inspector to reconnect.</p>
        <button onClick={() => location.reload()}>Reload inspector</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function RootView() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const change = () => setHash(location.hash);
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const draftId = editorRoute(hash);
  if (hash === '#/setup') return <SetupPage />;
  if (hash === '#/lab' || hash.startsWith('#/lab/'))
    return (
      <Suspense fallback={<main className="empty-state">Loading Test lab…</main>}>
        <LabPage initialId={hash.split('/')[2]} />
      </Suspense>
    );
  return (
    <>
      {draftId === undefined ? <App /> : <EditorPage key={draftId} id={draftId} />}
      <UpdateNotice />
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <RootView />
  </ErrorBoundary>,
);
