# Verification report

## Website metadata, delivery, feedback and measurement update

Verified September 16, 2026. The extension source and downloadable 0.1.1 release are unchanged by this website update.

- `npm run check` passed: lint, strict TypeScript, 151 unit/component/integration tests and the production extension build. The website build uses an explicit dependency on the existing esbuild 0.25 line plus Sharp for offline image optimization; no new runtime dependency is loaded into the browser.
- `npm run test:site`: 20 Chrome browser tests passed, including publisher and social-card metadata, alt/title coverage, responsive image selection, social icon names, background installation scrolling, modal close/focus on mobile, native feedback drafts, accessibility at four widths and five focused analytics scenarios.
- `npm run test:site-tools`: three download-counter tests passed for ZIP selection, pagination, malformed/API-failure rejection, bounded snapshot history and CSV escaping. A real GitHub API collection established the initial aggregate baseline.
- The generated HTML submitted directly to W3C Nu returned zero messages. The previous public HTML had two errors: an ARIA label on an element with a generic role, and an image without an initial source; both were fixed.
- Images are generated in 480/960/1512-pixel WebP variants. The smallest response screenshot is 10,786 bytes versus the original 127,663-byte PNG. The 96-pixel creator portrait is 3,688 bytes versus the original 386,178-byte JPEG. The browser selects the appropriate variant for viewport/density and loads the full screenshot only for the lightbox.
- Generated inline CSS is approximately 29 KB before compression and the deferred application script approximately 9 KB. No external stylesheet blocks initial rendering. Legacy assets are retained so cached previous HTML remains functional.
- W3C's CSS3-profile service reported unsupported-property messages for SVG paint, pointer events and masking. Those declarations were checked against the W3C specifications and with Chrome `CSS.supports`; each tested value is supported. This is not recorded as a clean CSS-validator result.
- The requested WMTips analyzer presented a Cloudflare human-verification screen. It was not bypassed, and no WMTips score is claimed. A separate local visible-text count is saved in `artifacts/site-audit/keyword-local.json` and is explicitly not that service's result.
- Visual review covered the feedback section, desktop/mobile support dialog, social icons and the installation guide after dismissal. No live feedback issue or payment was submitted.

GoatCounter integration is prepared but **not active**: the owner chose a setup guide and has not supplied an endpoint. Tests substitute the provider transport and cannot prove an unconfigured analytics account receives data. The guide explains this activation boundary, privacy controls, Search Console ownership verification, GitHub cache-header limitations and the distinction between click events, release download counters and installs.

### Public deployment follow-up

- GitHub Pages deployment [35124627760](https://github.com/mihirbhadak/ApiSip/actions/runs/35124627760) succeeded. The actual public page returned HTTP 200 with the new publisher/social metadata and optimized assets. Its `Cache-Control` remains `max-age=600`.
- The public URL checked by W3C Nu returned **zero messages**. The CSS3-profile service returned the same eight unsupported-property messages documented above; it is not reported as a clean CSS validation.
- A fresh Chrome session checked the public page at 1440, 768, 390 and 320 pixels with no overflow or axe violations in the tested states. Showcase tabs, real release download, support dialog, installation scrolling and focus all worked. The downloaded ZIP again matched SHA-256 `15c9bf597b3c611722f70ea4ec3a67e5f3978ced8fe4c1791d397147445da2b9`. No page JavaScript errors occurred.
- [Record release downloads run 35124607783](https://github.com/mihirbhadak/ApiSip/actions/runs/35124607783) succeeded on GitHub's hosted runner and committed a second real snapshot. This verifies workflow execution, API access and history persistence; future scheduled runs still depend on GitHub's scheduling and repository settings.
- Fresh Lighthouse 13.4.1 mobile lab audit against the deployed HTTPS site: **100 performance, 100 accessibility, 100 best practices, 100 SEO**. FCP 1.3 s, LCP 1.4 s, total blocking time 10 ms, CLS 0.05. The render-blocking insight had no requests. Cache-lifetime estimated waste was 33,632.5 bytes (32.8 KiB); image-delivery estimated waste was 27,768 bytes (27.1 KiB). The audit selected the 960-pixel screenshot for its higher-density emulated mobile screen; normal 1× mobile selection was independently tested at 480 pixels. We retain higher-density variants for readable UI text, so an image-sizing estimate can remain.
- The fresh PageSpeed API request returned HTTP 429 with an exhausted shared daily quota. The Lighthouse result above is **not** misrepresented as a new Google-hosted PageSpeed report. The user's older report is historical and needs a new run in PageSpeed to reflect this deployment.

Local artifacts: `artifacts/site-audit/lighthouse-after.report.*`, `html-live-after.txt`, `css-live-after.txt`, `pagespeed-api-after.json`, `visual/*`, and `artifacts/site-qa/real-download.json`. Scores and measurements are one lab run, not a guarantee for every visitor.

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

## Website and extension 0.1.1 verification

Verified September 16, 2026. This release adds the static public website and optional creator support links in the extension, with no new extension permissions.

- `npm run check`: lint, strict TypeScript, all 151 automated tests and the production extension build passed.
- `npm run test:e2e`: all 25 real Chrome extension scenarios passed in 2.8 minutes, including the exact coffee URL in the creator guide, accessible help, genuine capture/replay, persistence and both 10,000-request tests. The timed loopback run had no missed starts.
- `npm run test:site`: all 12 browser scenarios passed. Coverage includes screenshot tabs/lightbox, mobile navigation, outside/Escape dismissal, installation-guide focus, every download CTA, the optional profile/support dialog, clipboard success/failure, creator links, SEO metadata, no-JavaScript essentials and asset budgets. Axe checks passed at 1440, 768, 390 and 320 pixels and inside the download dialog. No horizontal overflow was found at those widths.
- Desktop/mobile hero, feature catalogue, creator profile and download dialog were visually reviewed in the browser. Screenshots on the site contain only the bundled loopback application's fixture traffic.
- The website's application script is about 6.5 KB uncompressed (2.2 KB gzip), with no frontend framework or remote fonts. Screenshot images and the locally bundled portrait have explicit dimensions; offscreen creator images load lazily. These are asset measurements, not a universal load-time guarantee.
- Extension build: `2026-09-16T07:17:43.715Z`. The ZIP contains 26 verified files (1,180,961 bytes); SHA-256 `15c9bf597b3c611722f70ea4ec3a67e5f3978ced8fe4c1791d397147445da2b9`.
- A separate Chrome run clicked the locally served website's real download CTA without stubbing requests. GitHub delivered `apisip-0.1.1.zip`; the downloaded bytes matched that SHA-256, the creator/support dialog remained visible, and no page errors occurred. An independent GitHub CLI download matched too.
- Final Lighthouse 13.4.1 mobile lab audit of the local static server: performance 99, accessibility 100, best practices 100 and SEO 100. FCP 1.2 s, LCP 2.1 s, total blocking time 0 ms and CLS 0.05. These are local lab measurements, not live-site measurements or ranking guarantees. Reports are saved locally under `artifacts/website-lighthouse-final.report.*`.

Local website tests stub only the external ZIP transfer, so they can run without publishing a release or downloading a remote file repeatedly. The real archive is verified separately during publication. Social/payment destinations are checked as links; no contribution is submitted. Website checks do not guarantee search ranking or cover every browser/assistive technology.

### Hosting verification

The GitHub Pages site at <https://mihirbhadak.github.io/ApiSip/> was verified live on September 16, 2026. With the owner's explicit approval, the obsolete `mihirbhadak.me` custom-domain setting and corresponding `CNAME` were removed from the account's main Pages repository. Rebuilding the ApiSip Pages site cleared its cached redirect. The public page now returns HTTP 200 over HTTPS; HTTP requests redirect to HTTPS, and GitHub reports HTTPS enforcement enabled for both sites.

A fresh Chrome session verified the public page at 1440, 768, 390 and 320 pixels with zero horizontal overflow and zero axe WCAG 2 A/AA and 2.1 A/AA violations in the checked page states. Styles, JavaScript, all three showcase screenshots, creator photo, favicon and sitemap returned HTTP 200. Screenshot tabs and the image lightbox worked, and the desktop page and download dialog were visually reviewed. Clicking the actual public download CTA fetched the 1,180,961-byte release ZIP with the expected SHA-256 above and displayed the profile/support dialog with the exact coffee link. No page JavaScript errors were observed. Detailed local evidence is in `artifacts/site-qa/real-download.json` and `artifacts/site-qa/live-*.png`.

Lighthouse 13.4.1 against the public HTTPS URL with its mobile lab configuration scored performance 97, accessibility 100, best practices 100 and SEO 100. FCP was 1.2 s, LCP 1.9 s, total blocking time 0 ms and CLS 0. Results are stored locally in `artifacts/website-lighthouse-live.report.*`. This is one measured run against the deployed page; real-user network/device performance and search ranking will vary.

## ApiSip 0.1.0 public release verification

Verified September 16, 2026 on Windows with the installed Chrome for Testing build and Node.js 26.4.0. ApiSip's visible branding, extension manifest, repository metadata, exports and documentation were updated; persistent database and report-format identifiers remain compatible.

- `npm run check`: lint, strict TypeScript, all 151 Vitest tests across 16 files, and production build passed.
- `npm run test:e2e`: all 25 real Chrome scenarios passed in 2.8 minutes, including root-folder installation, capture, replay, clipboard/export/import, persistence, accessibility, worker recovery and both 10,000-request scenarios. No retries or skips.
- `npm run format:check`, `git diff --check` and `npm audit`: passed; npm reported zero known vulnerabilities.
- Build identifier: `2026-09-16T06:52:38.078Z`.
- Timed loopback run: 10,000 requests started in the configured one-minute window, no missed starts, 60,007.8 ms total elapsed, and a 32,542-byte report. The benchmark uses concurrency 32 and a 1,000 ms start-delay tolerance; the measurement caveats below still apply.
- Release ZIP: 26 files, 1,180,376 bytes; archive CRCs, manifest references and byte-for-byte agreement with `dist` verified. SHA-256: `3d8964d9e836e792878525676684ea555aab7b7890e9f82800704ecb1858135a`.
- The README screenshots show real local fixture traffic in the branded light/dark inspector and were visually reviewed.

The built ZIP and checksum are published with [release v0.1.0](https://github.com/mihirbhadak/ApiSip/releases/tag/v0.1.0). Browser profiles, dependencies and temporary test output are excluded from Git. A targeted scan of 272 historical Git blobs found no high-confidence credential patterns; this is not a comprehensive security audit.

## September 15 implementation verification

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
