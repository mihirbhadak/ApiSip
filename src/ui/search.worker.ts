import { compileFilter, compileMetadataFilter, globalSearch, needsBody } from '../filters/engine';
import { parseFilter } from '../filters/parser';
import { getRecord, listRows, type Scope } from '../storage/repository';
let revision = 0;
self.onmessage = async (
  event: MessageEvent<{ revision: number; scope: Scope; search: string; expression: string }>,
) => {
  const message = event.data;
  revision = message.revision;
  try {
    const ast = parseFilter(message.expression),
      filter = compileFilter(ast),
      metadataFilter = compileMetadataFilter(ast),
      body = needsBody(ast);
    const rows = await listRows(message.scope),
      result = [];
    for (let i = 0; i < rows.length; i++) {
      if (revision !== message.revision) return;
      const row = rows[i]!;
      if (metadataFilter(row) === false) continue;
      const canHaveBody = row.request.body?.available || row.response?.body?.available;
      if (message.search || body) {
        const complete =
          !canHaveBody || (!body && globalSearch(row, message.search))
            ? row
            : await getRecord(row.id);
        if (!complete || !filter(complete) || !globalSearch(complete, message.search)) continue;
      }
      result.push(row);
      if (i % 200 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (revision === message.revision) self.postMessage({ revision, rows: result });
  } catch (error) {
    if (revision === message.revision)
      self.postMessage({
        revision,
        error: error instanceof Error ? error.message : 'Could not search local storage.',
      });
  }
};
