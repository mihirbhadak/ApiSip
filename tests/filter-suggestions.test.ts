import { expect, it } from 'vitest';
import { compileFilter } from '../src/filters/engine';
import { parseFilter } from '../src/filters/parser';
import { buildFilterSuggestions } from '../src/filters/suggestions';
import { fixture } from './fixtures';

it.each(['xhr', 'XHR', 'XMLHttpRequest', 'xmlhttprequest'])(
  'matches %s across passive and debugger history',
  (value) => {
    for (const stored of ['XHR', 'xhr', 'xmlhttprequest', 'XMLHttpRequest']) {
      const record = fixture({
        metadata: { provider: 'import', resourceType: stored, state: 'complete' },
      });
      expect(compileFilter(parseFilter(`resourceType = "${value}"`))(record)).toBe(true);
      expect(compileFilter(parseFilter(`resourceType != "${value}"`))(record)).toBe(false);
    }
    expect(
      compileFilter(parseFilter(`resourceType = "${value}"`))(
        fixture({ metadata: { provider: 'debugger', resourceType: 'fetch', state: 'complete' } }),
      ),
    ).toBe(false);
  },
);

it('provides common choices and observed named values without exposing secrets', () => {
  const record = fixture();
  record.request.url = 'https://api.example.test/api/widgets?token=hidden';
  record.request.headers = [
    { name: 'Authorization', value: 'Bearer hidden' },
    { name: 'X-Region', value: 'eu-west' },
  ];
  record.request.query = [
    { name: 'password', value: 'hidden-password' },
    { name: 'page', value: '2' },
  ];
  record.metadata.resourceType = 'xmlhttprequest';
  const suggestions = buildFilterSuggestions([record]);
  expect(suggestions.values.get('resourceType')).toContain('xhr');
  expect(suggestions.values.get('method')).toContain('PATCH');
  expect(suggestions.values.get('domain')).toContain('api.example.test');
  expect(suggestions.fields).toContain('requestHeader.X-Region');
  expect(suggestions.values.get('requestHeader.X-Region')).toEqual(['eu-west']);
  expect(suggestions.values.get('queryParam.page')).toEqual(['2']);
  expect(suggestions.values.get('requestHeader.Authorization')).toBeUndefined();
  expect(suggestions.values.get('queryParam.password')).toBeUndefined();
  expect(JSON.stringify([...suggestions.values])).not.toContain('hidden');
});

it('bounds suggestions independently of the request count', () => {
  const suggestions = buildFilterSuggestions(
    Array.from({ length: 10000 }, (_, i) => fixture({ id: String(i), tags: [`tag-${i}`] })),
  );
  expect(suggestions.values.get('tag')).toHaveLength(40);
  expect(suggestions.fields.length).toBeLessThanOrEqual(200);
});
