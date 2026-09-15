import { useEffect, useRef, useState } from 'react';
import { sendCommand } from '../../shared/messages';
import { isRunActive, type RunReport } from '../../runner/model';
import { CoalescedTask } from '../../shared/coalesced-task';
import { listRuns } from '../../storage/runs';

export function useRunner(sourceId?: string) {
  const [active, setActive] = useState<RunReport | null>(null);
  const [history, setHistory] = useState<RunReport[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    let alive = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const current = await sendCommand({ type: 'runner-status' });
        const rows = await listRuns(sourceId);
        if (!alive) return;
        setActive(current && isRunActive(current.state) ? current : null);
        setHistory(rows);
        setError('');
        setLoading(false);
      } catch (cause) {
        if (alive) {
          setError(cause instanceof Error ? cause.message : 'Could not read timed runs.');
          setLoading(false);
        }
      }
    };
    const refreshTask = new CoalescedTask(poll);
    const loop = async () => {
      await refreshTask.run();
      if (alive) timer = setTimeout(() => void loop(), 1000);
    };
    refresh.current = () => refreshTask.run();
    void loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [sourceId]);
  const stop = async () => {
    await sendCommand({ type: 'runner-stop' });
    await refresh.current();
  };
  return { active, history, error, loading, refresh: () => refresh.current(), stop };
}
