import { z } from 'zod';

const versionPattern = /^\d{1,5}(?:\.\d{1,5}){0,3}$/;
export function newerVersion(candidate: string, installed: string): boolean {
  if (!versionPattern.test(candidate) || !versionPattern.test(installed)) return false;
  const next = candidate.split('.').map(Number),
    current = installed.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    if ((next[i] ?? 0) !== (current[i] ?? 0)) return (next[i] ?? 0) > (current[i] ?? 0);
  }
  return false;
}
export const releaseSchema = z.object({
  version: z.string().regex(versionPattern),
  title: z.string().max(200),
  notes: z.string().max(20000),
  url: z
    .string()
    .regex(/^https:\/\/github\.com\/mihirbhadak\/ApiSip\/releases\/tag\/v?\d+(?:\.\d+){0,3}$/),
  downloadUrl: z
    .string()
    .regex(
      /^https:\/\/github\.com\/mihirbhadak\/ApiSip\/releases\/download\/v?\d+(?:\.\d+){0,3}\/apisip-\d+(?:\.\d+){0,3}\.zip$/,
    )
    .optional(),
  publishedAt: z.string().datetime().optional(),
});
export type ReleaseInfo = z.infer<typeof releaseSchema>;
export const updateStatusSchema = z.object({
  checkedAt: z.number().optional(),
  latest: releaseSchema.optional(),
  dismissedVersion: z.string().optional(),
  error: z.string().max(200).optional(),
});
export type UpdateStatus = z.infer<typeof updateStatusSchema>;

export function parseRelease(input: unknown): ReleaseInfo {
  const release = z
    .object({
      tag_name: z.string(),
      name: z.string().nullable(),
      body: z.string().nullable(),
      draft: z.literal(false),
      prerelease: z.literal(false),
      published_at: z.string().datetime(),
      assets: z.array(z.object({ name: z.string(), browser_download_url: z.string() })),
    })
    .parse(input);
  const version = release.tag_name.replace(/^v/, '');
  const base = 'https://github.com/mihirbhadak/ApiSip/releases';
  const expectedZip = `${base}/download/${release.tag_name}/apisip-${version}.zip`;
  return releaseSchema.parse({
    version,
    title: (release.name || `ApiSip ${version}`).slice(0, 200),
    notes: (release.body || 'See the GitHub release for details.').slice(0, 20000),
    publishedAt: release.published_at,
    url: `${base}/tag/${release.tag_name}`,
    downloadUrl: release.assets.some(
      (asset) =>
        asset.name === `apisip-${version}.zip` && asset.browser_download_url === expectedZip,
    )
      ? expectedZip
      : undefined,
  });
}
