import { getDB, type BodyRow, type RequestRow } from './database';
import {
  defaultSettings,
  settingsSchema,
  uid,
  type Body,
  type CapturedRequest,
  type Entity,
  type Settings,
} from '../shared/model';
import { presets } from '../filters/parser';

const descriptor = (body?: Body): Body | undefined =>
  body && { ...body, text: undefined, fields: undefined };
export function splitRecord(record: CapturedRequest, captureKey?: string): [RequestRow, BodyRow] {
  const row: RequestRow = {
    ...record,
    domain: new URL(record.request.url).host,
    method: record.request.method,
    status: record.response?.status ?? 0,
    captureKey,
    request: { ...record.request, body: descriptor(record.request.body) },
    response: record.response && { ...record.response, body: descriptor(record.response.body) },
    replayHistory: undefined,
    metadata: { ...record.metadata, messages: undefined },
  };
  return [
    row,
    {
      id: record.id,
      request: record.request.body,
      response: record.response?.body,
      replays: record.replayHistory,
      messages: record.metadata.messages,
    },
  ];
}
export function joinRecord(row: RequestRow, body?: BodyRow): CapturedRequest {
  const { domain: _domain, method: _method, status: _status, captureKey: _key, ...record } = row;
  void _domain;
  void _method;
  void _status;
  void _key;
  return {
    ...record,
    request: { ...record.request, body: body?.request ?? record.request.body },
    response: record.response && {
      ...record.response,
      body: body?.response ?? record.response.body,
    },
    replayHistory: body?.replays,
    metadata: { ...record.metadata, messages: body?.messages },
  };
}
export async function initialize() {
  const db = await getDB();
  const tx = db.transaction(['state', 'entities'], 'readwrite');
  let settings = await tx.objectStore('state').get('settings');
  if (!settings) {
    settings = { ...defaultSettings };
    await tx.objectStore('state').put(settings, 'settings');
    const now = Date.now();
    await tx.objectStore('entities').put({
      id: 'default',
      kind: 'workspace',
      name: 'My workspace',
      workspaceId: 'default',
      createdAt: now,
      updatedAt: now,
    });
    await tx.objectStore('entities').put({
      id: 'initial',
      kind: 'session',
      name: 'First session',
      workspaceId: 'default',
      createdAt: now,
      updatedAt: now,
    });
    for (const preset of presets)
      await tx.objectStore('entities').put({
        id: uid(),
        kind: 'filter',
        workspaceId: 'default',
        createdAt: now,
        updatedAt: now,
        ...preset,
      });
  }
  await tx.done;
  return settingsSchema.parse(settings);
}
export async function getSettings() {
  return settingsSchema.parse((await (await getDB()).get('state', 'settings')) ?? defaultSettings);
}
export async function updateSettings(patch: Partial<Settings>) {
  const db = await getDB(),
    tx = db.transaction('state', 'readwrite');
  const state = settingsSchema.parse({
    ...((await tx.store.get('settings')) ?? defaultSettings),
    ...patch,
  });
  await tx.store.put(state, 'settings');
  await tx.done;
  return state;
}
export async function saveRecords(records: CapturedRequest[]) {
  const db = await getDB();
  for (let start = 0; start < records.length; start += 200) {
    const tx = db.transaction(['requests', 'bodies'], 'readwrite');
    for (const record of records.slice(start, start + 200)) {
      const [row, body] = splitRecord(record);
      void tx.objectStore('requests').put(row);
      void tx.objectStore('bodies').put(body);
    }
    await tx.done;
  }
}
export async function getRecord(id: string) {
  const db = await getDB(),
    tx = db.transaction(['requests', 'bodies']);
  const [row, body] = await Promise.all([
    tx.objectStore('requests').get(id),
    tx.objectStore('bodies').get(id),
  ]);
  return row && joinRecord(row, body);
}
export async function mutateRecord(
  id: string,
  change: (record: CapturedRequest) => CapturedRequest,
) {
  const db = await getDB(),
    tx = db.transaction(['requests', 'bodies'], 'readwrite');
  const row = await tx.objectStore('requests').get(id);
  if (row) {
    const next = change(joinRecord(row, await tx.objectStore('bodies').get(id)));
    const [summary, body] = splitRecord(next, row.captureKey);
    await tx.objectStore('requests').put(summary);
    await tx.objectStore('bodies').put(body);
  }
  await tx.done;
}
export type CaptureMutation = {
  key: string;
  change: (record?: CapturedRequest) => CapturedRequest | undefined;
};
/** Read independent keys concurrently; apply mutations in order and commit final values atomically. */
export async function captureBatch(changes: CaptureMutation[]) {
  const db = await getDB();
  const tx = db.transaction(['requests', 'bodies', 'entities'], 'readwrite');
  try {
    const requests = tx.objectStore('requests'),
      bodies = tx.objectStore('bodies'),
      entities = tx.objectStore('entities');
    const keys = [...new Set(changes.map(({ key }) => key))];
    const current = new Map<string, CapturedRequest | undefined>(
      await Promise.all(
        keys.map(async (key) => {
          const row = await requests.index('captureKey').get(key);
          return [key, row && joinRecord(row, await bodies.get(row.id))] as const;
        }),
      ),
    );
    const pending = new Map<string, [RequestRow, BodyRow]>();
    const sessions = new Map<string, Entity | undefined>();
    const updatedSessions = new Map<string, Entity>();
    const results: (CapturedRequest | undefined)[] = [];
    for (const { key, change } of changes) {
      const old = current.get(key),
        next = change(old);
      if (!next) {
        results.push(undefined);
        continue;
      }
      if (!old) {
        if (!sessions.has(next.sessionId))
          sessions.set(next.sessionId, await entities.get(next.sessionId));
        const session = sessions.get(next.sessionId);
        if (!session) {
          results.push(undefined);
          continue;
        }
        const updated = {
          ...session,
          updatedAt: Date.now(),
          tabIds: [
            ...new Set([
              ...(session.tabIds ?? []),
              ...(next.tabId === undefined ? [] : [next.tabId]),
            ]),
          ],
        };
        sessions.set(next.sessionId, updated);
        updatedSessions.set(next.sessionId, updated);
      }
      if (old && old.id !== next.id) pending.set(old.id, splitRecord(old));
      pending.set(next.id, splitRecord(next, key));
      current.set(key, next);
      results.push(next);
    }
    await Promise.all([
      ...[...pending.values()].flatMap(([row, body]) => [requests.put(row), bodies.put(body)]),
      ...[...updatedSessions.values()].map((session) => entities.put(session)),
    ]);
    await tx.done;
    return results;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* already aborted */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
export async function captureUpdate(key: string, change: CaptureMutation['change']) {
  return (await captureBatch([{ key, change }]))[0];
}
export async function interruptTab(tabId: number, reason: string, provider?: 'debugger') {
  const db = await getDB();
  const tx = db.transaction('requests', 'readwrite');
  const rows = await tx.store.index('tabId').getAll(tabId);
  for (const row of rows) {
    if (row.metadata.state === 'pending' && (!provider || row.metadata.provider === provider))
      void tx.store.put({ ...row, metadata: { ...row.metadata, state: 'error', error: reason } });
  }
  await tx.done;
}
export type Scope = { workspaceId?: string; sessionId?: string; tabId?: number };
export async function listRows(scope: Scope = {}): Promise<RequestRow[]> {
  const db = await getDB();
  if (scope.sessionId) return db.getAllFromIndex('requests', 'sessionId', scope.sessionId);
  if (scope.workspaceId) return db.getAllFromIndex('requests', 'workspaceId', scope.workspaceId);
  if (scope.tabId !== undefined) return db.getAllFromIndex('requests', 'tabId', scope.tabId);
  return db.getAll('requests');
}
export async function countRows(scope: Scope = {}) {
  const db = await getDB();
  if (scope.sessionId) return db.countFromIndex('requests', 'sessionId', scope.sessionId);
  if (scope.workspaceId) return db.countFromIndex('requests', 'workspaceId', scope.workspaceId);
  if (scope.tabId !== undefined) return db.countFromIndex('requests', 'tabId', scope.tabId);
  return db.count('requests');
}
export async function deleteRecords(ids: string[]) {
  const db = await getDB(),
    tx = db.transaction(['requests', 'bodies'], 'readwrite');
  for (const id of ids) {
    void tx.objectStore('requests').delete(id);
    void tx.objectStore('bodies').delete(id);
  }
  await tx.done;
}
export async function listEntities() {
  return (await getDB()).getAll('entities');
}
export async function saveEntity(entity: Entity) {
  await (await getDB()).put('entities', entity);
}
export async function deleteEntity(id: string) {
  const db = await getDB(),
    entity = await db.get('entities', id);
  if (!entity) return;
  const tx = db.transaction(['entities', 'requests', 'bodies'], 'readwrite');
  let rows: RequestRow[] = [];
  if (entity.kind === 'workspace') {
    rows = await tx.objectStore('requests').index('workspaceId').getAll(id);
    const children = await tx.objectStore('entities').index('workspaceId').getAll(id);
    for (const child of children) void tx.objectStore('entities').delete(child.id);
  } else if (entity.kind === 'session')
    rows = await tx.objectStore('requests').index('sessionId').getAll(id);
  else if (entity.kind === 'collection') {
    const all = await tx.objectStore('requests').index('workspaceId').getAll(entity.workspaceId);
    for (const row of all.filter((r) => r.collectionId === id))
      void tx.objectStore('requests').put({ ...row, collectionId: undefined });
  }
  for (const row of rows) {
    void tx.objectStore('requests').delete(row.id);
    void tx.objectStore('bodies').delete(row.id);
  }
  void tx.objectStore('entities').delete(id);
  await tx.done;
}
export async function prune(settings: Settings) {
  const rows = (await listRows()).sort((a, b) => a.timestamp - b.timestamp);
  const cutoff = settings.retentionDays ? Date.now() - settings.retentionDays * 86400000 : 0;
  const candidates = rows.filter(
    (r) => !r.isFavorite && !r.isPinned && !r.collectionId && r.metadata.state !== 'pending',
  );
  const ids = new Set(candidates.filter((r) => r.timestamp < cutoff).map((r) => r.id));
  let over = rows.length - ids.size - settings.maxRequests;
  let estimated = rows.reduce(
    (n, r) => n + (r.request.body?.bytes ?? 0) + (r.response?.body?.bytes ?? 0) + 1500,
    0,
  );
  for (const row of candidates) {
    if (ids.has(row.id)) {
      estimated -= (row.request.body?.bytes ?? 0) + (row.response?.body?.bytes ?? 0) + 1500;
      continue;
    }
    if (over <= 0 && estimated <= settings.maxStorageMB * 1048576) break;
    ids.add(row.id);
    over--;
    estimated -= (row.request.body?.bytes ?? 0) + (row.response?.body?.bytes ?? 0) + 1500;
  }
  await deleteRecords([...ids]);
  return ids.size;
}
export async function clearDatabase() {
  const db = await getDB(),
    tx = db.transaction(['requests', 'bodies', 'entities', 'state'], 'readwrite');
  for (const store of ['requests', 'bodies', 'entities', 'state'] as const)
    void tx.objectStore(store).clear();
  await tx.done;
  return initialize();
}
