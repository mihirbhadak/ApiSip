import { storeImport } from '../storage/import';
import { useState } from 'react';
import {
  uid,
  type CapturedRequest,
  type Entity,
  type EntityKind,
  type Settings,
} from '../shared/model';
import {
  clearDatabasePreservingCapture,
  deleteEntity,
  deleteRecords,
  getRecord,
  listEntities,
  listRows,
  saveEntity,
} from '../storage/repository';
import { exportRecords, importRecords } from '../export/formats';
export type Naming = { title: string; initial?: string; save: (name: string) => Promise<void> };
export type Confirmation = { title: string; description: string; action: () => Promise<void> };
export function useManagement({
  settings,
  entities,
  updateSettings,
  changed,
  reset,
  notify,
}: {
  settings: Settings;
  entities: Entity[];
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  changed: () => Promise<void>;
  reset: () => void;
  notify: (message: string) => void;
}) {
  const [naming, setNaming] = useState<Naming>(),
    [confirmation, setConfirmation] = useState<Confirmation>();
  async function newSession(workspaceId: string, name = 'Session 1') {
    const id = uid();
    await saveEntity({
      id,
      kind: 'session',
      name,
      workspaceId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  }
  const create = (kind: EntityKind) =>
    setNaming({
      title: 'New ' + kind,
      save: async (name) => {
        const id = uid(),
          now = Date.now();
        await saveEntity({
          id,
          name,
          kind,
          workspaceId: kind === 'workspace' ? id : settings.workspaceId,
          createdAt: now,
          updatedAt: now,
        });
        if (kind === 'workspace') {
          const sessionId = await newSession(id);
          await updateSettings({ workspaceId: id, sessionId });
          reset();
        }
        if (kind === 'session') {
          await updateSettings({ sessionId: id });
          reset();
        }
        await changed();
        notify(kind[0]!.toUpperCase() + kind.slice(1) + ' created');
      },
    });
  const rename = (entity: Entity) =>
    setNaming({
      title: 'Rename ' + entity.kind,
      initial: entity.name,
      save: async (name) => {
        await saveEntity({ ...entity, name, updatedAt: Date.now() });
        await changed();
      },
    });
  const switchWorkspace = async (id: string) => {
    const sessionId =
      entities.find((e) => e.kind === 'session' && e.workspaceId === id && !e.archived)?.id ??
      (await newSession(id));
    await updateSettings({ workspaceId: id, sessionId });
    reset();
  };
  const remove = (entity: Entity) =>
    setConfirmation({
      title: 'Delete ' + entity.kind + ' “' + entity.name + '”?',
      description:
        entity.kind === 'collection'
          ? 'The collection will be removed. Requests remain in history.'
          : 'Contained requests, bodies, editor drafts and timed run reports will be permanently removed.',
      action: async () => {
        if (entity.kind === 'workspace' && entity.id === settings.workspaceId) {
          const remaining = await listEntities();
          const workspaceId =
            remaining.find((e) => e.kind === 'workspace' && e.id !== entity.id)?.id ?? uid();
          if (!remaining.some((e) => e.id === workspaceId))
            await saveEntity({
              id: workspaceId,
              kind: 'workspace',
              name: 'My workspace',
              workspaceId,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          await updateSettings({
            workspaceId,
            sessionId:
              remaining.find(
                (e) => e.kind === 'session' && e.workspaceId === workspaceId && !e.archived,
              )?.id ?? (await newSession(workspaceId)),
          });
        } else if (entity.kind === 'session' && entity.id === settings.sessionId)
          await updateSettings({
            sessionId: await newSession(settings.workspaceId, 'New session'),
          });
        // Switch capture to its replacement destination before removing the old one.
        await deleteEntity(entity.id);
        reset();
        await changed();
        notify('Deleted ' + entity.kind);
      },
    });
  const archive = async (entity: Entity) => {
    await saveEntity({
      ...entity,
      archived: !entity.archived,
      endTime: entity.archived ? undefined : Date.now(),
    });
    if (entity.id === settings.sessionId && !entity.archived)
      await updateSettings({ recording: false });
    await changed();
  };
  const duplicate = async (entity: Entity) => {
    const rows = await listRows({ workspaceId: entity.id });
    const bytes = rows.reduce(
      (n, r) => n + (r.request.body?.bytes ?? 0) + (r.response?.body?.bytes ?? 0) + 2048,
      0,
    );
    if (bytes > 100 * 1048576)
      throw new Error(
        'This workspace is too large to duplicate at once. Export a smaller selection.',
      );
    const records: CapturedRequest[] = [];
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = await Promise.all(rows.slice(i, i + 50).map((r) => getRecord(r.id)));
      records.push(...chunk.filter((r): r is CapturedRequest => !!r));
    }
    const backup = importRecords(
      exportRecords(
        'JSON',
        records,
        {
          requestHeaders: true,
          requestBody: true,
          responseHeaders: true,
          responseBody: true,
          cookies: true,
          timing: true,
          metadata: true,
          secrets: true,
        },
        entities.filter((e) => e.workspaceId === entity.id),
      ),
      settings.workspaceId,
      settings.sessionId,
    );
    await storeImport({
      ...backup,
      entities: backup.entities.map((e) =>
        e.kind === 'workspace' ? { ...e, name: e.name + ' copy' } : e,
      ),
    });
    await changed();
    notify('Workspace duplicated');
  };
  const clear = (scope: string) =>
    setConfirmation({
      title: 'Clear ' + scope.toLowerCase() + '?',
      description:
        'This permanently deletes captured history, including saved requests and related editor drafts and timed run reports in that scope. Export a backup first if needed.',
      action: async () => {
        if (scope === 'All stored data') {
          await clearDatabasePreservingCapture();
          localStorage.removeItem('columns');
        } else {
          const rows = await listRows(
            scope === 'Current session'
              ? { sessionId: settings.sessionId }
              : scope === 'Current workspace'
                ? { workspaceId: settings.workspaceId }
                : {},
          );
          await deleteRecords(rows.map((r) => r.id));
        }
        reset();
        await changed();
        notify('History cleared');
      },
    });
  return {
    naming,
    setNaming,
    confirmation,
    setConfirmation,
    create,
    rename,
    switchWorkspace,
    remove,
    archive,
    duplicate,
    clear,
  };
}
export type Management = ReturnType<typeof useManagement>;
