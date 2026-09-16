# ApiSip architecture

## Repository assessment

The supplied directory was empty (including hidden files) and was not a Git repository. There was no stack, manifest, source, configuration, test suite or commit history to preserve. This implementation starts a TypeScript/React/Vite Manifest V3 extension.

## Capture decision

Two adapters implement the same capture-provider contract. The inspector only reads normalized records from IndexedDB and sends typed commands to the background worker.

- **WebRequestProvider** observes permitted HTTP(S) request metadata, available upload data, headers, redirects, completion and errors. It cannot expose response bodies.
- **DebuggerProvider** optionally attaches through `chrome.debugger`, uses CDP Network events and `Network.getResponseBody`, and records available timings, cache information and WebSocket frames. Metadata observation is suppressed per attached tab to avoid double counting. Child iframe/worker targets use flat CDP sessions.
- No page fetch monkey patches, interception, proxy server or remote collection service.

Capture starts only after the user grants optional HTTP(S) host access. Chrome forbids optional debugger permission, so it is declared at install time; actual debugger attachment remains opt-in and off by default. Current tab means the most recently active supported web tab; opening the inspector does not change that target. All tabs means permitted web tabs, never internal browser pages or other extensions. The observer remains available when debugger attachment fails.

## Persistence and lifecycle

IndexedDB stores indexed request summaries separately from bodies and replay results. Atomic transactions preserve summary/body consistency. Workspace, session, collection, saved-filter and settings records also live in IndexedDB. Durable capture records allow subsequent events to resume after worker restart. Listeners register synchronously at worker evaluation, before asynchronous initialization. Counts come from stored records; notification and badge writes are throttled. Display refreshes slow from 200 ms to 1 second while more than 200 capture writes are queued. UI state reads and badge updates each allow only one active operation plus one coalesced trailing refresh, preventing concurrent refresh backlogs from competing with capture. The UI reconnects through request/response messaging and database change notifications.

## Trust boundaries

Network and imported content is untrusted text. No captured HTML rendering, scripts, eval or dynamic code execution. Import schemas and command payloads are validated. Replay uses a fixed, bundled fetch function in an isolated tab world or the extension worker. Only HTTP(S) URLs are accepted. Restricted headers are removed with a visible explanation. Browser replay respects the page's CORS and cookie rules. It never automatically retries in another context.

## Sources checked September 15, 2026

- [Chrome webRequest API](https://developer.chrome.com/docs/extensions/reference/api/webRequest)
- [Chrome permission API and non-optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome debugger API and child targets](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [Extension worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [CDP Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- [Extension cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Offscreen documents and the WORKERS reason](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Playwright extension testing](https://playwright.dev/docs/chrome-extensions)

See README and TESTING for implemented behavior, limitations and verification evidence.

## Request pipeline

```text
Chrome observer/CDP events
  -> provider-specific normalization and per-request sequencing
  -> transactional request summary + body writes
  -> throttled database-changed message and persisted-count badge
  -> inspector search worker reads indexed summaries
  -> filtered summaries enter the virtualized table
  -> selected body/replay history loads on demand
```

Redirect hops receive separate stable record IDs. An indexed provider key binds later events to the current hop. A browser-lifetime epoch separates Chrome request identifiers across browser restarts. Closed tabs mark pending records interrupted; unavailable data is represented explicitly rather than filled with invented values.

CDP extra-info headers supplement primary events when ordering can be attributed reliably. Redirect chains retain primary-event headers because extra-info order is not sufficient to promise exact attribution. Header pairs preserve duplicate values exposed by Chrome. Body buffers are bounded. WebSocket message count and payload length are separately bounded.

## Storage and concurrency

`requests` indexes workspace, session, timestamp, tab, method, status, domain and capture key. `bodies` holds upload/download payloads, replay results and WebSocket messages. Entity indexes support workspace and entity-kind queries. Capture and request mutations read and write both stores in one transaction. Import includes entities in that transaction; a failed import does not leave half a workspace behind. Bulk save operations use chunks of 200.

Capture callbacks serialize preparation per request, preserving event order without serializing all network traffic. Passive events enqueue their ordered mutations without waiting for the previous durable commit; this lets a fast request's start, headers and completion share a transaction. Debugger operations that need a committed result retain the awaitable update API. A write buffer batches independent mutations for up to 8 milliseconds and 100 independent request keys per transaction. All queued events for those keys are grouped together, preserving their per-request order. Independent keyed reads run concurrently, ordered mutations produce a final value per record, and all writes commit together. Callers resolve only after the atomic commit. This avoids serial IndexedDB round trips creating a large response-update backlog during bursts. The IndexedDB transaction is the consistency boundary across the worker and multiple inspector pages. Four replays can execute globally, and only one replay per original request executes at a time. Replay history is bounded to 30 results.

Settings and counts are reconstructed from IndexedDB after worker restart. Event listeners register at top level. The background worker uses a Chrome session-storage epoch, not a permanent in-memory identity. Debugger reconciliation attempts to reuse an owned active session before attaching anew. UI errors and diagnostics are bounded, and diagnostic text avoids payloads.

## Filtering and rendering

### Dedicated editor tabs

The same built HTML entry supports `#/editor/<draft-id>`. It mounts `EditorPage` instead of the inspector, reusing `RequestEditor`, `ReplayResults`, theme tokens and the existing typed replay executor. Both root-folder and standalone-dist installations resolve this route relative to their actual HTML entry. Toolbar activation and the typed Open inspector command share a coalesced background action. It finds the dashboard through [runtime.getContexts](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getContexts), excluding editor routes without the broad tabs permission. Chrome may omit tab URLs before host access is granted, so URL-filtered `tabs.query` is not reliable for discovering our own pages on a fresh install.

IndexedDB version 2 adds a `drafts` store indexed by source request ID through an additive migration. A draft contains an editable request snapshot, replay context, revision and timestamp, without duplicating the source response or replay history. The editor loads only its draft and source record. Capture notifications check existence and settings; replay notifications refresh the relevant history. No request table, search worker or complete body database is mounted in an editor tab.

Draft writes coalesce for 250 ms and commit serially. Revision checks inside read/write transactions reject stale writes from duplicated tabs. Send and Save as new flush pending edits first; before-unload warns while changes remain unsaved. Incomplete URL/body edits may be stored, but requests must pass validation before execution or saving as a new API. Each Open in new tab action creates an independent draft, and failures to create the tab remove that draft. URLs contain only opaque draft identifiers.

Explicit source deletion removes related drafts transactionally. Automatic retention and navigation cleanup protect draft sources, with a second check in the deletion transaction to avoid racing a newly opened editor. Discarding a draft preserves its source and replay history. Replay concurrency is reserved before any asynchronous source lookup, so two editor pages cannot start the same request simultaneously. Backup JSON remains version 1 and excludes drafts; Save as new request creates an exportable saved API.

### Inspector queries

The expression parser produces an AND/OR/NOT tree. Compilation orders inexpensive metadata predicates before body predicates where boolean semantics permit. Regex syntax is deliberately restricted to avoid catastrophic backtracking. Body-dependent filtering hydrates records only after metadata preconditions pass. Debounced search runs outside React in a worker; revision IDs suppress obsolete results. A scheduler coalesces data refreshes without cancelling every in-flight query during sustained traffic. A changed user query preempts older work.

The table renders the visible range plus overscan, with fixed-height rows. React retains summary data and the selected full record, not every response body. Sorting and analytics operate on available metadata. Percentile thresholds avoid presenting P95/P99 from tiny samples. Endpoint grouping is a view; original URLs remain intact.

## Extension boundaries

### Timed runner

```text
Editor draft -> validated plan -> service-worker control adapter
  -> bundled offscreen.html (WORKERS reason)
  -> dedicated runner Web Worker
  -> paced fetch + streaming byte counter + bounded statistics
  -> coalesced IndexedDB checkpoints and throttled snapshots
  -> editor analytics / dashboard run monitor / report exports
```

The offscreen document supplies a supported worker host independent of an open editor. It uses only `chrome.runtime`; the service worker owns permissions, lifecycle and offscreen creation/discovery. Global serialized controls and a host worker reservation prevent overlapping runs, including while aborted fetches drain and final storage commits finish. No artificial service-worker keepalive is used. A sleeping/restarted service worker rediscovers the active host through `runtime.getContexts`. The host and worker terminate when idle. Startup failures and an unresponsive worker produce a bounded error instead of an indefinite pending start.

The scheduler computes each slot from the integral of a uniform or linear-ramp rate. A deadline margin of at most 1% of the window, capped at 50 ms and the allowed start delay, accommodates normal timer granularity without starting requests after the window. Peak-rate validation includes that margin. It stores no per-slot task array. One scheduler timer, a bounded controller set and at most eight launches per tick prevent queue growth. Expired slots and slots beyond concurrency are counted and dropped. Eligible late slots remain as an integer cursor, and subsequent ticks process at most eight at a time within the chosen delay tolerance. There is no per-slot queue allocation or automatic retry. `stopping` stays active until outstanding fetches settle; terminal outcomes are persisted before the host releases its worker reservation. Timeouts include browser queueing and body reads. Streaming bodies are discarded immediately; status/latency checks run on measured outcomes. Redirects are blocked and an enabled 429 limit cancels the response at headers.

Templates compile before any traffic. Validation covers every supplied data row, fixed HTTP(S) origin, restricted headers, native header syntax, request/plan byte budgets, bounded JSON nesting and placeholder counts. Rendering uses data substitution, never executable code. Static bodies are reused; preflight row validation avoids constructing a body for every row. URL/form values are encoded, JSON scalar types preserved, and substitution cannot move credentials to another origin. Runs omit ambient cookies and require current target host access.

IndexedDB **version 3** adds a `runs` store indexed by `sourceId`, `createdAt` and `state`, preserving version-1 history and version-2 drafts. Each report includes aggregate timings, counts, fixed distributions, at most 241 timeline buckets, 100 recent samples and 20 initial failures. Five 1,024-bin histograms use about 20 KiB for their counters, independent of request count. Periodic worker publications are at most twice per second, plus state transitions; UI polling is coalesced at one second and checkpoints at approximately two seconds. Only the latest 50 terminal reports are retained globally. The observer rejects negative-tab-ID events before preparing mutations so extension runner traffic does not enter capture storage or badges.

Automatic retention protects active source requests; explicit source/session/workspace/history deletion removes reports in the same transaction and signals Stop. Checkpoint transactions verify both source and report still exist, preventing resurrection. Lost hosts leave active checkpoints marked interrupted, without fabricated cancellations or automatic replay. Report JSON uses its own schema version 1; capture backup format remains version 1 and excludes drafts and run reports. Reports omit bodies, headers, variable data and full URLs. In-memory execution plans last only for the run; original editable drafts retain their existing local-storage behavior.

Fetch does not reliably expose isolated DNS/TCP/TLS, wire TTFB, compressed transfer bytes, server processing or whole-computer CPU/RAM. UI measurement labels explicitly distinguish headers received, body read, total attempt duration and scheduler delays. Approximate quantiles use bounded logarithmic bins with roughly 2% relative precision and minimum sample thresholds. Browser/OS scheduling, network pools, sleep and payloads can prevent the planned rate; missed starts are part of the report.

A content-script capture provider is intentionally absent: monkey-patching fetch/XHR misses traffic and changes page behavior. The provider interface permits another officially supported mechanism in the future without coupling React to it. Interception, response overrides, secrets vaults, cloud sync, remote collaboration, OpenAPI/Postman conversion and unlimited capture are outside the implemented scope.

## Unpacked installation layouts

`public/manifest.json` is the canonical source manifest. Vite copies it to `dist` and also generates a root `manifest.json` whose worker and icon paths point into `dist`. The worker resolves the inspector beside its own manifest entry. Both repository-root and standalone-dist installations therefore use the same compiled code, CSP and permissions. A real-Chrome regression test loads the repository root and invokes the toolbar action to check this path.

## UI interaction primitives

Searchable comboboxes keep focus on the input and identify the active option through ARIA. Menus use roving focus and dismiss on outside interaction, Escape or selection. Both use a shared native top-layer popover that works inside clipped panes and modal dialogs. Resizing and scrolling cannot leave a detached menu behind.

Section tabs support arrow navigation. Global shortcuts, the help reference and modifier-hold hints share one registry. Text editing and dialogs retain their own keys. A cancellable one-second timer reveals hints without moving focus. Help content and creator details are bundled locally without remote widgets. Bulk selection uses filtered record IDs independently of rendered table rows.
