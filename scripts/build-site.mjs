import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build, transform } from 'esbuild';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';

// Retain older content-hashed files so cached HTML continues to load its original assets.
const output = 'docs/assets';
await mkdir(output, { recursive: true });
const config = JSON.parse(await readFile('website/config.json', 'utf8'));
if (
  config.analyticsEndpoint &&
  !/^https:\/\/[a-z0-9-]+\.goatcounter\.com\/count$/.test(config.analyticsEndpoint)
)
  throw new Error('Use your own HTTPS GoatCounter /count endpoint, or leave it empty.');
if (!/^[a-zA-Z0-9_-]*$/.test(config.searchConsoleVerification))
  throw new Error('Invalid Search Console verification token.');
if (
  !Array.isArray(config.allowedCampaigns) ||
  config.allowedCampaigns.some((value) => !/^[a-z0-9-]{1,40}$/.test(value))
)
  throw new Error('Campaign names must be short lowercase slugs.');

async function asset(name, extension, bytes) {
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
  const file = `web-${name}.${digest}.${extension}`;
  await writeFile(`${output}/${file}`, bytes);
  return `assets/${file}`;
}
const screenshots = {};
for (const [key, name] of Object.entries({
  capture: 'response-light',
  editor: 'editor-dark',
  runner: 'runner-dark',
  lab: 'test-lab-overview',
})) {
  const variants = [];
  for (const width of [480, 960, 1512]) {
    const bytes = await sharp(`docs/screenshots/${name}.png`)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 86, effort: 6 })
      .toBuffer();
    variants.push({ width, src: await asset(`${key}-${width}`, 'webp', bytes) });
  }
  screenshots[key] = {
    src: variants[1].src,
    full: variants[2].src,
    srcset: variants.map((v) => `${v.src} ${v.width}w`).join(', '),
  };
}
const portraits = [];
for (const width of [96, 192]) {
  const bytes = await sharp('docs/assets/mihir-bhadak.jpg')
    .resize(width, width)
    .webp({ quality: 85, effort: 6 })
    .toBuffer();
  portraits.push({ width, src: await asset(`mihir-${width}`, 'webp', bytes) });
}
const social = await asset(
  'social-card',
  'png',
  await sharp('docs/screenshots/response-light.png')
    .resize(1200, 630, { fit: 'contain', background: '#0b100f' })
    .png({ compressionLevel: 9 })
    .toBuffer(),
);
const javascript = await build({
  entryPoints: ['website/site.js'],
  bundle: true,
  minify: true,
  write: false,
  target: ['chrome109', 'safari16', 'firefox115'],
  define: {
    APISIP_SITE_CONFIG: JSON.stringify(config),
    APISIP_SCREENSHOTS: JSON.stringify(screenshots),
  },
});
const script = await asset('site', 'js', javascript.outputFiles[0].contents);
const css = await transform(await readFile('website/site.css', 'utf8'), {
  loader: 'css',
  minify: true,
});
const dom = new JSDOM(await readFile('website/index.html', 'utf8'));
const { document } = dom.window;
const style = document.createElement('style');
style.textContent = css.code;
document.querySelector('link[rel="stylesheet"]').replaceWith(style);
document.querySelector('script[src="site.js"]').setAttribute('src', script);
const showcase = document.getElementById('showcase-image');
showcase.setAttribute('src', screenshots.capture.src);
showcase.setAttribute('srcset', screenshots.capture.srcset);
showcase.setAttribute(
  'sizes',
  '(max-width: 600px) calc(100vw - 40px), (max-width: 1296px) calc(100vw - 80px), 1216px',
);
const expanded = document.getElementById('expanded-image');
expanded.setAttribute('src', screenshots.capture.full);
expanded.setAttribute('loading', 'lazy');
for (const portrait of document.querySelectorAll('img[src="assets/mihir-bhadak.jpg"]')) {
  portrait.setAttribute('src', portraits[0].src);
  portrait.setAttribute('srcset', `${portraits[0].src} 96w, ${portraits[1].src} 192w`);
  portrait.setAttribute('sizes', `${portrait.getAttribute('width')}px`);
}
for (const meta of document.querySelectorAll(
  'meta[property="og:image"], meta[name="twitter:image"]',
))
  meta.setAttribute('content', `https://mihirbhadak.github.io/ApiSip/${social}`);
if (config.searchConsoleVerification) {
  const meta = document.createElement('meta');
  meta.name = 'google-site-verification';
  meta.content = config.searchConsoleVerification;
  document.head.append(meta);
}
if (config.analyticsEndpoint)
  document.querySelector('[data-analytics-notice]').textContent =
    'This website uses optional cookie-free aggregate metrics from GoatCounter. The extension contains no telemetry. You can turn website metrics off below.';
// HTML serialization removes XHTML-style void slashes flagged by Nu. Text stays fully indexable.
const html =
  dom
    .serialize()
    .replace(/[ \t]+$/gm, '')
    .trimEnd() + '\n';
await writeFile('docs/index.html', html);
console.log(
  `Built static website: ${Buffer.byteLength(html)} bytes HTML; ${css.code.length} bytes inline CSS; ${javascript.outputFiles[0].contents.length} bytes JS. Analytics ${config.analyticsEndpoint ? 'configured' : 'not configured'}.`,
);
