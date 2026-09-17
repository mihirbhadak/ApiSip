import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { generateCode, type Language } from '../src/export/generators';
import { makeBody, parseUrl } from '../src/shared/parse';
import type { RequestData } from '../src/shared/model';
const exec = promisify(execFile);
let url: string;
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      method: req.method,
      url: req.url,
      body: Buffer.concat(chunks).toString(),
      header: req.headers['x-test'],
    }),
  );
});
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server address unavailable');
  url = 'http://127.0.0.1:' + address.port + '/echo?q=one%20two&number=3';
  await mkdir('.tmp/snippets', { recursive: true });
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const request = (): RequestData => ({
  method: 'POST',
  url,
  query: parseUrl(url).query,
  headers: [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'X-Test', value: 'quotes "double" and apostrophe\' and percent % literal' },
    { name: ':authority', value: 'stale.example.test' },
    { name: ':method', value: 'GET' },
    { name: ':path', value: '/stale' },
    { name: ':scheme', value: 'https' },
  ],
  body: makeBody('{"name":"Mihir","nested":{"id":2}}', 'application/json'),
});
function verify(output: string) {
  const start = output.indexOf('{'),
    end = output.lastIndexOf('}');
  const echo = JSON.parse(output.slice(start, end + 1)) as {
    method: string;
    url: string;
    body: string;
    header: string;
  };
  expect(echo.method).toBe('POST');
  expect(echo.url).toBe(new URL(url).pathname + new URL(url).search);
  expect(JSON.parse(echo.body)).toEqual(JSON.parse(request().body!.text!));
  expect(echo.header).toBe(request().headers[1]!.value);
}
describe('generated snippets against a real local HTTP server', () => {
  it.each(['JavaScript fetch', 'TypeScript fetch'] as Language[])(
    'executes %s',
    async (language) => {
      const code = generateCode(language, request(), true);
      const js = ts.transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        reportDiagnostics: true,
      });
      expect(js.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error)).toEqual([]);
      const path = resolve('.tmp/snippets/replay.mjs');
      await writeFile(path, js.outputText);
      verify((await exec(process.execPath, [path], { timeout: 10000 })).stdout);
    },
  );
  it('executes Bash cURL with safe quoting', async () => {
    const path = resolve('.tmp/snippets/replay.sh');
    await writeFile(path, generateCode('Bash cURL', request(), true));
    const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
    verify((await exec(bash, [path.replace(/\\/g, '/')], { timeout: 10000 })).stdout);
  });
  it('executes Windows CMD cURL from a batch file', async () => {
    if (process.platform !== 'win32') return;
    const path = resolve('.tmp/snippets/replay.cmd');
    await writeFile(path, generateCode('Windows CMD cURL', request(), true).replace(/\n/g, '\r\n'));
    verify(
      (
        await exec('cmd.exe', ['/d', '/s', '/c', '"' + path + '"'], {
          timeout: 10000,
          windowsVerbatimArguments: true,
        })
      ).stdout,
    );
  });
  it('executes PowerShell HttpClient with preserved headers and body', async () => {
    if (process.platform !== 'win32') return;
    const path = resolve('.tmp/snippets/replay.ps1');
    await writeFile(path, generateCode('PowerShell', request(), true));
    verify(
      (await exec('powershell.exe', ['-NoProfile', '-File', path], { timeout: 20000 })).stdout,
    );
  });
  it('compiles and executes Go net/http', async () => {
    const path = resolve('.tmp/snippets/replay.go');
    await writeFile(path, generateCode('Go net/http', request(), true));
    verify((await exec('go', ['run', path], { timeout: 60000 })).stdout);
  }, 65000);
  it.each(['Python requests', 'Python httpx'] as Language[])(
    'parses %s as valid Python',
    async (language) => {
      const path = resolve('.tmp/snippets/' + language.replaceAll(' ', '-') + '.py');
      await writeFile(path, generateCode(language, request(), true));
      await exec(
        'python',
        [
          '-c',
          'import ast,pathlib,sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
          path,
        ],
        { timeout: 10000 },
      );
      expect(await readFile(path, 'utf8')).toContain('timeout=25');
    },
  );
});
