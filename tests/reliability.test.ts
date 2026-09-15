import { beforeEach, describe, expect, it } from 'vitest';
import { fixture } from './fixtures';
import { makeBody } from '../src/shared/parse';
import { redactRecord } from '../src/shared/security';
import { defaultExportOptions, exportRecords, importRecords } from '../src/export/formats';
import { generateCode } from '../src/export/generators';
import { storeImport } from '../src/storage/import';
import {
  captureUpdate,
  clearDatabase,
  countRows,
  deleteEntity,
  getRecord,
  interruptTab,
  listEntities,
  saveRecords,
} from '../src/storage/repository';
describe('fidelity and lifecycle regressions', () => {
  beforeEach(clearDatabase);
  it('masks structured response form fields as well as the body text', () => {
    const r = fixture();
    r.response!.body = makeBody(
      'password=private-form&name=normal',
      'application/x-www-form-urlencoded',
    );
    expect(JSON.stringify(redactRecord(r))).not.toContain('private-form');
  });
  it('preserves imported body truncation from both size limits and explicit HAR flags', () => {
    const r = fixture();
    r.response!.body = makeBody('x'.repeat(1048580), 'text/plain', 2000000);
    const imported = importRecords(
      exportRecords('HAR', [r], { ...defaultExportOptions, secrets: true }),
      'default',
      'initial',
    );
    expect(imported.requests[0]!.response!.body!.truncated).toBe(true);
    r.request.body!.truncated = true;
    const truncated = importRecords(exportRecords('HAR', [r]), 'default', 'initial');
    expect(truncated.requests[0]!.request.body!.truncated).toBe(true);
  });
  it('keeps decoded binary sizes accurate with base64 padding', () => {
    expect(makeBody('YQ==', '', 1024, true).bytes).toBe(1);
    expect(makeBody('YWI=', '', 1024, true).bytes).toBe(2);
  });
  it('rejects ambiguous CMD shell operators and escapes Rust control characters', () => {
    const r = fixture().request;
    r.headers = [{ name: 'X-Test', value: '" & echo unwanted &' }];
    expect(() => generateCode('Windows CMD cURL', r, true)).toThrow('cannot safely');
    r.headers = [];
    r.body = makeBody('a\b\f\u0001\\"', 'text/plain');
    const rust = generateCode('Rust reqwest', r, true);
    expect(rust).toContain('a\\u{8}\\u{c}\\u{1}');
    expect(rust).not.toContain('\\u0001');
  });
  it('omits stale content lengths after redaction', () => {
    const r = fixture().request;
    r.headers.push({ name: 'Content-Length', value: '500' });
    expect(generateCode('cURL', r)).not.toContain('Content-Length');
  });
  it('imports entities and their requests in a consistent transaction', async () => {
    const backup = importRecords(
      exportRecords('JSON', [fixture()], undefined, await listEntities()),
      'default',
      'initial',
    );
    await storeImport(backup);
    expect(await countRows()).toBe(1);
    const r = await getRecord(backup.requests[0]!.id);
    expect((await listEntities()).some((e) => e.id === r!.sessionId)).toBe(true);
    expect(r!.tabId).toBeUndefined();
  });
  it('does not resurrect a deleted session from a late capture start', async () => {
    await deleteEntity('initial');
    await captureUpdate('late-event', () => fixture());
    expect(await countRows()).toBe(0);
  });
  it('marks interrupted tab requests without changing completed traffic or bodies', async () => {
    await saveRecords([
      fixture(),
      fixture({
        id: 'pending',
        metadata: { provider: 'debugger', resourceType: 'Fetch', state: 'pending' },
      }),
    ]);
    await interruptTab(7, 'Tab closed');
    expect((await getRecord('pending'))!.metadata).toMatchObject({
      state: 'error',
      error: 'Tab closed',
    });
    expect((await getRecord('test-1'))!.metadata.state).toBe('complete');
    expect((await getRecord('pending'))!.request.body!.text).toContain('Mihir');
  });
});
