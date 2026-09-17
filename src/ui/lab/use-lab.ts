import { useCallback, useEffect, useRef, useState } from 'react';
import { ZodError } from 'zod';
import { getRecord, getSettings, initialize, listRows } from '../../storage/repository';
import {
  deleteLabItem,
  getSuite,
  listLab,
  saveEnvironment,
  saveSuite,
  saveSuiteReport,
} from '../../storage/lab';
import {
  newSuite,
  stepFromCapture,
  type Environment,
  type SuiteReport,
  type TestSuite,
} from '../../lab/model';
import { reviewSuite, runSuite } from '../../lab/engine';
import { testTransport } from '../../lab/transport';
import { useTheme } from '../use-theme';
import type { Settings } from '../../shared/model';
import { defaultSettings } from '../../shared/model';
import type { RequestRow } from '../../storage/database';
export function useLab(initialId?: string) {
  const [settings, setSettings] = useState<Settings>(defaultSettings),
    [data, setData] = useState<Awaited<ReturnType<typeof listLab>>>({
      suites: [],
      environments: [],
      reports: [],
    });
  const [suite, setSuite] = useState<TestSuite>(),
    [rows, setRows] = useState<RequestRow[]>([]),
    [environmentId, setEnvironmentId] = useState('');
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [report, setReport] = useState<SuiteReport>(),
    [review, setReview] = useState<ReturnType<typeof reviewSuite>>();
  const run = useRef<AbortController | undefined>(undefined);
  const saveLock = useRef(false);
  const environment = data.environments.find((e) => e.id === environmentId);
  useTheme(settings.theme);
  useEffect(() => {
    let alive = true;
    const refreshTheme = () => {
      void getSettings()
        .then((next) => {
          // A lab keeps its own workspace and unsaved definition when global settings change.
          if (alive)
            setSettings((current) =>
              current.theme === next.theme ? current : { ...current, theme: next.theme },
            );
        })
        .catch(() => {
          if (alive) setError('Could not refresh appearance settings.');
        });
    };
    const message = (value: { type?: string }) => {
      if (value.type === 'database-changed') refreshTheme();
    };
    globalThis.chrome?.runtime?.onMessage?.addListener(message);
    window.addEventListener('focus', refreshTheme);
    return () => {
      alive = false;
      globalThis.chrome?.runtime?.onMessage?.removeListener(message);
      window.removeEventListener('focus', refreshTheme);
    };
  }, []);
  const task = useCallback((fn: () => Promise<void>) => {
    setError('');
    setMessage('');
    void fn().catch((e: unknown) =>
      setError(
        e instanceof ZodError
          ? 'Check ' +
              (e.issues[0]?.path.join(' → ') || 'the definition') +
              ': ' +
              (e.issues[0]?.message ?? 'Invalid value')
          : e instanceof Error
            ? e.message
            : 'The operation failed.',
      ),
    );
  }, []);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const active = await initialize();
      const requested = initialId ? await getSuite(initialId) : undefined;
      if (initialId && !requested) throw new Error('Suite unavailable');
      const state = { ...active, workspaceId: requested?.workspaceId ?? active.workspaceId };
      const contents = await listLab(state.workspaceId);
      const captures = await listRows({ workspaceId: state.workspaceId });
      if (!mounted) return;
      setSettings(state);
      setData(contents);
      setRows(captures.sort((a, b) => b.timestamp - a.timestamp).slice(0, 2000));
      const selected = contents.suites[0];
      const loaded = requested ?? (selected && (await getSuite(selected.id)));
      if (mounted) setSuite(loaded);
    })()
      .catch(() => {
        if (mounted)
          setError(
            'Could not load this Test lab. The suite may have been deleted; open Test lab again from the inspector.',
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      run.current?.abort();
    };
  }, [initialId]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || run.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const leave = () => run.current?.abort();
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('pagehide', leave);
    };
  }, [dirty]);
  const refresh = async () => setData(await listLab(settings.workspaceId));
  const edit = (value: TestSuite) => {
    if (saveLock.current || run.current) return;
    setSuite(value);
    setDirty(true);
    setReview(undefined);
  };
  const choose = (value?: TestSuite) => {
    if (
      saveLock.current ||
      run.current ||
      (dirty && !window.confirm('Discard unsaved test changes?'))
    )
      return;
    setSuite(value);
    setDirty(value?.revision === 0);
    history.replaceState(null, '', '#/lab' + (value?.revision ? '/' + value.id : ''));
    setReport(undefined);
    setReview(undefined);
    setError('');
  };
  const save = async () => {
    if (!suite || saveLock.current || run.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const parsed = await saveSuite(suite);
      setSuite(parsed);
      history.replaceState(null, '', '#/lab/' + parsed.id);
      setDirty(false);
      setMessage('Test suite saved locally');
      await refresh();
      return parsed;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  const prepare = async () => {
    if (!suite || run.current || saveLock.current) return;
    // Validate all steps before saving/review; no network operation occurs here.
    const plan = reviewSuite(suite, environment);
    await save();
    setReview(plan);
  };
  const start = async () => {
    if (!suite || !review || run.current) return;
    setReview(undefined);
    setBusy(true);
    const controller = new AbortController();
    run.current = controller;
    try {
      // Check every destination before the first request, avoiding partially executed permission failures.
      for (const origin of new Set(review.map((s) => s.origin))) {
        if (!(await chrome.permissions.contains({ origins: [origin + '/*'] })))
          throw new Error(
            'Grant website access in the inspector before running tests for ' + origin,
          );
      }
      await runSuite(
        structuredClone(suite),
        environment && structuredClone(environment),
        testTransport,
        controller.signal,
        async (next) => {
          await saveSuiteReport(next);
          setReport(next);
        },
      );
      await refresh();
    } finally {
      run.current = undefined;
      setBusy(false);
    }
  };
  const addCapture = async (id: string) => {
    const record = await getRecord(id);
    if (!record) throw new Error('This capture was deleted.');
    if (suite) edit({ ...suite, steps: [...suite.steps, stepFromCapture(record)] });
    else {
      setSuite(newSuite(settings.workspaceId, stepFromCapture(record)));
      setDirty(true);
    }
  };
  return {
    settings,
    data,
    rows,
    suite,
    dirty,
    busy,
    saving,
    locked: busy || saving,
    loading,
    error,
    message,
    environmentId,
    setEnvironmentId: (id: string) => {
      if (!saveLock.current && !run.current) setEnvironmentId(id);
    },
    environment,
    report,
    setReport,
    review,
    setReview,
    task,
    edit,
    choose,
    save,
    prepare,
    start,
    addCapture,
    stop: () => run.current?.abort(),
    refresh,
    create: () => {
      choose(newSuite(settings.workspaceId));
    },
    saveEnv: async (env: Environment) => {
      await saveEnvironment(env);
      await refresh();
      setEnvironmentId(env.id);
    },
    remove: async (store: 'suites' | 'environments', id: string) => {
      await deleteLabItem(store, id);
      if (store === 'suites') {
        history.replaceState(null, '', '#/lab');
        setSuite(undefined);
        setDirty(false);
        setReport(undefined);
      } else setEnvironmentId('');
      await refresh();
    },
  };
}
