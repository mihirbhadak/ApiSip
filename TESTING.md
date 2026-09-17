# Verification report

## 0.2.0 Test lab, guided workflows and passive security — September 17, 2026

The release adds independent saved suites, response checks, JSON Pointer/header extraction, typed request chaining, local environments, explicit destination review, cancellation, interruption checkpoints, suite import/export and JSON/JUnit reports. Sidebar, request/editor actions, context menus, the command palette and searchable help expose the new workflows. Passive security review and an editable redacted context-copy action send no probes or AI-provider requests. The [Test lab guide](TEST-LAB.md) documents examples, resource bounds, privacy and troubleshooting; [ROADMAP.md](ROADMAP.md) distinguishes unimplemented proposals.

- **293 unit/component/integration tests** passed across 32 files. Lint, strict TypeScript, formatting and the production build passed. Full `npm audit` and runtime-only audit reported zero vulnerabilities at verification time.
- New tests cover every assertion source/operator, escaped/own-property JSON pointers, null versus absence, numeric-string types, unsafe integers, malformed/truncated/binary responses, Set-Cookie visibility, variable dependencies, credential forwarding guards, stop/continue/cancel, import identities, redaction, valid report JSON and JUnit escaping/counts.
- Real HTTP transport tests verify byte limits, malformed UTF-8 expansion, binary handling, redirect rejection, cancellation and permission denial before traffic. Storage tests verify optimistic conflicts, deletion protection, report retention and workspace/reset cleanup. Additive migrations from database versions 1, 2 and 3 preserve existing data, including earlier editor drafts and timed reports.
- Component/controller regressions cover keyboard controls, validation/error states, inert untrusted content, environment-row buttons, delayed-scroll dropdown dismissal and configuration locking during an asynchronous save/review.
- **All 31 actual-extension Chrome scenarios passed together on the final build**, using Chrome for Testing on Windows with `API_CATCHER_HEADLESS=1`. This covers capture/badges, current/all-tab scope, live details, search/filtering, both replay contexts, HTTP/2 pseudo-headers, field exclusions, snippets/clipboard, exports/import, persistence, root installation, fresh setup, permission failures, browser/service-worker restart, timed runs and accessibility.
- The new browser workflow captures a real local API, creates a suite, checks that review/import send nothing, extracts an integer ID into a later POST, verifies environment headers and excluded fields using the server ledger, downloads JUnit, round-trips a definition, reloads persisted data, stops on failure, cancels, recovers an interrupted checkpoint without resending, and denies traffic after permission revocation. Reviewed AI context is copied and pasted through Chrome's real clipboard.
- Light/dark lab views pass axe checks; the 640-pixel layout has no horizontal overflow and retains a usable URL field. Actual screenshots were visually reviewed, with crowded selectors, small text and a squeezed URL corrected. No page errors were reported in the checked workflows. Evidence is retained locally in `artifacts/extension-qa/`; the website's new screenshot uses only the local fixture API.
- **23 website browser tests** and **3 website-tool tests** passed. Checks include the fourth screenshot tab, current release links, local assets, mobile layouts, axe accessibility, download/support/install flows, feedback drafts and analytics opt-out/privacy boundaries.
- The exact ZIP was extracted into a new directory and passed the fresh-profile Chrome onboarding test, including native manifest loading, permission/default states, inspected Chrome extension errors and accessibility. No new permissions or runtime dependencies were added.

### Measured performance and limits

The final isolated timed benchmark started and completed all **10,000** loopback requests in **60,009.6 ms**, with **zero missed slots**, **18.909 ms approximate P95**, and a **32,582-byte report**. UI interaction completed in 72 ms. Inspector JS heap samples were 15,731,384 bytes after 1,000 requests and 14,614,196 bytes after 8,000; these do not measure the runner worker, network buffers or total Chrome memory. Surviving processes of the isolated test browser consumed 42.426 CPU-seconds over a 60.831-second sample; this is not whole-computer CPU usage. The separate 10,000-capture search completed in **927 ms** with a virtualized request list.

An earlier run overlapped another test process and sent 9,975 requests, correctly recording 25 capacity misses. The unchanged exact-count assertion failed. After the competing job finished, the complete Chrome suite was rerun in isolation and passed. No count assertion or concurrency setting was weakened. Rate, latency, CPU and memory results depend on payloads, server/network conditions and machine load; the extension does not guarantee every scheduled slot on every computer. Browser automation here was on Windows, not a claim of native macOS/Linux QA.

Build: `2026-09-17T13:38:13.286Z`. ZIP: **32 files, 1,282,349 bytes**. SHA-256: `c7db76dcb6034462abed8c9222a6c890acf96831389e016fb89fd1f1b020daaf`. Packaging verified every archived byte, both manifest layouts and **117 source-map source entries** against the final code. Suites run in an open extension tab; environments remain unencrypted local data; live AI/MCP, mocking, OpenAPI import and the rest of the roadmap are not claimed as implemented or tested.

## 0.1.6 request field controls and timed-variable guide — September 17, 2026

Header eyes, JSON/form field eyes and the whole-body eye now control what is sent, while retaining the original values in the saved editor draft. Excluded values are blurred. One shared outbound projection applies exclusions to browser replay, extension replay, timed runs and all 16 executable code generators. Display masking remains a separate lock control. Individual field controls are bounded to 300 fields, 32 levels and 1 MB; other body formats support whole-body exclusion.

- **246 unit/component/integration tests** passed, together with lint, strict TypeScript, formatting and the production build. New cases cover duplicate headers/form names, nested object and array exclusions, prototype-like keys, invalid JSON, persisted drafts, all code generators, secret-free suggestions, typed data rows and encoded form placeholders.
- The full real-extension Chrome suite passed **all 30 scenarios in one run**, using `API_CATCHER_HEADLESS=1`. The new regression captures a real local request, toggles eyes by keyboard, checks blur and saved choices after reload, and verifies the server receives only included fields in both replay contexts. It also verifies whole-body omission.
- The guided workflow inserts a placeholder from an actual field, previews the first requests without sending traffic, retains run configuration when returning to the editor and starts a three-request run with the actual server receiving the expected Ada/Lin/Ada values. Excluded headers and nested body fields remain absent throughout.
- An initial accessibility check found that scrollable preview content could not receive keyboard focus. The preview/example blocks and field list now accept focus; the unchanged axe assertions then passed. Light/dark guide screenshots, the editor controls and the 640-pixel layout were visually inspected. No page errors or horizontal overflow were observed in the checked states. Evidence is retained locally in `artifacts/extension-qa/`.
- The existing 10,000-request timed test started all 10,000 requests in 60,002.5 ms with zero missed slots, a 19.287 ms P95 and a 32,622-byte report. The independent 10,000-capture search completed in 1,347 ms. These loopback measurements are not rate guarantees or whole-computer CPU/memory measurements.
- All **23 website tests** passed with the 0.1.6 links and updated feature descriptions, including responsive layouts, accessibility, download/support interactions and analytics privacy checks.
- The exact release ZIP was extracted into a new folder and passed fresh-profile Chrome onboarding: real manifest loading, permission/default states, response capture defaults and the inspected Chrome error/accessibility checks were clean.

Build: `2026-09-17T11:22:45.281Z`. ZIP: 30 files, 1,229,023 bytes; SHA-256 `a57abfaf3b1905587cc0fa3ac83eb2fdefc0accdab876972ef4c317a1cde6da1`. Packaging verified every archived byte, both manifest layouts and 102 source-map entries against source. No new permissions or runtime dependencies were added. Timed-run variables/data rows remain in memory for the editor tab; placeholders and inclusion choices are saved in its draft.

## 0.1.5 HTTP/2 replay headers — September 17, 2026

Fixed `Invalid header name: :authority` at the shared outbound-header boundary. Captured protocol fields are retained in history/drafts but omitted from replay, timed runs and all 16 code generators. Ordinary invalid names and CR/LF/NUL injection still fail validation; warning text never includes header values. Existing editor drafts work without a data migration or recapture.

- The new regression suite first reproduced the error in 18 cases, then passed after the fix. All **218 unit/component/integration tests**, lint, strict TypeScript, formatting and the production build passed. Executable snippet tests now include captured pseudo-headers and verify real local HTTP requests.
- A real loopback HTTPS/HTTP/2 server produced `:authority`, `:method`, `:path` and `:scheme` through Chrome capture. The test opens a separate editor, edits URL/method, reloads its saved draft, replays in both contexts and verifies the server received the edited request, body and application header. Original capture headers remain unchanged. Both responses were HTTP 200; warning visibility, axe accessibility and page errors passed. The editor screenshot was visually inspected. HTTP/3 shares the field handling but was not separately exercised over QUIC.
- All **23 website tests** passed with the 0.1.5 download URLs.
- The exact release ZIP was extracted into a new folder and passed fresh-profile Chrome onboarding, including real manifest loading, permission defaults, response-capture defaults and accessibility checks.
- The full real-extension Chrome suite passed **all 29 scenarios in one run** with `API_CATCHER_HEADLESS=1`, including capture, both replay contexts, clipboard/export, persistence, permission failures, worker/browser restarts and timed runs. The final 10,000-request timed run took 60,012.2 ms with zero missed slots and a 32,802-byte report; the 10,000-capture search took 840 ms. These local measurements are not throughput guarantees.

An earlier headed full-suite attempt failed on row selection with unexpected Alt-key hints visible, then reported a closed browser context during a later runner scenario. The root cause of that desktop interaction was not established. The HTTP/2 regression itself passed in both headed attempts. The complete suite was rerun with the real extension in Chrome's supported full headless mode to isolate it from desktop input; no assertions, timeouts, permission checks or request counts were weakened, and no scenarios were skipped.

Build: `2026-09-17T10:28:41.336Z`. ZIP: 30 files, 1,205,736 bytes; SHA-256 `79270d66d1206cafa643f070a4c7baeff295342f11dbf3f04c80559387189a50`. Packaging verified every archived byte, both manifest layouts and 96 source-map entries against source. The loopback test certificate/key are public test fixtures and are excluded from the extension package; no system trust changes are made.

## 0.1.4 website URL — September 17, 2026

The extension homepage now uses `https://mihirbhadak.github.io/ApiSip/`, matching the repository website field, package homepage, README and page canonical URL. Verified HTTP 200 from the public site. The source, root build, standalone build and packaged manifests all contain this URL and version 0.1.4.

Lint, strict typecheck/production build, changed-file formatting, **23 website tests**, and fresh Chrome onboarding from the exact extracted ZIP passed. This metadata-only patch does not change the extension application logic tested in 0.1.3; that full unit/E2E suite was not repeated for a URL edit.

Build: `2026-09-17T10:14:26.217Z`. ZIP: 30 files, 1,204,537 bytes; SHA-256 `f9f03c9dca75cdb605eeba90ace97ed868d6c3e7378caca655737be2bebdfe6c`. Packaging verified every archived byte and 96 source-map entries against source.

## 0.1.3 cell filtering — September 17, 2026

- Lint, strict TypeScript, **191 unit/component/integration tests**, formatting and the production build passed. Cell-filter tests cover all populated columns, XHR aliases, exact numeric values, missing metadata, masked secrets, safe quoting, OR/NOT grouping, deduplication and expression limits.
- The final full Chrome suite passed **all 28 tests in one run**. The new regression uses genuine local XHR and fetch requests: right-click the third row's Type cell, apply its XHR rule, append a method rule, preserve an existing OR expression, double-click with details initially closed, repeat without duplicates, then filter using keyboard cell navigation. Menu accessibility and real screenshots were checked.
- The first new browser check exposed insufficient selected-row domain contrast; the color was corrected and the same accessibility assertion passed. A later broad run passed 21 scenarios but stopped in the runner fixture before its source request appeared. The unchanged runner scenarios passed separately; fixture setup now starts paused and asserts the current-tab target before emitting its source request, with diagnostics on failure. The final 28-test run passed without skips, retries or relaxed request-count assertions.
- The final capture benchmark handled 10,000 real requests with fewer than 50 rendered rows; its targeted search took 853 ms. The timed-run regression started 10,000 requests in 60,013.7 ms with zero missed slots and a 32,647-byte report. These are local measurements, not rate guarantees.
- All **23 website tests** passed for the 0.1.3 download URLs. After adding the cell-filter feature description, the five indexing/responsive/accessibility tests passed again. All package and manifest versions are 0.1.3.

Build: `2026-09-17T09:52:05.178Z`. The ZIP contains 30 verified files and is 1,204,533 bytes. SHA-256: `38752bf8da38c30af5c6622e431e323462f4bd87f3512c1c55fb124293b17a50`. Packaging verified both manifests, every archived byte and 96 source-map entries against the current sources. Extension screenshots: `test-results/visual/cell-filter-context.png` and `cell-filter-applied.png`.

The exact ZIP was extracted into a new folder and loaded by a fresh isolated Chrome profile. Its onboarding test passed: setup appeared, recording remained paused, optional access was absent, response capture defaulted on, and the inspected extension warnings/errors and accessibility checks were clean.

## Website Chrome menu guide — September 17, 2026

Replaced the clipboard installation step with **How to open extensions**, a dialog explaining Chrome's menu route. A real link click from an HTTPS test origin in installed Google Chrome 152.0.7977.83 remained on the website and logged `Not allowed to load local resource: chrome://extensions/`. This agrees with [Chrome's documented restriction](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked); the website cannot directly open the internal page.

All **23 website browser tests**, lint, strict typecheck, changed-file formatting and the static production build passed. The new guide is checked at 1440 and 320 pixels for keyboard activation, focus restoration, Escape/outside/button dismissal, no overflow, no clipboard dependency and no axe violations. Menu instructions remain available without JavaScript. Existing downloads, support popups, feedback, analytics privacy and responsive checks passed. Screenshots were visually reviewed at both guide sizes. The new `install_menu_guide` event measures help opens, not completed installations. This website-only change does not rebuild or modify the extension ZIP.

## 0.1.2 capture and usability fixes — September 17, 2026

- Lint, strict TypeScript, all **180 unit/component/integration tests**, production build and formatting passed. Tests cover optional API absence before approval, synchronous subscription after approval, permission changes, serialized recording toggles, icon paths, XHR aliases, bounded/redacted suggestions, Enter submission, update caching/dismissal and inert release-note rendering.
- All **27 real Chrome extension E2E tests** passed. Fresh unpacked installation opens setup with no host grants, no webRequest namespace and recording paused; response capture defaults on. Root-folder installation and toolbar opening passed. Chrome's inspected runtime-error/install-warning lists were empty in fresh setup. Tests also cover genuine traffic, response bodies, replay, exports/import, browser restart, permissions revoked during capture/run, and persistence.
- Passive restart regression: terminate the worker, immediately generate a real API request without warming the worker through a UI message, and verify that request is stored. The initial async-only registration failed this test. Moving webRequest to an optional API requested together with its hosts enables synchronous registration when Chrome exposes the approved namespace; the regression now passes.
- Recording continues after clear-history and captures the next genuine XHR. Clearing all data atomically preserves capture state while creating replacement entities; a concurrent-reader integration test verifies no intermediate paused/missing settings. Archive still intentionally pauses an active archived session.
- XHR and XMLHttpRequest expressions, suggested values, Enter application and release-popup dismissal passed in real Chrome. The future-release popup uses an explicitly labeled test release fixture; capture traffic is not mocked. A separate live check retrieved the real GitHub v0.1.1 release successfully before publication of 0.1.2.
- The large-session test captured and persisted 10,000 completed local API requests, kept rendered rows below 50 and matched the final search in 833 ms in this run. The independent timed-run test started 10,000 requests over 60,011.7 ms with zero missed slots; its report was 32,612 bytes. These are local lab results, not throughput guarantees for other computers/APIs.
- Visual review covered setup at desktop/mobile sizes and the release notice, with automated accessibility checks. Update links were subsequently styled as buttons and setup text clarified for an unassigned Chrome shortcut; the affected browser tests are repeated on the final build.
- All **22 website browser tests** and **3 download-counter tests** passed with the v0.1.2 download links and revised installation guide. Existing GoatCounter privacy/opt-out, feedback, support popup and installation-scroll tests remain green.
- **Manual verification boundary:** the native Windows automation pipe was unavailable. Native permission-dialog approval/denial and actual OS-level accelerator dispatch were not exercised in this run. Component tests cover grant/deny/error callbacks; Chrome tests use a previously user-authorized isolated baseline, test revocation, and verify command registration plus the actual-assignment/unassigned UI. No profile permission files were edited to fake approval. Chrome may leave shortcuts unassigned; configure Alt + Shift + C at `chrome://extensions/shortcuts`.

The final build is `2026-09-17T06:28:46.730Z`. Its repeat passed the first 24 scenarios, then the isolated browser closed unexpectedly after the local server observed 3,210 requests during the timed benchmark; no page JavaScript error was recorded. This attempt is not counted as a passing benchmark. The unchanged seven-test runner suite was rerun successfully, including 10,000 starts in 60,015 ms, zero missed slots and a 32,652-byte report. Together with the other 20 scenarios, all 27 scenarios passed on the final build. No assertion was relaxed to obtain that result.

`scripts/package-extension.py` verified all 30 packaged files, both installation manifests, HTML/icon/worker assets and 95 source-map source entries. The ZIP is 1,198,338 bytes; SHA-256: `1e248e384d9efab05ddf8f0eec78fed55f67a6ed0fd876cec37dc04ff885f09e`. That exact ZIP was extracted into a new folder and loaded by a fresh Chrome profile; the onboarding, optional permission/API absence, response default, accessibility and Chrome error-list checks passed. The earlier 27-test full run and later targeted checks are retained as distinct verification attempts.

### Public 0.1.2 delivery verification

[GitHub Pages deployment 35190716305](https://github.com/mihirbhadak/ApiSip/actions/runs/35190716305) succeeded for the updated installation page. A real Chrome download from the public website returned `apisip-0.1.2.zip` with the exact 1,198,338-byte size and SHA-256 above. The creator/support dialog opened, Escape exposed and focused the installation guide, and the configured coffee link was correct. Public assets returned HTTP 200. Tested 1440/768/390/320-pixel layouts had no horizontal overflow, no axe violations and no page JavaScript errors. Report: `artifacts/site-qa/real-download.json`. This is a delivery/interaction verification, not a new Lighthouse or external-validator score.

Historical reports below describe their own release/build, not this one.

## GoatCounter activation, September 17, 2026

Configured the owner's supplied endpoint, `https://mihirbhadak.goatcounter.com/count`, for the public website only. The generated footer now discloses GoatCounter and exposes the persistent opt-out control. No analytics script or endpoint was added to the Chrome extension.

- `npm run test:site`: **22 browser tests passed**. Two additional tests exercise the actual generated website at its production origin, substituting only provider/download transports. They verify the real configured endpoint, one pageview, one event per download CTA, installation scrolling, privacy-safe outgoing fields, persistent opt-out and opt-in/opt-out synchronization across tabs.
- The cross-tab regression first failed: opting in updated the second tab's button but did not start its previously disabled collector. The storage-event handler now starts it, and the regression passes without a reload.
- `npm run check`: lint, strict TypeScript, **151 unit/component/integration tests**, and the production extension build passed. `npm run test:site-tools`: **3 tests passed**. `npm run format:check` and `git diff --check` passed.
- Site build: **82,119 bytes HTML**, including **28,987 bytes inline CSS**, and **9,147 bytes deferred JavaScript**, before compression. No third-party JavaScript is loaded. Existing website tests cover responsive layouts, accessibility, feedback drafts, metadata, downloads and blocked analytics.

The counting transport in automated regression tests is intentionally intercepted, so these test totals are not evidence of live account ingestion. The private dashboard redirects unauthenticated visitors to sign-in; account statistics require the owner's authenticated review.

### Live activation verification

GitHub Pages [deployment 35183541834](https://github.com/mihirbhadak/ApiSip/actions/runs/35183541834) succeeded for commit `dfcb841`. A fresh Chrome session checked the actual public page and real provider at **2026-09-17 04:53 UTC**, with no substituted network responses:

- `/ApiSip/`, `download_hero` and `install_view` each reached `https://mihirbhadak.goatcounter.com/count` and returned **HTTP 200, image/gif**. The allowlisted attribution was `campaign:github/launch`. Requests contained no raw query field, Referer header or cookies, and correctly included the WebDriver bot marker `b=153`.
- The real `apisip-0.1.1.zip` download completed: **1,180,961 bytes**, SHA-256 `15c9bf597b3c611722f70ea4ec3a67e5f3978ced8fe4c1791d397147445da2b9`. The creator/coffee dialog appeared, the installation guide scrolled into view, and closing the dialog focused its heading.
- Opting out persisted after reloading the public page, with **no additional counting request**. No page JavaScript errors or failed counting requests occurred.
- Live axe checks at **1440, 390 and 320 pixels** found zero violations in the tested state and no horizontal overflow. Desktop/mobile screenshots of the activated privacy notice and opt-out control were visually reviewed.

Evidence is saved locally in `artifacts/site-qa/analytics-live.json` and `analytics-live-*.png`. This proves real transport and website behavior, **not private dashboard ingestion**. GoatCounter may exclude automated traffic from ordinary visitor totals; no bot detection was bypassed. The owner can confirm visible statistics after a normal browser visit and sign-in using [WEBSITE-GUIDE.md](WEBSITE-GUIDE.md#1-view-and-manage-website-analytics).

The first analytics-enabled Lighthouse run returned a page-load timeout warning despite receiving HTTP 200 from the collector. A focused real-browser reproduction showed the unconsumed fetch still pending after five seconds. Reading an opaque `no-cors` response did not fix it, and removing `keepalive` did not fix it. Switching to the provider-supported CORS response **and consuming its 43-byte GIF** completed the request. The implementation now does both, retaining omitted credentials, the no-referrer policy, asynchronous delivery and failure isolation. Transport fixtures include the provider's `Access-Control-Allow-Origin: *` header; generated-site tests also wait for counting requests to finish. The earlier warning-bearing report is retained as `artifacts/site-audit/lighthouse-analytics-enabled.report.*`, not presented as a clean performance result.

The fix deployed successfully in [run 35184194454](https://github.com/mihirbhadak/ApiSip/actions/runs/35184194454), commit `ee37f01`. The final real-browser repeat at **05:03 UTC** verified the updated `web-site.3680341ea9.js` bundle: all three counting requests returned HTTP 200 **and emitted request-finished events**. The real ZIP checksum, support dialog, installation focus, persistent opt-out, accessibility and absence of page errors passed again.

The final mobile Lighthouse 13.4.1 run at **2026-09-17 05:03:59 UTC** scored **100 performance / 100 accessibility / 100 best practices / 100 SEO**, with **no run warnings**. FCP 1.3 s, LCP 1.4 s, TBT 0 ms, CLS 0.05, Speed Index 1.3 s. Its analytics request finished with HTTP 200 and transferred 382 bytes including response headers. The automated browser explicitly exposed its automation flag so metrics identify it as bot traffic. Reports: `artifacts/site-audit/lighthouse-analytics-fixed.report.*`. These are local Lighthouse lab results against the deployed site, not a new Google-hosted PageSpeed report or a guarantee for all visitors.

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

At the time of this initial audit, GoatCounter integration was prepared but **not active**: the owner had chosen a setup guide and had not yet supplied an endpoint. That historical status is superseded by the September 17 activation verification above. Tests for the initial audit substituted the provider transport and could not prove an unconfigured analytics account received data. The guide explains privacy controls, Search Console ownership verification, GitHub cache-header limitations and the distinction between click events, release download counters and installs.

A final inspection of GoatCounter's upstream script found its implicit `q=location.search` field. Before activation, the integration was changed to use the documented `/count` protocol directly, without loading the third-party script. The regression test now inspects actual outgoing browser request URLs and headers at a stubbed endpoint, ensuring the query string, arbitrary event values, Referer header and cookies are absent. The pre-initialization queue stays bounded at 20 events; blocked requests are contained. All 20 site scenarios, lint and strict TypeScript passed again after this change.

### Public deployment follow-up

- GitHub Pages deployment [35124627760](https://github.com/mihirbhadak/ApiSip/actions/runs/35124627760) succeeded. The actual public page returned HTTP 200 with the new publisher/social metadata and optimized assets. Its `Cache-Control` remains `max-age=600`.
- The public URL checked by W3C Nu returned **zero messages**. The CSS3-profile service returned the same eight unsupported-property messages documented above; it is not reported as a clean CSS validation.
- A fresh Chrome session checked the public page at 1440, 768, 390 and 320 pixels with no overflow or axe violations in the tested states. Showcase tabs, real release download, support dialog, installation scrolling and focus all worked. The downloaded ZIP again matched SHA-256 `15c9bf597b3c611722f70ea4ec3a67e5f3978ced8fe4c1791d397147445da2b9`. No page JavaScript errors occurred.
- [Record release downloads run 35124607783](https://github.com/mihirbhadak/ApiSip/actions/runs/35124607783) succeeded on GitHub's hosted runner and committed a second real snapshot. This verifies workflow execution, API access and history persistence; future scheduled runs still depend on GitHub's scheduling and repository settings.
- Fresh Lighthouse 13.4.1 mobile lab audit against the deployed HTTPS site: **100 performance, 100 accessibility, 100 best practices, 100 SEO**. FCP 1.3 s, LCP 1.4 s, total blocking time 10 ms, CLS 0.05. The render-blocking insight had no requests. Cache-lifetime estimated waste was 33,632.5 bytes (32.8 KiB); image-delivery estimated waste was 27,768 bytes (27.1 KiB). The audit selected the 960-pixel screenshot for its higher-density emulated mobile screen; normal 1× mobile selection was independently tested at 480 pixels. We retain higher-density variants for readable UI text, so an image-sizing estimate can remain.
- The fresh PageSpeed API request returned HTTP 429 with an exhausted shared daily quota. The Lighthouse result above is **not** misrepresented as a new Google-hosted PageSpeed report. The user's older report is historical and needs a new run in PageSpeed to reflect this deployment.

Local artifacts: `artifacts/site-audit/lighthouse-after.report.*`, `html-live-after.txt`, `css-live-after.txt`, `pagespeed-api-after.json`, `visual/*`, and `artifacts/site-qa/real-download.json`. Scores and measurements are one lab run, not a guarantee for every visitor.

The final analytics-transport revision deployed successfully in [run 35125536444](https://github.com/mihirbhadak/ApiSip/actions/runs/35125536444). A fresh live Lighthouse run at **2026-09-17 04:30 UTC** scored **99 performance / 100 accessibility / 100 best practices / 100 SEO**, with FCP 1.3 s, LCP 1.4 s, TBT 0 ms, CLS 0.05 and Speed Index 2.5 s (`artifacts/site-audit/lighthouse-final.report.*`). This later result is retained alongside the earlier 100-performance run rather than selecting only the higher score. The final repeat call to Nu encountered a Cloudflare human-verification page; the earlier successful public validation with zero messages remains the last completed Nu result. The intervening generated HTML change only switched the hashed JavaScript filename.

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
