import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const root = resolve('docs');
const port = Number(process.env.APISIP_SITE_PORT ?? 4178);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (path === '/' || path === '/ApiSip') {
      response.writeHead(302, { Location: '/ApiSip/' }).end();
      return;
    }
    if (!path.startsWith('/ApiSip/')) {
      response.writeHead(404).end('Not found');
      return;
    }
    const relative = decodeURIComponent(path.slice('/ApiSip/'.length)) || 'index.html';
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Content-Length': bytes.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`ApiSip website: http://127.0.0.1:${port}/ApiSip/`),
);
