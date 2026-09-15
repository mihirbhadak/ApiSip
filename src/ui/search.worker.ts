import { compileFilter, globalSearch, needsBody } from '../filters/engine';
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
      body = needsBody(ast);
    const rows = await listRows(message.scope),
      result = [];
    for (let i = 0; i < rows.length; i++) {
      if (revision !== message.revision) return;
      const row = rows[i]!;
      if (!body && !filter(row)) continue;
      if (message.search || body) {
        const complete = !body && globalSearch(row, message.search) ? row : await getRecord(row.id);
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
