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

This build adds paced API testing entirely inside the extension, with variables, bounded measurements, persistent reports and recovery after worker interruption. It preserves dedicated editor tabs, both single-request replay contexts, dashboard interactions and Mihir Bhadak's locally bundled profile photo.

- ESLint: passed with zero warnings.
- Strict TypeScript: passed.
- Vitest: 151 tests passed across 16 files, including components, repositories, migration, timer granularity/stalls, bounded scheduling, real streaming HTTP transport and executable snippets.
- Production Vite build: passed; build identifier `2026-09-15T18:05:14.652Z`.
- Dependency audit: zero known vulnerabilities reported by npm.
- Real Chrome E2E: all 25 scenarios passed in 2.6 minutes, with no retries or skips. Coverage includes the timed runner, source deletion and permission revocation, exact repository-root installation and offscreen host loading, worker recovery, both replay contexts and separate 10,000-request capture and timed-run tests.
- Automated accessibility checks and visual review: passed for the documented screens, including timed runs and editor tabs in light/dark/narrow layouts, the missing-draft state and a completed 10,000-request report. A separate check also verified the profile photo, creator links and accessible help under both root and dist installations.
- Formatting and Git whitespace checks: passed.
- ZIP package: verified manifest, script/style/icon paths, archive integrity and exact equality with the built files (26 entries, 1,169,862 bytes). The supplied profile photo is preserved byte-for-byte.

The package and build identifier are in `artifacts`; `SHA256SUMS.txt` and `package-verification.json` record package integrity. Screenshots are copied to `artifacts/qa`.

## Timed-run measurements

The final Chrome run used the loopback `/api/load/ten-thousand?index={{index}}` fixture with an 11-byte response, 10,000 planned starts, a 60-second window, concurrency 32 and a 1,000 ms start-delay tolerance. The default tolerance is 100 ms; the benchmark explicitly allows more scheduling jitter. The UI remained open. All numbers below are measurements from this machine and this fixture.

| Measurement                                       | Observed result                                 |
| ------------------------------------------------- | ----------------------------------------------- |
| Requests started / finished / passed              | 10,000 / 10,000 / 10,000                        |
| Independent server receipts / unique indices      | 10,000 / 10,000                                 |
| Missed starts                                     | 0                                               |
| Run elapsed                                       | 60,003.1 ms                                     |
| Approximate attempt-duration P95                  | 18.54 ms                                        |
| Maximum measured start delay                      | 30.73 ms                                        |
| Foreground history dropdown interaction           | 40 ms for open, visibility assertion and Escape |
| Serialized run report                             | 32,621 bytes                                    |
| Inspector JS used heap after 1,000 / 8,000 starts | 16,717,452 / 14,802,104 bytes                   |
| Measured isolated Chrome CPU time                 | 41.05 CPU-seconds over 60.60 wall-seconds       |

CPU time is summed across surviving processes in the isolated test browser and excludes processes that exited before the final sample. It includes Chrome/network/UI work; it is **not** extension-only or whole-computer CPU usage. Heap samples come from the inspector's JavaScript isolate, with no forced garbage collection. They do not measure the dedicated runner worker, native networking buffers, peak memory or total Chrome RAM. The smaller second sample illustrates normal garbage collection, not a universal memory ceiling. Bounded-memory guarantees here concern data structures: fixed histograms, capped samples/timeline/history and streamed response disposal. Large request bodies, high concurrency, other applications and browser scheduling still affect resources and throughput. Detailed result metadata is in `artifacts/runner-benchmark.json`.

## Real Chrome burst measurements

| Persisted test requests | Requests added in this stage | Stage duration | Targeted search |
| ----------------------- | ---------------------------- | -------------- | --------------- |
| 1,000                   | 1,000                        | 2.17 s         | 322 ms          |
| 5,000                   | 4,000                        | 7.54 s         | 857 ms          |
| 10,000                  | 5,000                        | 10.92 s        | 842 ms          |

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
6. Open the edited request in a new tab, verify transfer of all edits, reload the autosaved draft, send in both contexts, compare responses, save a copy, share history with the original inspector, reject a simultaneous replay from another page, check both themes with axe, inspect the narrow layout, and discard/reopen the draft. Also verify the details-header button opens a fresh draft from the original capture.
7. Copy cURL and structured data; paste using the real clipboard into the test page. Download JSON, CSV, Markdown and HAR; inspect content; import the JSON and verify its round trip.
8. Save favorites and collection requests; create a workspace/session and reload the inspector to verify persistence.
9. Switch active source tabs; confirm current-tab capture excludes background traffic and follows the new target.
10. Capture across tabs; terminate/restart the service worker; verify new passive captures and a recorded closed-source replay error.
11. Terminate the worker with debugger capture enabled; verify the recovered provider captures a new response body.
12. Exercise themes, filter/settings dialogs and a narrow viewport; run axe checks on the table and key dialogs.
13. Close three-dot menus by outside click and Escape; verify persistent red delete styling, searchable dropdowns, nested settings help, keyboard tabs, select-all/partial selection and the keyboard request menu. Run axe on open menus and pickers.
14. Search contextual help and verify the exact creator links; check the long shortcut reference scrolls inside its panel without overlapping the footer, hold Ctrl/Alt for timed hints without losing focus, use the command palette to focus search, and inspect help in light/dark/narrow layouts with axe checks.
15. Generate 1,000, then 5,000, then 10,000 real requests; verify exact persisted counts, completed HTTP 200 responses for every generated request, a bounded rendered row count and responsive targeted search.
16. Close and relaunch Chrome with the same run profile; verify entities, records, capture settings and new capture survive.
17. Revoke optional host access; assert capture cannot claim success, replay records a permission error and diagnostics explain the failure.
18. Load the exact repository root as a fresh unpacked extension; verify Chrome enables it, the toolbar opens `dist/inspector.html`, and the worker reports the current build. Close the exact worker target, verify it disappears, and confirm another toolbar click wakes it and opens the inspector again. Before host access is granted, open an editor route and verify Open inspector and the toolbar focus the existing dashboard without creating duplicates.

The action test uses the browser's supported extension-testing switch and local debugging pipe. This is test infrastructure; the shipped extension has no test-only event injection or alternate capture behavior. Native OS keyboard accelerator dispatch is outside Playwright's page-input checks. The action handler itself is exercised by Chrome.

## Timed runner coverage

`tests/e2e/runner.spec.ts` exercises real extension fetches and verifies a separate server ledger:

1. Capture an API, open its editor tab, change URL/headers/JSON body, apply cycling data rows and built-ins, review without sending, then send ten paced requests. Check actual values, unique indices, omitted ambient cookies, streamed timings and downloaded JSON/CSV reports.
2. Close the editor and terminate the exact extension service-worker target during a run. Confirm execution continues in the offscreen worker, stop from the dashboard, verify server counts stop increasing and the host closes.
3. Exercise concurrency saturation, timeouts, consecutive HTTP failures, response read limits, blocked redirects and HTTP 429 cancellation.
4. Reject overlapping starts, remove the offscreen context, recover the last checkpoint as interrupted and verify there is no automatic replay.
5. Schedule 10,000 requests over 60 seconds with concurrency 32 and a 1,000 ms start-delay tolerance. Require exactly 10,000 server receipts and unique indices, all finished successfully, bounded report/sample sizes and a responsive foreground inspector. Sample the inspector's JS heap and isolated Chrome process CPU time without a whole-computer resource claim.
6. Delete the source through the actual context menu and confirmation while its run is active. Verify traffic stops, reports disappear and later checkpoints cannot recreate them.
7. Revoke host access during a run. Verify it stops and a later start receives a permission error without sending traffic.

Focused domain tests reproduce timer stalls, 16 ms clock granularity, late slots within tolerance, expiration after expensive template preparation, bounded dispatch/concurrency, cancellation and drain behavior. They also check every-row template validation, JSON escaping/type preservation, fixed origins, body/header limits, approximate percentiles, bounded timelines/samples, report exports, v2-to-v3 migration and source deletion races. Transport integration uses real streaming HTTP responses, including partial body measurements on timeout. Component tests cover plan editing, searchable units, variables, review-before-send and absent measurement states.

Development verification exposed two scheduler problems: coarse timers could miss the final slots, and a full dispatch batch discarded otherwise eligible late slots. The scheduler now reserves a small deadline margin and yields eligible work to the next bounded batch. Separate regression tests cover both; the deadline and exact-count assertions remain enforced. Foreground interaction timing explicitly verifies page visibility and focus before measuring the dropdown, avoiding measurements of an inactive browser surface.

## Visual and accessibility QA

Actual extension screenshots include timed-run configuration and analytics in light/dark/narrow layouts, as well as the dedicated editor in light, dark and narrow layouts, its missing-draft state, and the empty/light inspector, captured traffic, response details, replay editor, dark table, filter dialog, settings, 640-pixel layout, 10k session, permission error, export dialog and fresh root-folder installation. Additional UI coverage includes three-dot menus, searchable dropdowns inside modal dialogs, the creator profile, the full keyboard reference, timed shortcut hints and light/mobile help. Generated files are under `test-results/visual`. The toolbar opens the full-page inspector directly.

Editor and runner tests cover additive upgrades from version-1 and version-2 databases to version 3, unfinished draft persistence, serialized autosaves, revision conflicts, retention/deletion transactions and transferring current edits without resetting them on history refresh. Real Chrome testing also exposed and fixed permission-dependent dashboard discovery on a fresh installation.

Interaction regression tests cover outside-click/one-menu-at-a-time dismissal, focus restoration, disabled/custom/empty picker options, typing after keyboard focus, label activation after choosing an option, tab navigation, selection across virtualized rows, modifier timing, exact creator URLs, help search and editing-safe shortcut dispatch. Chrome testing caught and fixed a label click that reopened a picker after selection; visual review caught and fixed long help content overflowing into the footer.

Automated accessibility checks use axe with WCAG 2 A/AA rules. Component tests cover keyboard selection and dialog interactions. Automated rules do not replace manual screen-reader testing; a full assistive-technology/platform matrix has not been performed.

## Verification boundaries

- Browser results apply to the installed Chrome for Testing build on Windows, with local HTTP/WebSocket fixtures. They do not establish compatibility with every Chrome version, enterprise policy, site authentication flow or operating system.
- CORS, forbidden headers, private browser pages, missing bodies and debugger ownership remain Chrome limitations. The UI explains unavailable data and replay failures rather than synthesizing success.
- Storage tests include 10k records in both fake-indexeddb and actual Chrome. Performance measurements are machine-specific, not a latency guarantee.
- No known failing acceptance test should be hidden with skips or retries. The test configuration has no retry policy. A failure captures diagnostics and a screenshot. Timing misses are valid runner outcomes when Chrome cannot meet the schedule; the exact-count benchmark uses an explicitly configured one-second start-delay tolerance.
- No cloud, store publication, interception, WebSocket replay, exact multipart-file replay, unlimited bodies or secrets vault is included.
