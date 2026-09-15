import type { Backup } from '../export/formats';
import { getDB } from './database';
import { splitRecord } from './repository';
/** Validate before calling; one transaction prevents partially imported workspaces on quota failure. */
export async function storeImport(backup: Backup) {
  const db = await getDB();
  const tx = db.transaction(['entities', 'requests', 'bodies'], 'readwrite');
  for (const entity of backup.entities) void tx.objectStore('entities').put(entity);
  for (const record of backup.requests) {
    const [row, body] = splitRecord(record);
    void tx.objectStore('requests').put(row);
    void tx.objectStore('bodies').put(body);
  }
  await tx.done;
}
