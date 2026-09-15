import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Body, CapturedRequest, Entity, ReplayResult, Settings } from '../shared/model';
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
}
let database: Promise<IDBPDatabase<InspectorDB>> | undefined;
export function getDB() {
  database ??= openDB<InspectorDB>('api-catcher', 1, {
    upgrade(db) {
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
