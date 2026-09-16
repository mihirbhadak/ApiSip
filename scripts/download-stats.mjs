import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = 'mihirbhadak/ApiSip';
export async function collectAssets(fetcher = fetch, token = process.env.GITHUB_TOKEN) {
  const assets = [];
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (let page = 1; page <= 20; page++) {
    const response = await fetcher(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      { headers, signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok)
      throw new Error(
        `GitHub download-count request failed (${response.status}); existing history was not changed.`,
      );
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error('Unexpected GitHub response');
    for (const release of releases) {
      if (release.draft) continue;
      for (const asset of release.assets ?? []) {
        if (!/^apisip-.*\.zip$/i.test(asset.name)) continue;
        if (
          !Number.isSafeInteger(asset.id) ||
          !Number.isSafeInteger(asset.download_count) ||
          asset.download_count < 0
        )
          throw new Error('Invalid asset counter');
        assets.push({
          id: asset.id,
          release: release.tag_name,
          name: asset.name,
          count: asset.download_count,
        });
      }
    }
    if (releases.length < 100) return assets.sort((a, b) => a.id - b.id);
  }
  throw new Error('Release pagination limit reached; no partial report was saved.');
}
export function recordSnapshot(history, assets, observedAt = new Date().toISOString()) {
  if (
    history &&
    (history.schemaVersion !== 1 ||
      history.repository !== repository ||
      !Array.isArray(history.snapshots))
  )
    throw new Error('Unsupported history file; refusing to overwrite.');
  const snapshots = [...(history?.snapshots ?? [])];
  const last = snapshots.at(-1);
  if (last && observedAt < last.observedAt)
    throw new Error('Snapshot time must not move backwards.');
  const snapshot = { observedAt, assets };
  // Preserve the first baseline, then keep at most one subsequent sample per UTC day.
  if (snapshots.length > 1 && last.observedAt.slice(0, 10) === observedAt.slice(0, 10))
    snapshots[snapshots.length - 1] = snapshot;
  else snapshots.push(snapshot);
  return {
    schemaVersion: 1,
    repository,
    metric:
      'GitHub release asset download_count; not unique people, completed installs or website click events',
    snapshots: snapshots.slice(-400),
  };
}
export function asCsv(history) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return (
    [
      'observed_at_utc,asset_id,release,asset,github_download_count',
      ...history.snapshots.flatMap((snapshot) =>
        snapshot.assets.map((asset) =>
          [snapshot.observedAt, asset.id, asset.release, asset.name, asset.count]
            .map(quote)
            .join(','),
        ),
      ),
    ].join('\n') + '\n'
  );
}
async function main() {
  const file = resolve('stats/downloads.json');
  let previous;
  try {
    previous = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const history = recordSnapshot(previous, await collectAssets());
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(history, null, 2) + '\n');
  await rename(temporary, file);
  await writeFile(resolve('stats/downloads.csv'), asCsv(history));
  const current = history.snapshots.at(-1);
  console.log(
    JSON.stringify(
      {
        observedAt: current.observedAt,
        assets: current.assets,
        total: current.assets.reduce((sum, asset) => sum + asset.count, 0),
      },
      null,
      2,
    ),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
