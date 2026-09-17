import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

// A separate pause symbol makes the toolbar state recognizable without color.
const paused = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="22" fill="#64748b"/>
  <path d="M42 36v56m44-56v56" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round"/>
</svg>`;
await mkdir('public/icons/paused', { recursive: true });
for (const size of [16, 32, 48, 128])
  await sharp(Buffer.from(paused))
    .resize(size, size)
    .png()
    .toFile(`public/icons/paused/${size}.png`);
