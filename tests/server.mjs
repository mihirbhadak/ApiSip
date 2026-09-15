import http from 'node:http';
import { WebSocketServer } from 'ws';
const loadRuns = new Map();
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4177');
  const chunks = [];
  try {
    for await (const chunk of request) chunks.push(chunk);
  } catch {
    response.destroy();
    return;
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-test-server': 'api-catcher',
  };
  if (url.pathname === '/api/load-stats') {
    const run = loadRuns.get(url.searchParams.get('id'));
    response.writeHead(200, headers);
    response.end(JSON.stringify(run ? { ...run, indices: [...run.indices] } : { count: 0 }));
    return;
  }
  if (url.pathname.startsWith('/api/load/')) {
    const id = url.pathname.slice('/api/load/'.length);
    if (!loadRuns.has(id)) {
      if (loadRuns.size >= 50) loadRuns.delete(loadRuns.keys().next().value);
      loadRuns.set(id, {
        count: 0,
        active: 0,
        peak: 0,
        firstAt: Date.now(),
        lastAt: 0,
        indices: new Set(),
        samples: [],
      });
    }
    const run = loadRuns.get(id);
    run.count++;
    run.active++;
    run.peak = Math.max(run.peak, run.active);
    run.lastAt = Date.now();
    const index = url.searchParams.get('index') ?? request.headers['x-run-index'];
    if (index !== undefined) run.indices.add(Number(index));
    if (run.samples.length < 4) run.samples.push({ index, raw, headers: request.headers });
    response.once('close', () => {
      run.active--;
    });
    await new Promise((resolve) => setTimeout(resolve, Number(url.searchParams.get('delay') ?? 0)));
    if (response.destroyed) return;
    response.writeHead(Number(url.searchParams.get('status') ?? 200), headers);
    response.flushHeaders();
    const size = Math.min(3_000_000, Number(url.searchParams.get('size') ?? 11));
    if (url.searchParams.has('bodyDelay')) {
      response.write('x');
      await new Promise((resolve) =>
        setTimeout(resolve, Number(url.searchParams.get('bodyDelay'))),
      );
      if (!response.destroyed) response.end('x'.repeat(Math.max(0, size - 1)));
    } else response.end('x'.repeat(size));
    return;
  }
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(
      '<!doctype html><html lang="en"><head><title>API Catcher test lab</title><link rel="icon" href="data:,"></head><body><h1>API Catcher test lab</h1><button id="users">Fetch users</button><button id="batch">10 requests</button><pre id="output">Ready</pre><label>Clipboard scratchpad<textarea aria-label="Clipboard scratchpad"></textarea></label><script>document.querySelector("#users").onclick=async()=>{document.querySelector("#output").textContent=await(await fetch("/api/users")).text()};document.querySelector("#batch").onclick=async()=>{await Promise.all(Array.from({length:10},(_,i)=>fetch("/api/users/"+i)));document.querySelector("#output").textContent="10 requests complete"};</script></body></html>',
    );
    return;
  }
  if (url.pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (url.pathname === '/api/slow')
    await new Promise((resolve) => setTimeout(resolve, Number(url.searchParams.get('ms') ?? 1200)));
  if (url.pathname.startsWith('/api/error/')) {
    const status = Number(url.pathname.split('/').pop());
    response.writeHead(status, headers);
    response.end(JSON.stringify({ error: 'Test error ' + status, status }));
    return;
  }
  if (url.pathname === '/api/redirect') {
    response.writeHead(302, { ...headers, location: '/api/users?redirected=1' });
    response.end();
    return;
  }
  if (url.pathname === '/api/malformed') {
    response.writeHead(200, headers);
    response.end('{"broken":');
    return;
  }
  if (url.pathname === '/api/html') {
    response.writeHead(200, { ...headers, 'content-type': 'text/html' });
    response.end('<script>globalThis.pwned=true</script><h1>untrusted content</h1>');
    return;
  }
  if (url.pathname === '/api/xml') {
    response.writeHead(200, { ...headers, 'content-type': 'application/xml' });
    response.end('<users><user id="1">Mihir</user></users>');
    return;
  }
  if (url.pathname === '/api/binary') {
    response.writeHead(200, { ...headers, 'content-type': 'application/octet-stream' });
    response.end(Buffer.from([0, 255, 1, 128, 10]));
    return;
  }
  if (url.pathname === '/api/large-response') {
    const body = JSON.stringify({
      data: 'x'.repeat(Math.min(5_000_000, Number(url.searchParams.get('size') ?? 1_500_000))),
    });
    response.writeHead(200, { ...headers, 'content-length': Buffer.byteLength(body) });
    response.end(body);
    return;
  }
  if (url.pathname === '/api/cookies') {
    headers['set-cookie'] = [
      'lab_session=private-cookie; HttpOnly; SameSite=Lax; Path=/',
      'visible_cookie=yes; SameSite=Lax; Path=/',
    ];
  }
  if (url.pathname === '/api/headers') {
    headers['x-duplicate'] = ['one', 'two'];
  }
  let body = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    /* Text/form data stays text */
  }
  if (url.pathname === '/api/graphql') {
    response.writeHead(200, headers);
    response.end(JSON.stringify({ data: { users: [{ id: 1, name: 'Mihir' }] }, request: body }));
    return;
  }
  if (request.method === 'DELETE') {
    response.writeHead(204, headers);
    response.end();
    return;
  }
  const result = {
    method: request.method,
    url: url.pathname + url.search,
    headers: request.headers,
    body,
    users: url.pathname.startsWith('/api/users')
      ? [
          { id: 1, name: 'Mihir', role: 'developer' },
          { id: 2, name: 'Ada', role: 'engineer' },
        ]
      : undefined,
  };
  response.writeHead(
    request.method === 'POST' && url.pathname === '/api/users' ? 201 : 200,
    headers,
  );
  response.end(JSON.stringify(result));
});
const ws = new WebSocketServer({ server, path: '/socket' });
ws.on('connection', (socket) => {
  socket.send('connected');
  socket.on('message', (data) => socket.send('echo:' + data.toString()));
});
server.listen(4177, '127.0.0.1', () => console.log('Test lab: http://127.0.0.1:4177'));
process.on('SIGTERM', () => {
  ws.close();
  server.close();
});
