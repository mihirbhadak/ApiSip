import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectAssets, recordSnapshot, asCsv } from '../../scripts/download-stats.mjs';

test('collects only extension ZIPs and never accepts failed or malformed counters', async () => {
  const assets = await collectAssets(
    async () =>
      new Response(
        JSON.stringify([
          {
            tag_name: 'v1',
            assets: [
              { id: 2, name: 'apisip-1.zip', download_count: 5 },
              { id: 3, name: 'apisip-1.sha256', download_count: 9 },
            ],
          },
          { draft: true, assets: [{ id: 4, name: 'apisip-draft.zip', download_count: 99 }] },
        ]),
      ),
    undefined,
  );
  assert.deepEqual(assets, [{ id: 2, release: 'v1', name: 'apisip-1.zip', count: 5 }]);
  await assert.rejects(
    collectAssets(async () => new Response('', { status: 403 }), undefined),
    /failed \(403\)/,
  );
  await assert.rejects(
    collectAssets(
      async () =>
        new Response(
          JSON.stringify([{ assets: [{ id: 2, name: 'apisip-1.zip', download_count: -1 }] }]),
        ),
      undefined,
    ),
    /Invalid asset counter/,
  );
});
test('follows release pagination instead of silently dropping older releases', async () => {
  let calls = 0;
  const assets = await collectAssets(async (url) => {
    calls++;
    const releases = url.endsWith('page=1')
      ? Array.from({ length: 100 }, () => ({ assets: [] }))
      : [{ tag_name: 'v0', assets: [{ id: 7, name: 'apisip-0.zip', download_count: 1 }] }];
    return new Response(JSON.stringify(releases));
  }, undefined);
  assert.equal(calls, 2);
  assert.equal(assets[0].id, 7);
});
test('preserves the initial baseline, bounds history and rejects incompatible data', () => {
  const assets = [{ id: 2, release: 'v1', name: 'apisip-1.zip', count: 5 }];
  let history = recordSnapshot(undefined, assets, '2026-09-16T00:00:00.000Z');
  history = recordSnapshot(history, assets, '2026-09-16T01:00:00.000Z');
  history = recordSnapshot(history, assets, '2026-09-16T02:00:00.000Z');
  assert.equal(history.snapshots.length, 2);
  assert.equal(history.snapshots[0].observedAt, '2026-09-16T00:00:00.000Z');
  assert.equal(history.snapshots[1].observedAt, '2026-09-16T02:00:00.000Z');
  assert.throws(() => recordSnapshot({ ...history, schemaVersion: 9 }, assets), /Unsupported/);
  assert.throws(() => recordSnapshot(history, assets, '2020-01-01T00:00:00.000Z'), /backwards/);
  const csv = asCsv(recordSnapshot(undefined, [{ ...assets[0], release: 'v1,"test"' }]));
  assert.ok(csv.includes('"v1,""test"""'));
  const oversized = {
    ...history,
    snapshots: Array.from({ length: 410 }, () => history.snapshots[0]),
  };
  assert.equal(recordSnapshot(oversized, assets).snapshots.length, 400);
});
