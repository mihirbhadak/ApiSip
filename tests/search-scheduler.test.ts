import { compileMetadataFilter } from '../src/filters/engine';
import { parseFilter } from '../src/filters/parser';
import { fixture } from './fixtures';
import { describe, expect, it } from 'vitest';
import { SearchScheduler, type SearchJob } from '../src/ui/search-scheduler';
describe('live search scheduling', () => {
  it('delivers results during a continuous stream and coalesces refreshes', () => {
    const sent: SearchJob[] = [],
      visible: number[] = [];
    const scheduler = new SearchScheduler((job) => sent.push(job));
    const query = { scope: { sessionId: 'one' }, search: 'users', expression: '' };
    scheduler.request(query);
    for (let i = 0; i < 100; i++) scheduler.request(query);
    expect(sent).toHaveLength(1);
    scheduler.complete(sent[0]!.revision, () => visible.push(1000));
    expect(visible).toEqual([1000]);
    expect(sent).toHaveLength(2);
    scheduler.complete(sent[1]!.revision, () => visible.push(5000));
    expect(visible).toEqual([1000, 5000]);
    expect(sent).toHaveLength(2);
  });
  it('preempts an obsolete user query while rejecting its late result', () => {
    const sent: SearchJob[] = [],
      visible: string[] = [];
    const scheduler = new SearchScheduler((job) => sent.push(job));
    scheduler.request({ scope: { sessionId: 'one' }, search: 'users', expression: '' });
    scheduler.request({ scope: { sessionId: 'one' }, search: 'orders', expression: '' });
    scheduler.complete(sent[0]!.revision, () => visible.push('users'));
    scheduler.complete(sent[1]!.revision, () => visible.push('orders'));
    expect(visible).toEqual(['orders']);
  });
});
it('rejects metadata-impossible body scans and preserves AND/OR/NOT uncertainty', () => {
  const row = fixture();
  expect(
    compileMetadataFilter(parseFilter('method = GET AND responseBody contains "user"'))(row),
  ).toBe(false);
  expect(
    compileMetadataFilter(parseFilter('method = POST OR responseBody contains "user"'))(row),
  ).toBe(true);
  expect(
    compileMetadataFilter(parseFilter('method = POST AND responseBody contains "user"'))(row),
  ).toBeUndefined();
  expect(
    compileMetadataFilter(parseFilter('NOT (method = POST AND responseBody contains "user")'))(row),
  ).toBeUndefined();
});
