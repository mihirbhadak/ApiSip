# Verification report

## Reproduce

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:authorize
npm run test:e2e
npm run format:check
npm audit
```

`test:authorize` needs one normal Chrome site-access approval in a dedicated test profile. Subsequent runs clone that authorized baseline. See [DEVELOPMENT.md](DEVELOPMENT.md) for isolation, browser selection and cache handling. Build before E2E; the suite asserts that the loaded worker and `dist/build-info.json` identify the same build.

## Latest verified results

Verified September 15, 2026 on Windows with Chrome for Testing 153.0.8010.12 and Node.js 26.4.0.

- ESLint: passed with zero warnings.
- Strict TypeScript: passed.
- Vitest: 100 tests passed across 10 files, including components, repositories and executable snippets.
- Production Vite build: passed; build identifier `2026-09-15T12:41:17.762Z`.
- Dependency audit: zero known vulnerabilities reported by npm.
- Real Chrome E2E: all 15 scenarios passed in 1.7 minutes, with no retries or skips. This includes exact repository-root installation, proven worker termination/recovery, both replay contexts and 10,000 completed requests.
- Automated accessibility checks and visual review: passed for the documented screens.
- ZIP package: verified manifest, script/style/icon paths and archive integrity (16 entries, 626,119 bytes).

## Real Chrome burst measurements

| Persisted test requests | Requests added in this stage | Stage duration | Targeted search |
| ----------------------- | ---------------------------- | -------------- | --------------- |
| 1,000                   | 1,000                        | 3.30 s         | 328 ms          |
| 5,000                   | 4,000                        | 13.98 s        | 825 ms          |
| 10,000                  | 5,000                        | 42.08 s        | 813 ms          |

Stages send genuine HTTP requests in concurrent groups of 50. Stage duration includes generation, waiting for every completed HTTP 200 response to persist, displaying the matching set, and targeted search. Durations are incremental, not cumulative. The test raises the request retention cap to 20,000 to keep earlier fixture records while measuring 10,000 additional requests. Fewer than 50 request rows are rendered at each size. These measurements describe this machine and fixture, not a throughput or latency guarantee for arbitrary sites or bodies.

The completion assertion exposed a real write backlog during development: request starts were stored while response updates lagged behind. Passive lifecycle events now enqueue without waiting for each previous commit, and the writer groups all queued events for 100 independent request keys into each atomic transaction. Tests require completed responses, not merely a growing counter.

## Test layers

| Layer               | What it checks                                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain tests        | URL/query parsing, byte limits, JSON formatting and structural diffs, endpoint normalization, filter operators and nested boolean expressions, regex rejection, code generation, exports/imports, masking, statistics, badge formatting |
| Repository tests    | IndexedDB summary/body separation, indexes, atomic imports, retention protection, concurrent updates, serialization and 1k/5k/10k datasets using fake-indexeddb                                                                         |
| Capture integration | Atomic buffered writes, passive-event preparation without commit stalls, coalesced refreshes, event sequencing, rollback, deleted-session races, incomplete body/replay handling and cheap metadata filtering before body hydration     |
| Component tests     | Virtualized table, keyboard navigation, editor/query/headers, safe response rendering, filter builder, dialogs, settings, command palette and workspace/collection navigation                                                           |
| Executable snippets | Local echo-server execution for JavaScript/TypeScript fetch, Bash cURL, Windows CMD cURL, PowerShell and Go; Python syntax compilation                                                                                                  |
| Chrome E2E          | Actual installed production MV3 extension, genuine network events, Chrome action, badge, replay, clipboard, exports/import, persistence, worker/browser restart, permission failures, accessibility and large datasets                  |

All 16 code generators have representative assertions. Java, C#, PHP, Ruby, Rust, HTTPie, Axios and Python third-party-client snippets have not all been compiled/executed with their external runtimes or libraries. Generator tests are not a claim of universal language/runtime compatibility.

## Actual Chrome acceptance scenarios

The serial E2E suite uses the loopback HTTP/WebSocket laboratory in `tests/server.mjs`. It does not inject fake network events, mock Chrome capture, or hard-code a displayed count.

1. Trigger Chrome's real extension toolbar action through `Extensions.triggerAction`; verify it opens the full-page inspector and subsequently focuses it without a duplicate.
2. Start passive capture; generate one request and then ten; assert exact stored count deltas and the actual `chrome.action` badge.
3. Enable debugger capture; verify JSON, headers, forms, redirects, 4xx/5xx, latency, cookies, GraphQL, bounded large responses and WebSocket frames.
4. Search and apply a compound status filter; inspect request/response/header/query data and masked values.
5. Edit URL, header, query and body; execute extension and browser replays against the server; inspect the actual echo response, cookie behavior, history and diff.
6. Copy cURL and structured data; paste using the real clipboard into the test page. Download JSON, CSV, Markdown and HAR; inspect content; import the JSON and verify its round trip.
7. Save favorites and collection requests; create a workspace/session and reload the inspector to verify persistence.
8. Switch active source tabs; confirm current-tab capture excludes background traffic and follows the new target.
9. Capture across tabs; terminate/restart the service worker; verify new passive captures and a recorded closed-source replay error.
10. Terminate the worker with debugger capture enabled; verify the recovered provider captures a new response body.
11. Exercise themes, filter/settings dialogs and a narrow viewport; run axe checks on the table and key dialogs.
12. Generate 1,000, then 5,000, then 10,000 real requests; verify exact persisted counts, completed HTTP 200 responses for every generated request, a bounded rendered row count and responsive targeted search.
13. Close and relaunch Chrome with the same run profile; verify entities, records, capture settings and new capture survive.
14. Revoke optional host access; assert capture cannot claim success, replay records a permission error and diagnostics explain the failure.
15. Load the exact repository root as a fresh unpacked extension; verify Chrome enables it, the toolbar opens `dist/inspector.html`, and the worker reports the current build. Close the exact worker target, verify it disappears, and confirm another toolbar click wakes it and opens the inspector again.

The action test uses the browser's supported extension-testing switch and local debugging pipe. This is test infrastructure; the shipped extension has no test-only event injection or alternate capture behavior. Native OS keyboard accelerator dispatch is outside Playwright's page-input checks. The action handler itself is exercised by Chrome.

## Visual and accessibility QA

Actual extension screenshots cover the empty/light inspector, captured traffic, response details, replay editor, dark table, filter dialog, settings, 640-pixel layout, 10k session, permission error, export dialog and fresh root-folder installation. Generated files are under `test-results/visual`. There is no popup by design.

Automated accessibility checks use axe with WCAG 2 A/AA rules. Component tests cover keyboard selection and dialog interactions. Automated rules do not replace manual screen-reader testing; a full assistive-technology/platform matrix has not been performed.

## Verification boundaries

- Browser results apply to the installed Chrome for Testing build on Windows, with local HTTP/WebSocket fixtures. They do not establish compatibility with every Chrome version, enterprise policy, site authentication flow or operating system.
- CORS, forbidden headers, private browser pages, missing bodies and debugger ownership remain Chrome limitations. The UI explains unavailable data and replay failures rather than synthesizing success.
- Storage tests include 10k records in both fake-indexeddb and actual Chrome. Performance measurements are machine-specific, not a latency guarantee.
- No known failing acceptance test should be hidden with skips or retries. The test configuration has no retry policy. A failure captures diagnostics and a screenshot.
- No cloud, store publication, interception, WebSocket replay, exact multipart-file replay, unlimited bodies or secrets vault is included.
