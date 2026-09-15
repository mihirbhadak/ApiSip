import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Body, CapturedRequest, Entity, ReplayResult, Settings } from '../shared/model';
import type { EditorDraft } from '../shared/editor';
import type { RunReport } from '../runner/model';
export type RequestRow = CapturedRequest & {
  domain: string;
  method: string;
  status: number;
  captureKey?: string;
};
export type BodyRow = {
  id: string;
  request?: Body;
  response?: Body;
  replays?: ReplayResult[];
  messages?: CapturedRequest['metadata']['messages'];
};
export interface InspectorDB extends DBSchema {
  requests: {
    key: string;
    value: RequestRow;
    indexes: {
      workspaceId: string;
      sessionId: string;
      timestamp: number;
      tabId: number;
      method: string;
      status: number;
      domain: string;
      captureKey: string;
    };
  };
  bodies: { key: string; value: BodyRow };
  entities: { key: string; value: Entity; indexes: { workspaceId: string; kind: string } };
  state: { key: string; value: Settings };
  drafts: { key: string; value: EditorDraft; indexes: { sourceId: string } };
  runs: {
    key: string;
    value: RunReport;
    indexes: { sourceId: string; createdAt: number; state: string };
  };
}
let database: Promise<IDBPDatabase<InspectorDB>> | undefined;
export function getDB() {
  database ??= openDB<InspectorDB>('api-catcher', 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const requests = db.createObjectStore('requests', { keyPath: 'id' });
        for (const index of [
          'workspaceId',
          'sessionId',
          'timestamp',
          'tabId',
          'method',
          'status',
          'domain',
          'captureKey',
        ] as const)
          requests.createIndex(index, index);
        db.createObjectStore('bodies', { keyPath: 'id' });
        const entities = db.createObjectStore('entities', { keyPath: 'id' });
        entities.createIndex('workspaceId', 'workspaceId');
        entities.createIndex('kind', 'kind');
        db.createObjectStore('state');
      }
      if (oldVersion < 2) {
        const drafts = db.createObjectStore('drafts', { keyPath: 'id' });
        drafts.createIndex('sourceId', 'sourceId');
      }
      if (oldVersion < 3) {
        const runs = db.createObjectStore('runs', { keyPath: 'id' });
        runs.createIndex('sourceId', 'sourceId');
        runs.createIndex('createdAt', 'createdAt');
        runs.createIndex('state', 'state');
      }
    },
    blocking() {
      void database?.then((db) => db.close());
      database = undefined;
    },
    terminated() {
      database = undefined;
    },
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}
export async function closeDB() {
  (await database)?.close();
  database = undefined;
}
