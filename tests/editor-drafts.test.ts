import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB, openDB } from 'idb';
import { fixture } from './fixtures';
import { editorRoute, editorUrl } from '../src/shared/editor';
import { defaultSettings } from '../src/shared/model';
import { closeDB, getDB } from '../src/storage/database';
import { createDraft, deleteDraft, getDraft, updateDraft } from '../src/storage/drafts';
import {
  clearDatabase,
  countRows,
  deleteEntity,
  deleteRecords,
  getRecord,
  prune,
  saveRecords,
  saveRequestCopy,
  splitRecord,
} from '../src/storage/repository';
import { EditorDraftWriter } from '../src/ui/editor-draft-writer';

describe('persistent editor drafts', () => {
  beforeEach(async () => {
    await clearDatabase();
    await saveRecords([fixture()]);
  });

  it('migrates version one without losing settings, requests or body data', async () => {
    await closeDB();
    await deleteDB('api-catcher');
    const legacy = await openDB('api-catcher', 1, {
      upgrade(db) {
        const requests = db.createObjectStore('requests', { keyPath: 'id' });
        for (const key of [
          'workspaceId',
          'sessionId',
          'timestamp',
          'tabId',
          'method',
          'status',
          'domain',
          'captureKey',
        ])
          requests.createIndex(key, key);
        db.createObjectStore('bodies', { keyPath: 'id' });
        const entities = db.createObjectStore('entities', { keyPath: 'id' });
        entities.createIndex('workspaceId', 'workspaceId');
        entities.createIndex('kind', 'kind');
        db.createObjectStore('state');
      },
    });
    const [row, body] = splitRecord(fixture());
    await legacy.put('requests', row);
    await legacy.put('bodies', body);
    await legacy.put('state', { ...defaultSettings, theme: 'dark' }, 'settings');
    legacy.close();
    const current = await getDB();
    expect(current.version).toBe(2);
    expect(current.objectStoreNames.contains('drafts')).toBe(true);
    expect((await getRecord('test-1'))?.request.body?.text).toBe(fixture().request.body?.text);
    expect((await current.get('state', 'settings'))?.theme).toBe('dark');
  });

  it('persists unfinished edits independently across database reopening', async () => {
    const draft = await createDraft('test-1', fixture().request, 'browser');
    const edited = {
      ...draft.request,
      url: 'https://',
      body: { ...draft.request.body!, text: '{' },
    };
    await updateDraft(draft.id, 0, edited, 'extension');
    await closeDB();
    expect(await getDraft(draft.id)).toMatchObject({
      request: edited,
      context: 'extension',
      revision: 1,
    });
    expect((await getRecord('test-1'))?.request).toEqual(fixture().request);
    expect(await countRows()).toBe(1);
  });

  it('rejects concurrent stale writes instead of overwriting another editor', async () => {
    const draft = await createDraft('test-1', fixture().request, 'auto');
    const attempts = await Promise.allSettled([
      updateDraft(draft.id, 0, { ...draft.request, url: 'https://example.com/first' }, 'browser'),
      updateDraft(
        draft.id,
        0,
        { ...draft.request, url: 'https://example.com/second' },
        'extension',
      ),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await getDraft(draft.id))?.revision).toBe(1);
  });

  it('protects drafts from automatic cleanup and removes them with explicitly deleted history', async () => {
    const draft = await createDraft('test-1', fixture().request, 'auto');
    await prune({ ...defaultSettings, retentionDays: 7 });
    expect(await getRecord('test-1')).toBeDefined();
    await deleteRecords(['test-1'], true);
    expect(await getDraft(draft.id)).toBeDefined();
    await deleteRecords(['test-1']);
    expect(await getDraft(draft.id)).toBeUndefined();
    await expect(updateDraft(draft.id, 0, draft.request, 'auto')).rejects.toThrow('deleted');
    expect(await getDraft(draft.id)).toBeUndefined();
  });

  it('clears related drafts with sessions, workspaces and all stored data', async () => {
    for (const scope of ['initial', 'default', 'all']) {
      await clearDatabase();
      await saveRecords([fixture()]);
      const draft = await createDraft('test-1', fixture().request, 'auto');
      if (scope === 'all') await clearDatabase();
      else await deleteEntity(scope);
      expect(await getDraft(draft.id)).toBeUndefined();
    }
  });

  it('discards edits without deleting the source and saves valid independent favorites', async () => {
    const draft = await createDraft('test-1', fixture().request, 'auto');
    await deleteDraft(draft.id);
    expect(await getRecord('test-1')).toBeDefined();
    const request = { ...draft.request, url: 'https://example.com/saved' };
    const saved = await saveRequestCopy('test-1', request);
    expect(await getRecord(saved.id)).toMatchObject({ isFavorite: true, request });
    expect(saved.response).toBeUndefined();
    expect(saved.replayHistory).toBeUndefined();
    await expect(saveRequestCopy('test-1', { ...request, url: 'invalid' })).rejects.toThrow(
      'valid request',
    );
    expect(await countRows()).toBe(2);
  });

  it('coalesces edits and flushes changes arriving during an in-flight save', async () => {
    const draft = await createDraft('test-1', fixture().request, 'auto');
    const status = vi.fn(),
      writer = new EditorDraftWriter(draft, status);
    writer.change({ ...draft.request, url: 'https://example.com/first' }, 'auto');
    writer.change({ ...draft.request, url: 'https://example.com/second' }, 'auto');
    const saving = writer.flush();
    writer.change({ ...draft.request, url: 'https://example.com/latest' }, 'extension');
    await Promise.all([saving, writer.flush()]);
    expect(await getDraft(draft.id)).toMatchObject({
      revision: 2,
      request: { url: 'https://example.com/latest' },
      context: 'extension',
    });
    expect(writer.dirty).toBe(false);
    expect(status).toHaveBeenLastCalledWith('Draft saved locally');
    writer.dispose();
  });

  it('surfaces stale writer errors and never recreates a deleted draft', async () => {
    const draft = await createDraft('test-1', fixture().request, 'auto');
    const status = vi.fn(),
      writer = new EditorDraftWriter(draft, status);
    await updateDraft(draft.id, 0, draft.request, 'browser');
    writer.change({ ...draft.request, url: 'https://example.com/stale' }, 'auto');
    await expect(writer.flush()).rejects.toThrow('another tab');
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('another tab'), true);
    await deleteDraft(draft.id);
    await expect(writer.flush()).rejects.toThrow();
    expect(await getDraft(draft.id)).toBeUndefined();
    await writer.stop();
    writer.dispose();
  });
});

it('opens editor routes under both installation paths with only an encoded draft ID', () => {
  for (const path of ['inspector.html', 'dist/inspector.html']) {
    const base = 'chrome-extension://example/' + path;
    const url = editorUrl(base + '?old=1#previous', 'draft / 1');
    expect(url).toBe(base + '#/editor/draft%20%2F%201');
    expect(editorRoute(new URL(url).hash)).toBe('draft / 1');
    expect(editorUrl(url)).toBe(base);
  }
  expect(editorRoute('#/editor/%ZZ')).toBe('');
  expect(editorRoute('#other')).toBeUndefined();
});
