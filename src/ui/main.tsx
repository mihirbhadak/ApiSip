import { Component, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import EditorPage from './EditorPage';
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
  const [draftId, setDraftId] = useState(() => editorRoute(location.hash));
  useEffect(() => {
    const change = () => setDraftId(editorRoute(location.hash));
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return draftId === undefined ? <App /> : <EditorPage key={draftId} id={draftId} />;
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <RootView />
  </ErrorBoundary>,
);
