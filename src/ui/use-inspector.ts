import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultSettings, type CapturedRequest, type Entity } from '../shared/model';
import { sendCommand, type RuntimeState } from '../shared/messages';
import { listEntities } from '../storage/repository';
export function useInspector(search: string, expression: string, session: string) {
  const [state, setState] = useState<RuntimeState>({
    settings: defaultSettings,
    count: 0,
    tabCount: 0,
    sessionCount: 0,
    attachedTabs: [],
    diagnostics: [],
    hostsGranted: false,
  });
  const [entities, setEntities] = useState<Entity[]>([]);
  const [rows, setRows] = useState<CapturedRequest[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const worker = useRef<Worker | null>(null),
    searchId = useRef(0);
  const refresh = useCallback(async () => {
    try {
      const [next, items] = await Promise.all([sendCommand({ type: 'state' }), listEntities()]);
      setState(next);
      setEntities(items);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to the inspector.');
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onMessage = (message: { type?: string }) => {
      if (message.type === 'database-changed') void refresh();
    };
    globalThis.chrome?.runtime?.onMessage?.addListener(onMessage);
    return () => globalThis.chrome?.runtime?.onMessage?.removeListener(onMessage);
  }, [refresh]);
  useEffect(() => {
    const instance = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = (
      e: MessageEvent<{ revision: number; rows?: CapturedRequest[]; error?: string }>,
    ) => {
      if (e.data.revision !== searchId.current) return;
      setLoading(false);
      setError(e.data.error ?? '');
      if (e.data.rows) setRows(e.data.rows);
    };
    instance.onerror = () => {
      setError('Search worker failed. Reload the inspector.');
      setLoading(false);
    };
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(
      () => {
        if (!globalThis.chrome?.runtime?.id) return;
        setLoading(true);
        searchId.current++;
        worker.current?.postMessage({
          revision: searchId.current,
          scope:
            session === 'all'
              ? { workspaceId: state.settings.workspaceId }
              : { sessionId: session || state.settings.sessionId },
          search,
          expression,
        });
      },
      search ? 180 : 50,
    );
    return () => clearTimeout(timer);
  }, [search, expression, session, state.settings.workspaceId, state.settings.sessionId, revision]);
  return { state, entities, rows, error, loading, refresh, revision };
}
