import { useTheme } from './use-theme';
import { openTestLab } from './lab/actions';
import { openHelp } from './components/HelpButton';
import { shortcuts } from './shortcuts';
import { requestCaptureAccess } from '../shared/permissions';
import { useCaptureShortcut } from './use-capture-shortcut';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type CapturedRequest, type RequestData, type Settings } from '../shared/model';
import { sendCommand } from '../shared/messages';
import { normalizeEndpoint } from '../shared/parse';
import { redactRecord } from '../shared/security';
import { generateCode } from '../export/generators';
import { deleteRecords, getRecord, mutateRecord, saveRequestCopy } from '../storage/repository';
import { useInspector } from './use-inspector';
import { useManagement } from './use-management';
import { useShortcuts } from './use-shortcuts';
import {
  allColumns,
  columnValue,
  defaultColumns,
  type Column,
  type ColumnConfig,
} from './components/RequestTable';
import type { PaletteCommand } from './components/CommandPalette';
import { appendCellFilter, type CellFilter } from './request-cell-filter';
type Modal =
  'runs' | '' | 'filters' | 'export' | 'settings' | 'commands' | 'columns' | 'collection';
export function useInspectorController() {
  const captureShortcut = useCaptureShortcut();
  const [search, setSearch] = useState(''),
    [expression, setExpression] = useState(''),
    [viewSession, setViewSession] = useState('');
  const [view, setView] = useState('requests'),
    [modal, setModal] = useState<Modal>(''),
    [selected, setSelected] = useState<Set<string>>(new Set());
  const [record, setRecord] = useState<CapturedRequest>(),
    [recordId, setRecordId] = useState<string>(),
    [detailTab, setDetailTab] = useState('Overview');
  const [sort, setSort] = useState<{ column: Column; desc: boolean }>({
    column: 'Timestamp',
    desc: true,
  });
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('columns') ?? 'null');
      if (
        Array.isArray(parsed) &&
        parsed.length &&
        parsed.every(
          (c: { name?: Column; width?: number }) =>
            c.name &&
            allColumns.includes(c.name) &&
            typeof c.width === 'number' &&
            c.width >= 50 &&
            c.width <= 900,
        )
      )
        return parsed as ColumnConfig[];
    } catch {
      /* fall back to defaults */
    }
    return defaultColumns;
  });
  const [group, setGroup] = useState('none'),
    [groupValue, setGroupValue] = useState(''),
    [panelWidth, setPanelWidth] = useState(48);
  const [context, setContext] = useState<{
      x: number;
      y: number;
      recordId: string;
      filter?: CellFilter;
    }>(),
    [toast, setToast] = useState(''),
    [operationError, setOperationError] = useState('');
  const searchInput = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { state, entities, rows, error, loading, refresh, revision } = useInspector(
    search,
    expression,
    viewSession,
  );
  const settings = state.settings;
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);
  const task = useCallback((run: () => Promise<void>) => {
    setOperationError('');
    void run().catch((e: unknown) =>
      setOperationError(e instanceof Error ? e.message : 'The operation failed.'),
    );
  }, []);
  const addCellFilter = (filter: CellFilter) => {
    try {
      setExpression(appendCellFilter(expression, filter.node));
      setOperationError('');
      notify('Filter added: ' + filter.label);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Could not add this filter.');
    }
  };
  const changed = useCallback(async () => {
    await sendCommand({ type: 'changed' });
    await refresh();
  }, [refresh]);
  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      await sendCommand({ type: 'settings', patch });
      await refresh();
    },
    [refresh],
  );
  const copy = useCallback(
    (text: string) =>
      task(async () => {
        await navigator.clipboard.writeText(text);
        notify('Copied to clipboard');
      }),
    [notify, task],
  );
  const reset = () => {
    setViewSession('');
    setView('requests');
    setRecordId(undefined);
    setSelected(new Set());
    setModal('');
  };
  const management = useManagement({ settings, entities, updateSettings, changed, reset, notify });
  useTheme(settings.theme);
  useEffect(() => {
    localStorage.setItem('columns', JSON.stringify(columns));
  }, [columns]);
  useEffect(() => {
    if (!recordId) {
      setRecord(undefined);
      return;
    }
    let cancelled = false;
    void getRecord(recordId)
      .then((r) => {
        if (!cancelled) {
          setRecord(r);
          if (!r) setRecordId(undefined);
        }
      })
      .catch(() => {
        if (!cancelled) setOperationError('Could not load the selected request body.');
      });
    return () => {
      cancelled = true;
    };
  }, [recordId, revision]);
  const select = (r: CapturedRequest) => {
    setRecordId(r.id);
    if (view === 'analytics') setView('requests');
  };
  const groupKey = useCallback(
    (r: CapturedRequest) =>
      group === 'URL'
        ? normalizeEndpoint(r.request.url)
        : group === 'Domain'
          ? new URL(r.request.url).host
          : group === 'Method'
            ? r.request.method
            : group === 'Resource type'
              ? r.metadata.resourceType
              : r.sessionId,
    [group],
  );
  const visible = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            (view !== 'saved' || r.isFavorite) &&
            (!view.startsWith('collection:') || r.collectionId === view.slice(11)) &&
            (!groupValue || groupKey(r) === groupValue),
        )
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          const x = columnValue(a, sort.column),
            y = columnValue(b, sort.column);
          return (
            (typeof x === 'number' && typeof y === 'number'
              ? x - y
              : String(x).localeCompare(String(y))) * (sort.desc ? -1 : 1)
          );
        }),
    [rows, view, sort, groupValue, groupKey],
  );
  const groups = useMemo(
    () =>
      group === 'none'
        ? []
        : Object.entries(
            rows.reduce<Record<string, number>>(
              (acc, r) => {
                const key = groupKey(r);
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
              },
              Object.create(null) as Record<string, number>,
            ),
          ).sort((a, b) => b[1] - a[1]),
    [rows, group, groupKey],
  );
  const summary = useMemo(() => {
    const measured = visible.filter((r) => r.timing?.total !== undefined);
    return {
      errors: visible.filter((r) => r.metadata.error || (r.response?.status ?? 0) >= 400).length,
      bytes: visible.some((r) => r.response?.size !== undefined)
        ? visible.reduce((n, r) => n + (r.response?.size ?? 0), 0)
        : undefined,
      average: measured.length
        ? measured.reduce((n, r) => n + r.timing!.total!, 0) / measured.length
        : undefined,
    };
  }, [visible]);
  const workspace = entities.find((e) => e.id === settings.workspaceId),
    session = entities.find((e) => e.id === (viewSession || settings.sessionId));
  const scopedEntities = entities.filter((e) => e.workspaceId === settings.workspaceId);
  const capture = async () => {
    if (!settings.recording && !state.hostsGranted && !(await requestCaptureAccess()))
      throw new Error('Site access was not granted. Capture remains paused.');
    if (!settings.recording && entities.find((e) => e.id === settings.sessionId)?.archived)
      throw new Error('Create or select an unarchived session before recording.');
    await sendCommand({ type: 'toggle-capture' });
    await refresh();
  };
  const responseCapture = async () => {
    if (settings.provider !== 'debugger') {
      if (!(await chrome.permissions.contains({ permissions: ['debugger'] })))
        throw new Error('Debugger permission was not granted. Passive capture remains available.');
      await updateSettings({ provider: 'debugger' });
    } else await updateSettings({ provider: 'webRequest' });
  };
  const updateRecord = (patch: Partial<CapturedRequest>, id = recordId) => {
    if (id)
      task(async () => {
        await mutateRecord(id, (r) => ({ ...r, ...patch }));
        await changed();
      });
  };
  const deleteSelection = () => {
    const ids = selected.size ? [...selected] : recordId ? [recordId] : [];
    if (!ids.length) return;
    management.setConfirmation({
      title: 'Delete ' + ids.length + ' request(s)?',
      description:
        'Their bodies, notes, replay history and related editor drafts will be permanently removed.',
      action: async () => {
        await deleteRecords(ids);
        setSelected(new Set());
        setRecordId(undefined);
        await changed();
        notify('Requests deleted');
      },
    });
  };
  const saveDraft = (request: RequestData) =>
    task(async () => {
      if (!record) return;
      await saveRequestCopy(record.id, request);
      await changed();
      notify('Editable request saved');
    });
  const copyCurl = () => {
    if (!record) return;
    try {
      copy(generateCode('cURL', record.request, !settings.maskSecrets));
    } catch (e) {
      setOperationError(e instanceof Error ? e.message : 'Could not generate cURL.');
    }
  };
  const clear = (scope: string) => {
    setModal('');
    management.clear(scope);
  };
  const keyFor = (action: (typeof shortcuts)[number]['action']) =>
    shortcuts.find((shortcut) => shortcut.action === action)?.keys;
  const commands: PaletteCommand[] = [
    {
      name: 'Open Test lab: suites, workflows and environments',
      run: () => task(() => openTestLab()),
    },
    {
      name: 'Create test from selected request',
      run: () => {
        if (record) task(() => openTestLab(record));
        else notify('Select a request first');
      },
    },
    {
      name: 'Security review of selected request',
      run: () => {
        if (record) setDetailTab('Security');
        else notify('Select a request first');
      },
    },
    {
      name: 'Search requests',
      shortcut: keyFor('search'),
      run: () => searchInput.current?.focus(),
    },
    {
      name: settings.recording ? 'Pause capture' : 'Start capture',
      shortcut: captureShortcut,
      run: () => task(capture),
    },
    { name: 'New session', shortcut: keyFor('session'), run: () => management.create('session') },
    {
      name: 'New workspace',
      shortcut: keyFor('workspace'),
      run: () => management.create('workspace'),
    },
    {
      name: 'New collection',
      shortcut: keyFor('collection'),
      run: () => management.create('collection'),
    },
    { name: 'Open filters', shortcut: keyFor('filters'), run: () => setModal('filters') },
    { name: 'Export requests', shortcut: keyFor('export'), run: () => setModal('export') },
    { name: 'Copy cURL', shortcut: keyFor('copy'), run: copyCurl },
    { name: 'Replay selected request', run: () => setDetailTab('Replay') },
    { name: 'Timed runs', run: () => setModal('runs') },
    { name: 'Save selected request', run: () => updateRecord({ isFavorite: true }) },
    { name: 'Clear current session', run: () => clear('Current session') },
    { name: 'Open settings', shortcut: keyFor('settings'), run: () => setModal('settings') },
    {
      name: 'Focus request list',
      shortcut: keyFor('list'),
      run: () => document.querySelector<HTMLElement>('[aria-label="Request list"]')?.focus(),
    },
    { name: 'Help and guide', shortcut: keyFor('help'), run: () => openHelp() },
    { name: 'About Mihir Bhadak', run: () => openHelp('about') },
  ];
  useShortcuts({
    capture: () => task(capture),
    session: () => management.create('session'),
    workspace: () => management.create('workspace'),
    collection: () => management.create('collection'),
    filters: () => setModal('filters'),
    settings: () => setModal('settings'),
    help: () => openHelp(),
    list: () => document.querySelector<HTMLElement>('[aria-label="Request list"]')?.focus(),
    search: () => searchInput.current?.focus(),
    commands: () => setModal('commands'),
    export: () => setModal('export'),
    copy: copyCurl,
    delete: deleteSelection,
    close: () => {
      setRecordId(undefined);
      setContext(undefined);
    },
  });
  const recordActions =
    record && record.id === context?.recordId
      ? [
          { name: 'Create test suite', run: () => task(() => openTestLab(record)) },
          { name: 'Review security / prepare AI context', run: () => setDetailTab('Security') },
          { name: 'Replay / open editor', run: () => setDetailTab('Replay') },
          {
            name: 'Copy URL',
            run: () => copy((settings.maskSecrets ? redactRecord(record) : record).request.url),
          },
          { name: 'Copy cURL', run: copyCurl },
          {
            name: 'Copy everything',
            run: () =>
              copy(JSON.stringify(settings.maskSecrets ? redactRecord(record) : record, null, 2)),
          },
          { name: 'Save request', run: () => updateRecord({ isFavorite: true }) },
          { name: 'Add tags / notes', run: () => setDetailTab('Overview') },
          { name: 'Add to collection', run: () => setModal('collection') },
          { name: 'Pin / unpin', run: () => updateRecord({ isPinned: !record.isPinned }) },
          {
            name: 'Export',
            run: () => {
              setSelected(new Set([record.id]));
              setModal('export');
            },
          },
          { name: 'Compare replays', run: () => setDetailTab('Replay') },
          {
            name: 'Open URL in new tab',
            run: () =>
              task(async () => {
                if (!/^https?:/.test(record.request.url))
                  throw new Error('Only HTTP(S) URLs can be opened.');
                await chrome.tabs.create({ url: record.request.url });
              }),
          },
          {
            name: 'Delete request',
            run: () =>
              management.setConfirmation({
                title: 'Delete request?',
                description:
                  'This removes the request, its drafts, replay history and timed run reports. An active timed run for this request will stop.',
                action: async () => {
                  await deleteRecords([record.id]);
                  setRecordId(undefined);
                  await changed();
                },
              }),
          },
        ]
      : [];
  const contextActions = [
    ...(context?.filter
      ? [{ name: 'Add filter: ' + context.filter.label, run: () => addCellFilter(context.filter!) }]
      : []),
    ...recordActions,
  ];
  return {
    captureShortcut,
    search,
    setSearch,
    expression,
    setExpression,
    viewSession,
    setViewSession,
    view,
    setView,
    modal,
    setModal,
    selected,
    setSelected,
    record,
    setRecord,
    recordId,
    setRecordId,
    detailTab,
    setDetailTab,
    sort,
    setSort,
    columns,
    setColumns,
    group,
    setGroup,
    groupValue,
    setGroupValue,
    panelWidth,
    setPanelWidth,
    context,
    setContext,
    toast,
    operationError,
    setOperationError,
    searchInput,
    importInput,
    state,
    entities,
    rows,
    error,
    loading,
    refresh,
    settings,
    notify,
    task,
    changed,
    updateSettings,
    copy,
    management,
    select,
    visible,
    groups,
    summary,
    workspace,
    session,
    scopedEntities,
    capture,
    responseCapture,
    updateRecord,
    deleteSelection,
    saveDraft,
    clear,
    commands,
    contextActions,
    addCellFilter,
  };
}
export type InspectorController = ReturnType<typeof useInspectorController>;
