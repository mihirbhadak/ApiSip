import type { RequestData } from '../shared/model';
import { materializeRequest } from '../shared/request-fields';
import { redactRequest, safeHttpUrl, prepareHeaders, isHttpPseudoHeader } from '../shared/security';
export const languages = [
  'cURL',
  'Bash cURL',
  'Windows CMD cURL',
  'PowerShell',
  'JavaScript fetch',
  'JavaScript Axios',
  'TypeScript fetch',
  'Python requests',
  'Python httpx',
  'Go net/http',
  'Java HttpClient',
  'C# HttpClient',
  'PHP cURL',
  'Ruby',
  'Rust reqwest',
  'HTTPie',
] as const;
export type Language = (typeof languages)[number];
export interface CodeGenerator {
  name: Language;
  generate(request: RequestData): string;
}
const json = (s: unknown) => JSON.stringify(s, null, 2);
const shell = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
const single = (s: string) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const rust = (s: string) =>
  '"' +
  Array.from(s)
    .map((c) => {
      if (c === '"') return '\\"';
      if (c === '\\') return '\\\\';
      const code = c.codePointAt(0)!;
      return code < 32 || (code >= 0xd800 && code <= 0xdfff)
        ? '\\u{' + (code >= 0xd800 ? 'fffd' : code.toString(16)) + '}'
        : c;
    })
    .join('') +
  '"';
const ps = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const flatHeaders = (r: RequestData) =>
  r.headers.reduce<Record<string, string>>(
    (result, h) => {
      const key =
        Object.keys(result).find((k) => k.toLowerCase() === h.name.toLowerCase()) ?? h.name;
      result[key] = result[key] ? result[key] + ', ' + h.value : h.value;
      return result;
    },
    Object.create(null) as Record<string, string>,
  );
function curl(r: RequestData) {
  return [
    'curl',
    '--request ' + shell(r.method),
    '--url ' + shell(r.url),
    ...r.headers.map((h) => '--header ' + shell(h.name + ': ' + h.value)),
    ...(r.body?.text !== undefined && !['GET', 'HEAD'].includes(r.method)
      ? ['--data-binary ' + shell(r.body.text)]
      : []),
  ].join(' \\\n  ');
}
const generators: Record<Language, (r: RequestData) => string> = {
  cURL: curl,
  'Bash cURL': curl,
  'Windows CMD cURL': (r) => {
    const quote = (s: string) => {
      if (/[\r\n\0]/.test(s) || (s.includes('"') && /[&|<>^]/.test(s)))
        throw new Error(
          'CMD cannot safely inline these control characters or combined quotes and shell operators. Use PowerShell or Bash cURL for this request.',
        );
      return (
        '"' +
        s
          .replace(/%/g, '%%')
          .replace(/(\\*)"/g, '$1$1\\"')
          .replace(/(\\+)$/g, '$1$1') +
        '"'
      );
    };
    let body = r.body?.text;
    if (body) {
      try {
        body = JSON.stringify(JSON.parse(body));
      } catch {
        /* preserve plain text */
      }
    }
    return (
      '@echo off\nsetlocal DisableDelayedExpansion\n' +
      [
        'curl.exe',
        '--request ' + quote(r.method),
        '--url ' + quote(r.url),
        ...r.headers.map((h) => '--header ' + quote(h.name + ': ' + h.value)),
        ...(body !== undefined && !['GET', 'HEAD'].includes(r.method)
          ? ['--data-binary ' + quote(body)]
          : []),
      ].join(' ^\n  ')
    );
  },
  PowerShell: (r) =>
    [
      'Add-Type -AssemblyName System.Net.Http',
      '$client = [System.Net.Http.HttpClient]::new()',
      '$request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new(' +
        ps(r.method) +
        '), ' +
        ps(r.url) +
        ')',
      '$request.Content = [System.Net.Http.StringContent]::new(' +
        ps(r.body?.text ?? '') +
        ', [System.Text.Encoding]::UTF8)',
      '$request.Content.Headers.Clear()',
      ...r.headers.map(
        (h) =>
          'if (-not $request.Headers.TryAddWithoutValidation(' +
          ps(h.name) +
          ', ' +
          ps(h.value) +
          ')) { [void]$request.Content.Headers.TryAddWithoutValidation(' +
          ps(h.name) +
          ', ' +
          ps(h.value) +
          ') }',
      ),
      'try { $response = $client.SendAsync($request).GetAwaiter().GetResult(); $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() } finally { $request.Dispose(); $client.Dispose() }',
    ].join('\n'),
  'JavaScript fetch': (r) =>
    'const response = await fetch(' +
    json(r.url) +
    ', ' +
    json({
      method: r.method,
      headers: r.headers.map((h) => [h.name, h.value]),
      ...(!['GET', 'HEAD'].includes(r.method) && r.body?.text !== undefined
        ? { body: r.body.text }
        : {}),
    }) +
    ');\nconsole.log(response.status, await response.text());',
  'TypeScript fetch': (r) =>
    'const options: RequestInit = ' +
    json({
      method: r.method,
      headers: r.headers.map((h) => [h.name, h.value]),
      ...(!['GET', 'HEAD'].includes(r.method) && r.body?.text !== undefined
        ? { body: r.body.text }
        : {}),
    }) +
    ';\nconst response: Response = await fetch(' +
    json(r.url) +
    ', options);\nconsole.log(response.status, await response.text());',
  'JavaScript Axios': (r) =>
    'import axios from "axios";\n\nconst response = await axios(' +
    json({
      method: r.method,
      url: r.url,
      headers: flatHeaders(r),
      data: r.body?.text,
      validateStatus: undefined,
    }).replace(/\n}$/, ',\n  validateStatus: () => true\n}') +
    ');\nconsole.log(response.status, response.data);',
  'Python requests': (r) =>
    'import requests\n\nresponse = requests.request(' +
    json(r.method) +
    ', ' +
    json(r.url) +
    ', headers=' +
    json(flatHeaders(r)) +
    ', data=' +
    json(r.body?.text ?? '') +
    '.encode("utf-8"), timeout=25)\nprint(response.status_code, response.text)',
  'Python httpx': (r) =>
    'import httpx\n\nresponse = httpx.request(' +
    json(r.method) +
    ', ' +
    json(r.url) +
    ', headers=' +
    json(flatHeaders(r)) +
    ', content=' +
    json(r.body?.text ?? '') +
    '.encode("utf-8"), timeout=25)\nprint(response.status_code, response.text)',
  'Go net/http': (r) =>
    'package main\n\nimport ("bytes"; "fmt"; "io"; "net/http"; "time")\n\nfunc main() {\n' +
    '  req, err := http.NewRequest(' +
    json(r.method) +
    ', ' +
    json(r.url) +
    ', bytes.NewBufferString(' +
    json(r.body?.text ?? '') +
    '))\n  if err != nil { panic(err) }\n' +
    r.headers
      .map((h) => '  req.Header.Add(' + json(h.name) + ', ' + json(h.value) + ')')
      .join('\n') +
    '\n  client := &http.Client{Timeout: 25 * time.Second}\n  res, err := client.Do(req)\n  if err != nil { panic(err) }\n  defer res.Body.Close()\n  body, err := io.ReadAll(res.Body)\n  if err != nil { panic(err) }\n  fmt.Println(res.StatusCode, string(body))\n}',
  'Java HttpClient': (r) =>
    'import java.net.URI;\nimport java.net.http.*;\nimport java.time.Duration;\n\nclass Replay {\n  public static void main(String[] args) throws Exception {\n' +
    '    var request = HttpRequest.newBuilder(URI.create(' +
    json(r.url) +
    ')).timeout(Duration.ofSeconds(25))\n' +
    r.headers
      .filter((h) => !/^(host|expect|upgrade)$/i.test(h.name))
      .map((h) => '      .header(' + json(h.name) + ', ' + json(h.value) + ')')
      .join('\n') +
    '\n      .method(' +
    json(r.method) +
    ', HttpRequest.BodyPublishers.ofString(' +
    json(r.body?.text ?? '') +
    ')).build();\n' +
    '    var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());\n    System.out.println(response.statusCode() + " " + response.body());\n  }\n}',
  'C# HttpClient': (r) =>
    'using System;\nusing System.Net.Http;\nusing System.Text;\n\nusing var client = new HttpClient { Timeout = TimeSpan.FromSeconds(25) };\n' +
    'using var request = new HttpRequestMessage(new HttpMethod(' +
    json(r.method) +
    '), ' +
    json(r.url) +
    ');\n' +
    'request.Content = new StringContent(' +
    json(r.body?.text ?? '') +
    ', Encoding.UTF8);\nrequest.Content.Headers.Clear();\n' +
    r.headers
      .map(
        (h) =>
          'if (!request.Headers.TryAddWithoutValidation(' +
          json(h.name) +
          ', ' +
          json(h.value) +
          ')) request.Content.Headers.TryAddWithoutValidation(' +
          json(h.name) +
          ', ' +
          json(h.value) +
          ');',
      )
      .join('\n') +
    '\nusing var response = await client.SendAsync(request);\nConsole.WriteLine(await response.Content.ReadAsStringAsync());',
  'PHP cURL': (r) =>
    '<?php\n$ch = curl_init(' +
    single(r.url) +
    ');\ncurl_setopt_array($ch, [\n' +
    '  CURLOPT_CUSTOMREQUEST => ' +
    single(r.method) +
    ',\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_TIMEOUT => 25,\n' +
    '  CURLOPT_HTTPHEADER => [' +
    r.headers.map((h) => single(h.name + ': ' + h.value)).join(', ') +
    '],\n' +
    (r.body?.text !== undefined ? '  CURLOPT_POSTFIELDS => ' + single(r.body.text) + ',\n' : '') +
    ']);\n$response = curl_exec($ch);\nif ($response === false) { throw new RuntimeException(curl_error($ch)); }\necho $response;\ncurl_close($ch);',
  Ruby: (r) =>
    'require "net/http"\nrequire "uri"\n\nuri = URI(' +
    single(r.url) +
    ')\n' +
    'request = Net::HTTPGenericRequest.new(' +
    single(r.method) +
    ', ' +
    (r.body?.text !== undefined ? 'true' : 'false') +
    ', true, uri.request_uri)\n' +
    r.headers
      .map((h) => 'request.add_field(' + single(h.name) + ', ' + single(h.value) + ')')
      .join('\n') +
    (r.body?.text !== undefined ? '\nrequest.body = ' + single(r.body.text) : '') +
    '\nresponse = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https", read_timeout: 25) { |http| http.request(request) }\nputs response.code, response.body',
  'Rust reqwest': (r) =>
    '// Cargo.toml: reqwest = "0.12"; tokio = { version = "1", features = ["macros", "rt-multi-thread"] }\n' +
    '#[tokio::main]\nasync fn main() -> Result<(), Box<dyn std::error::Error>> {\n' +
    '  let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(25)).build()?;\n' +
    '  let response = client.request(reqwest::Method::from_bytes(' +
    rust(r.method) +
    '.as_bytes())?, ' +
    rust(r.url) +
    ')\n' +
    r.headers.map((h) => '    .header(' + rust(h.name) + ', ' + rust(h.value) + ')').join('\n') +
    (r.body?.text !== undefined ? '\n    .body(' + rust(r.body.text) + ')' : '') +
    '\n    .send().await?;\n  println!("{}", response.text().await?);\n  Ok(())\n}',
  HTTPie: (r) =>
    (r.body?.text !== undefined ? "printf '%s' " + shell(r.body.text) + ' | ' : '') +
    'http --ignore-stdin --timeout=25 ' +
    shell(r.method) +
    ' ' +
    shell(r.url) +
    ' ' +
    r.headers.map((h) => shell(h.name + ':' + h.value)).join(' '),
};
export function generateCode(
  language: Language,
  request: RequestData,
  includeSecrets = false,
): string {
  request = materializeRequest(request);
  safeHttpUrl(request.url);
  prepareHeaders(request.headers); // Validate names and control characters for every target.
  if (
    request.body?.encoding === 'base64' ||
    request.body?.truncated ||
    request.body?.type === 'multipart' ||
    (request.body && !request.body.available)
  )
    throw new Error(
      'Replace the unavailable, binary, multipart or truncated body before generating a reproducible command.',
    );
  const source = includeSecrets ? request : redactRequest(request);
  const r = {
    ...source,
    method: source.method.toUpperCase(),
    headers: source.headers.filter(
      (h) =>
        !isHttpPseudoHeader(h.name) &&
        !/^(content-length|transfer-encoding|connection)$/i.test(h.name),
    ),
  };
  if (['GET', 'HEAD'].includes(r.method)) r.body = undefined;
  // HTTPie consumes piped data only when --ignore-stdin is absent.
  const output = generators[language](r);
  return language === 'HTTPie' && r.body?.text !== undefined
    ? output.replace(' --ignore-stdin', '')
    : output;
}
export const codeGenerators: CodeGenerator[] = languages.map((name) => ({
  name,
  generate: (request) => generateCode(name, request),
}));
