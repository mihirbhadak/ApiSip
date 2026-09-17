import { afterEach, expect, it, vi } from 'vitest';
import { newerVersion, parseRelease } from '../src/shared/updates';
import { UpdateChecker } from '../src/background/updates';
import { defaultSettings } from '../src/shared/model';

const release = {
  tag_name: 'v0.1.3',
  name: 'ApiSip 0.1.3',
  draft: false,
  prerelease: false,
  published_at: '2026-09-17T00:00:00Z',
  body: '- Fixed capture\n- Added shortcuts',
  assets: [
    {
      name: 'apisip-0.1.3.zip',
      browser_download_url:
        'https://github.com/mihirbhadak/ApiSip/releases/download/v0.1.3/apisip-0.1.3.zip',
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
function checker() {
  const storage: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async () => storage),
        set: vi.fn(async (value: Record<string, unknown>) => {
          Object.assign(storage, value);
        }),
      },
    },
  });
  const fetch = vi.fn(async () => new Response(JSON.stringify(release)));
  vi.stubGlobal('fetch', fetch);
  const settings = vi.fn(async () => defaultSettings);
  const changed = vi.fn();
  return { storage, fetch, settings, changed, checker: new UpdateChecker(settings, changed) };
}

it('compares numeric versions and rejects unsupported release formats', () => {
  expect(newerVersion('1.10.0', '1.9.0')).toBe(true);
  expect(newerVersion('1.2', '1.2.0.0')).toBe(false);
  expect(newerVersion('0.1.1', '0.1.2')).toBe(false);
  expect(newerVersion('1.2.3-beta', '1.0')).toBe(false);
  expect(() => parseRelease({ ...release, prerelease: true })).toThrow();
  expect(() => parseRelease({ ...release, tag_name: '../../other' })).toThrow();
  expect(
    parseRelease({
      ...release,
      assets: [{ ...release.assets[0], browser_download_url: 'https://evil.example/download' }],
    }).downloadUrl,
  ).toBeUndefined();
});

it('caches daily checks, coalesces concurrent work, and persists dismissal per version', async () => {
  const test = checker();
  await Promise.all([test.checker.check(), test.checker.check()]);
  expect(test.fetch).toHaveBeenCalledTimes(1);
  await test.checker.check();
  expect(test.fetch).toHaveBeenCalledTimes(1);
  await test.checker.dismiss('0.1.3');
  expect((await test.checker.status()).dismissedVersion).toBe('0.1.3');
  await test.checker.check(true);
  expect(test.fetch).toHaveBeenCalledTimes(2);
  expect((await test.checker.status()).dismissedVersion).toBe('0.1.3');
  expect(test.fetch).toHaveBeenCalledWith(
    'https://api.github.com/repos/mihirbhadak/ApiSip/releases/latest',
    expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }),
  );
});

it('respects disabled automatic checks and handles offline, oversized and malformed data', async () => {
  const test = checker();
  test.settings.mockResolvedValue({ ...defaultSettings, checkForUpdates: false });
  await test.checker.check();
  expect(test.fetch).not.toHaveBeenCalled();
  test.fetch.mockRejectedValueOnce(new Error('Offline'));
  expect((await test.checker.check(true)).error).toContain('offline');
  test.fetch.mockResolvedValueOnce(new Response('x'.repeat(131073)));
  expect((await test.checker.check(true)).latest).toBeUndefined();
  test.fetch.mockResolvedValueOnce(new Response('{bad json'));
  expect((await test.checker.check(true)).error).toContain('Could not check');
  const result = await test.checker.check(true);
  expect(result.latest?.version).toBe('0.1.3');
  expect(result.error).toBeUndefined();
});
