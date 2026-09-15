import { makeBody, parseUrl } from '../src/shared/parse';
import type { CapturedRequest } from '../src/shared/model';
export const fixture = (patch: Partial<CapturedRequest> = {}): CapturedRequest => ({
  id: 'test-1',
  timestamp: 1700000000000,
  tabId: 7,
  workspaceId: 'default',
  sessionId: 'initial',
  request: {
    method: 'POST',
    url: 'https://example.com:8443/api/users/123?page=1&name=a%20b&name=c#part',
    headers: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Authorization', value: 'Bearer top-secret' },
      { name: 'X-Test', value: 'one' },
      { name: 'X-Test', value: 'two' },
    ],
    query: parseUrl('https://example.com?page=1&name=a%20b&name=c').query,
    body: makeBody(
      '{"name":"Mihir","password":"secret","nested":{"token":"private"}}',
      'application/json',
    ),
  },
  response: {
    status: 201,
    statusText: 'Created',
    headers: [{ name: 'Content-Type', value: 'application/json' }],
    contentType: 'application/json',
    body: makeBody('{"id":123,"name":"Mihir"}', 'application/json'),
    size: 500,
  },
  timing: { total: 120, dns: 3 },
  metadata: { provider: 'debugger', resourceType: 'Fetch', state: 'complete' },
  tags: ['auth'],
  notes: 'A note',
  isFavorite: false,
  isPinned: false,
  ...patch,
});
