# Development

## Prerequisites

- Node.js 22.12 or newer and npm; the lockfile records tested package versions.
- Chrome 125 or newer for flat debugger child sessions. Browser automation uses Playwright's Chrome for Testing.
- Python, Go, Git Bash, and Windows PowerShell for the executable snippet tests on Windows. JavaScript tests run through Node. Other languages have representative generator tests; see TESTING.md for verification boundaries.

## Commands

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:authorize
npm run test:e2e
npm run format:check
python scripts/package-extension.py
npm audit
```

`npm run check` runs lint, TypeScript, unit/component/integration tests, then the production build. Browser E2E is a separate step and uses the **current dist build**. Rebuild before running it.

Set `API_CATCHER_HEADLESS=1` to run the same extension tests in Chrome's full headless mode without desktop input interference (`$env:API_CATCHER_HEADLESS='1'` in PowerShell). No assertions or permission checks are skipped; the tests still load the real extension using Playwright's `chromium` channel and clone the previously authorized isolated test profile. Leave it unset for visible browser QA. The HTTP/2 regression starts a loopback HTTPS server with the [public test certificate](tests/fixtures/README.md), without changing system trust.

`python scripts/package-extension.py` verifies manifest/HTML assets, source-map source freshness and every ZIP byte, then writes a versioned ZIP and SHA-256 file under `artifacts/`. Requires Python 3.9+. Always build and test first; select the extracted ZIP root in Chrome, not its `assets` subfolder.

The Vite development page helps with UI work; Chrome capture APIs require loading the repository root or `dist` as an unpacked extension after building. There is no popup. The toolbar icon opens or focuses `inspector.html`.

## Extension workflow

1. Build, load the repository root (or the standalone `dist` folder) through `chrome://extensions`, and pin ApiSip. The root manifest is generated from `public/manifest.json`; edit that source manifest, not a generated manifest.
2. Review the automatically opened setup page and click **Allow website access** to request optional HTTP(S) access. Continue without capture is also available.
3. Open an HTTP(S) page, then start capture. New installs default to response capture and Chrome shows a debugger notice; the response switch selects passive mode instead. Alt + Shift + C toggles recording from browser pages (customize at `chrome://extensions/shortcuts`).
4. Rebuild and reload the extension card after source changes. Reload the inspector too.
5. Inspect the extension service worker through its extension card for development diagnostics. Do not log bodies or credentials.

## Local network laboratory

```sh
npm run test:server
```

Open `http://127.0.0.1:4177`. The server provides users CRUD, JSON, URL-encoded/multipart forms, GraphQL, cookies, headers, redirects, slow responses, HTTP errors, large payloads, malformed JSON, HTML/XML/binary data and a WebSocket echo route. All fixtures run locally.

## Code layout

| Directory        | Responsibility                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `src/background` | Chrome event registration, scope, commands, badge and lifecycle                                    |
| `src/capture`    | Provider contract, webRequest observer, CDP adapter and event sequencing                           |
| `src/storage`    | IndexedDB schema, transactional repositories and atomic imports                                    |
| `src/shared`     | Domain schemas, parsing, redaction, diffing and statistics                                         |
| `src/filters`    | Expression parser and compiled predicate engine                                                    |
| `src/replay`     | Context selection, fixed fetch executor and result normalization                                   |
| `src/runner`     | Paced scheduler, worker host, templates, streamed measurements, bounded statistics and reports     |
| `src/lab`        | Test definitions, assertions, JSON Pointer extraction, sequential execution, transport and reports |
| `src/export`     | Versioned formats and code generators                                                              |
| `src/ui`         | React inspector, search worker, controller and focused components                                  |
| `tests`          | Domain, components, repositories, executable snippets, browser tests and local server              |

Keep Chrome API access in adapters. Domain functions should remain independently testable. Message payloads are defined and validated in `shared/messages.ts`; avoid adding untyped message strings.

## Data migrations

ApiSip was previously named API Catcher. The internal `api-catcher` database name, run-report format identifier and `API_CATCHER_CHROME` test override remain stable for compatibility. Visible branding and download filenames use ApiSip. Reloading the extension from the same installation folder preserves its identity and local history; moving the unpacked folder creates a separate Chrome extension identity.

IndexedDB is version 4: additive migrations introduce persistent editor drafts (v2), timed run reports (v3), and Test lab suites/environments/reports (v4), preserving history and settings. JSON capture backup format remains version 1 and excludes drafts, timed runs and lab data. Runner report JSON and Test lab suite JSON have their own version-1 formats. These are independent formats. A database change must increment the IndexedDB version and add an additive migration in `storage/database.ts`. A backup format change must introduce explicit version parsing/migration; unknown versions are currently rejected. Do not clear user history to make a migration pass. `tests/editor-drafts.test.ts` and `tests/runner-storage.test.ts` exercise upgrades from genuine earlier schemas using fake-indexeddb, including preserved draft revisions and settings.

## Working on Test lab

See [TEST-LAB.md](TEST-LAB.md) for a two-step example against the real local API server. `src/lab/engine.ts` receives a transport; assertions/templates stay testable without Chrome. `src/lab/transport.ts` is the page-owned Chrome/fetch adapter. `src/storage/lab.ts` owns transactions and revisions. React only holds the selected suite and compact library/report data. Do not add executable scripts to assertions or persist extracted response values in reports.

Run `npx vitest run tests/lab.test.ts tests/lab-storage.test.ts tests/lab-components.test.tsx tests/lab-transport.test.ts` for focused checks, then build and run `npx playwright test tests/e2e/test-lab.spec.ts`. The browser test uses genuine CDP capture, real extension fetch and the test server's bounded `/api/suite-stats` ledger to verify typed chaining, omissions, stop behavior and inert review/import. The lab page deliberately requires an open tab; do not conflate its interruption behavior with the separate offscreen timed runner.

## Working on the timed runner

`offscreen.html` is a production entry alongside the inspector and service worker. The host spawns the Vite-bundled `runner.worker` asset. Paths must work under both root and standalone-dist installation. Keep scheduling, templates, measurement and analytics independently testable; Chrome permission and lifecycle calls belong in `background/runner.ts`.

Run `npx vitest run tests/runner.test.ts tests/runner-storage.test.ts tests/runner-transport.test.ts tests/runner-components.test.tsx` for focused checks. Transport tests use a real Node HTTP server. After building, `npx playwright test tests/e2e/runner.spec.ts` loads the actual extension and sends loopback requests, including 10,000 starts over one minute. Tests verify the server ledger, not merely UI counts. `/api/load/<id>` accepts delay/bodyDelay/status/size test parameters; `/api/load-stats?id=<id>` exposes bounded fixture evidence. These endpoints exist only in the development test server.

The Chrome benchmark samples the inspector's JS heap through CDP and CPU time of surviving processes in the isolated test browser. These diagnostics are test-only, not permissions or monitoring shipped to users. The heap sample covers the inspector isolate, not the dedicated runner worker or Chrome network buffers; neither metric measures whole-computer resources. Keep heavy tracing separate when interpreting performance numbers, and never automatically benchmark arbitrary remote APIs.

## Browser test isolation

Run `npm run test:authorize` once. It opens the isolated `.browser-profile` baseline and asks you to approve Chrome's normal site-access prompt. Close any earlier test browser before authorizing. This baseline is never your personal browsing profile.

Each E2E run clones that authorized baseline into a new `.tmp/browser-test-*` directory, clears extension fixture data through the product UI, and uses genuine Chrome network events. It restarts Chrome with the same run profile to verify persistence, then revokes permissions only in that clone. Browser History, service-worker code caches and rendering caches are excluded from cloning: reusing them exposed a native download crash and stale worker code during development. No captured events or permission results are fabricated.

The fresh-root installation test waits for Chrome to register the action listener before its first automated click, then verifies a subsequent click wakes a stopped worker without that readiness wait. An enabled extension registry entry alone is not used as proof that initial worker setup has finished. Lifecycle tests close the exact extension service-worker target with CDP `Target.closeTarget`, assert that target disappears, then verify a worker runs again and handles the requested action. Chrome may reuse the target ID after restart. This follows [Chrome's termination-testing guide](https://developer.chrome.com/docs/extensions/how-to/test/test-serviceworker-termination-with-puppeteer); sending a generic stop command without proving termination is insufficient.

The test compares the live worker build identifier with `dist/build-info.json` before acceptance checks. A mismatched UI and worker also produce an actionable reload error in the product.

Tests run headed. Toolbar activation uses Chrome's `Extensions.triggerAction` automation command with `--enable-unsafe-extension-debugging` over Playwright's local debugging pipe, solely in the test profile. This switch is not part of the extension or normal installation. It does not grant host access; the baseline still needs the normal authorization step. See [Chromium's action implementation](https://github.com/chromium/chromium/blob/main/chrome/browser/devtools/protocol/extensions_handler.cc).

Screenshots, actual clipboard round trips and downloaded exports are produced under `test-results`; the HTML report is in `playwright-report`. Generated profiles contain only local fixture content and are ignored by Git. The test writes fixture data to the system clipboard.

Set `API_CATCHER_CHROME` to an absolute Chrome for Testing executable path to select another installed browser binary. The default is Playwright's bundled Chromium/CFT. Branded Chrome may reject extension-loading command-line flags, so use Chrome's unpacked-extension UI for normal installation.
