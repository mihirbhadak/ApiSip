import type { IDBPObjectStore, StoreNames } from 'idb';
import { uid, type RequestData, type Settings, type ReplayCookies } from '../shared/model';
import type { EditorDraft } from '../shared/editor';
import { getDB, type InspectorDB } from './database';

export async function createDraft(
  sourceId: string,
  request: RequestData,
  context: Settings['replayContext'],
  cookies?: ReplayCookies,
) {
  const db = await getDB(),
    tx = db.transaction(['requests', 'drafts'], 'readwrite');
  if (!(await tx.objectStore('requests').count(sourceId))) {
    await tx.done;
    throw new Error('The source request was deleted. Select another request to edit.');
  }
  const draft: EditorDraft = {
    id: uid(),
    sourceId,
    request,
    context,
    cookies,
    revision: 0,
    updatedAt: Date.now(),
  };
  await tx.objectStore('drafts').add(draft);
  await tx.done;
  return draft;
}
export async function getDraft(id: string) {
  return (await getDB()).get('drafts', id);
}
export async function updateDraft(
  id: string,
  revision: number,
  request: RequestData,
  context: Settings['replayContext'],
  cookies?: ReplayCookies,
) {
  const db = await getDB(),
    tx = db.transaction(['requests', 'drafts'], 'readwrite');
  const current = await tx.objectStore('drafts').get(id);
  const sourceExists = current && (await tx.objectStore('requests').count(current.sourceId));
  if (!current || !sourceExists || current.revision !== revision) {
    await tx.done;
    throw new Error(
      !current || !sourceExists
        ? 'This draft or its source was deleted. Return to the inspector to select another request.'
        : 'This draft changed in another tab. Reload the draft before editing further.',
    );
  }
  const next: EditorDraft = {
    ...current,
    request,
    context,
    cookies,
    revision: revision + 1,
    updatedAt: Date.now(),
  };
  await tx.objectStore('drafts').put(next);
  await tx.done;
  return next;
}
export async function deleteDraft(id: string) {
  await (await getDB()).delete('drafts', id);
}
export async function removeRelatedDrafts<Names extends StoreNames<InspectorDB>[]>(
  store: IDBPObjectStore<InspectorDB, Names, 'drafts', 'readwrite'>,
  sourceIds: Set<string>,
) {
  let cursor = await store.index('sourceId').openKeyCursor();
  while (cursor) {
    if (sourceIds.has(cursor.key)) await store.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
}
export async function draftSourceIds() {
  const result = new Set<string>();
  let cursor = await (await getDB()).transaction('drafts').store.index('sourceId').openKeyCursor();
  while (cursor) {
    result.add(cursor.key);
    cursor = await cursor.continue();
  }
  return result;
}
