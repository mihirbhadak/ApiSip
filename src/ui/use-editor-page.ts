import { useEffect, useRef, useState } from 'react';
import {
  defaultSettings,
  type CapturedRequest,
  type RequestData,
  type Settings,
  type ReplayCookies,
} from '../shared/model';
import type { EditorDraft } from '../shared/editor';
import { sendCommand } from '../shared/messages';
import { getDB } from '../storage/database';
import { deleteDraft, getDraft } from '../storage/drafts';
import { getRecord, getSettings, saveRequestCopy } from '../storage/repository';
import { EditorDraftWriter } from './editor-draft-writer';
import { useTheme } from './use-theme';

export function useEditorPage(id: string) {
  const [draft, setDraft] = useState<EditorDraft>();
  const [record, setRecord] = useState<CapturedRequest>();
  const [settings, setSettings] = useState(defaultSettings);
  const [fatal, setFatal] = useState(''),
    [error, setError] = useState('');
  const [status, setStatus] = useState('Loading draft...'),
    [saveError, setSaveError] = useState(false);
  const [toast, setToast] = useState('');
  const writer = useRef<EditorDraftWriter | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useTheme(settings.theme);

  useEffect(() => {
    let alive = true,
      sourceId: string | undefined;
    const refreshRecord = async () => {
      if (!sourceId) return;
      const next = await getRecord(sourceId);
      if (!alive) return;
      if (next) setRecord(next);
      else setFatal('The source request was deleted. Its editor drafts are no longer available.');
    };
    const checkState = async () => {
      if (!sourceId) return;
      const db = await getDB();
      const [exists, sourceExists, nextSettings] = await Promise.all([
        db.count('drafts', id),
        db.count('requests', sourceId),
        getSettings(),
      ]);
      if (!alive) return;
      if (!exists || !sourceExists)
        setFatal('This draft or its source was deleted. Select another request in the inspector.');
      setSettings(nextSettings);
    };
    const report = (cause: unknown) => {
      if (alive)
        setError(cause instanceof Error ? cause.message : 'Could not refresh this editor.');
    };
    void (async () => {
      const [state, saved] = await Promise.all([sendCommand({ type: 'state' }), getDraft(id)]);
      if (!saved)
        throw new Error(
          'Draft not found. It may have been discarded or removed with its request history.',
        );
      const original = await getRecord(saved.sourceId);
      if (!original)
        throw new Error('The source request was deleted. Open another request in the inspector.');
      if (!alive) return;
      sourceId = saved.sourceId;
      setSettings(state.settings);
      setRecord(original);
      setDraft(saved);
      writer.current = new EditorDraftWriter(saved, (message, failed = false) => {
        if (alive) {
          setStatus(message);
          setSaveError(failed);
        }
      });
      setStatus('Draft saved locally');
    })().catch((cause: unknown) => {
      if (alive) setFatal(cause instanceof Error ? cause.message : 'Could not load this editor.');
    });
    const message = (value: { type?: string; id?: string }) => {
      if (value.type === 'database-changed') void checkState().catch(report);
      if (value.type === 'replay-complete' && value.id === sourceId)
        void refreshRecord().catch(report);
    };
    const focus = () => {
      void Promise.all([checkState(), refreshRecord()]).catch(report);
    };
    const unloading = (event: BeforeUnloadEvent) => {
      if (writer.current?.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    globalThis.chrome?.runtime?.onMessage?.addListener(message);
    window.addEventListener('focus', focus);
    window.addEventListener('beforeunload', unloading);
    return () => {
      alive = false;
      writer.current?.dispose();
      writer.current = undefined;
      clearTimeout(toastTimer.current);
      globalThis.chrome?.runtime?.onMessage?.removeListener(message);
      window.removeEventListener('focus', focus);
      window.removeEventListener('beforeunload', unloading);
    };
  }, [id]);
  const notify = (message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  };
  const task = (action: () => Promise<void>) => {
    setError('');
    void action().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : 'The operation failed.'),
    );
  };
  const flush = async () => {
    if (!writer.current) throw new Error('The editor is still loading.');
    await writer.current.flush();
  };
  const send = async (
    request: RequestData,
    context: Settings['replayContext'],
    cookies?: ReplayCookies,
  ) => {
    await flush();
    if (!record) throw new Error('The source request is unavailable.');
    const result = await sendCommand({ type: 'replay', id: record.id, request, context, cookies });
    const updated = await getRecord(record.id);
    if (updated) setRecord(updated);
    return result;
  };
  const save = async (request: RequestData) => {
    await flush();
    if (!record) throw new Error('The source request is unavailable.');
    await saveRequestCopy(record.id, request);
    await sendCommand({ type: 'changed' });
    notify('Request saved to Saved APIs');
  };
  const discard = async () => {
    await writer.current?.stop();
    await deleteDraft(id);
    setFatal(
      'Draft discarded. The original request and replay history are still in the inspector.',
    );
  };
  return {
    draft,
    record,
    settings,
    fatal,
    error,
    status,
    saveError,
    toast,
    task,
    send,
    save,
    discard,
    prepareRun: async () => {
      await flush();
      const current = await getDraft(id);
      if (!current) throw new Error('This draft was deleted.');
      return current.request;
    },
    change: (request: RequestData, context: Settings['replayContext'], cookies?: ReplayCookies) => {
      setDraft((previous) => previous && { ...previous, request, context, cookies });
      writer.current?.change(request, context, cookies);
    },
    copy: (text: string) =>
      task(async () => {
        await navigator.clipboard.writeText(text);
        notify('Copied to clipboard');
      }),
  };
}
