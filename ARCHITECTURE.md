# API Catcher architecture

## Repository assessment

The supplied directory was empty (including hidden files) and was not a Git repository. There was no stack, manifest, source, configuration, test suite or commit history to preserve. This implementation starts a TypeScript/React/Vite Manifest V3 extension.

## Capture decision

Two adapters implement the same capture-provider contract. The inspector only reads normalized records from IndexedDB and sends typed commands to the background worker.

- **WebRequestProvider** observes permitted HTTP(S) request metadata, available upload data, headers, redirects, completion and errors. It cannot expose response bodies.
- **DebuggerProvider** optionally attaches through `chrome.debugger`, uses CDP Network events and `Network.getResponseBody`, and records available timings, cache information and WebSocket frames. Metadata observation is suppressed per attached tab to avoid double counting. Child iframe/worker targets use flat CDP sessions.
- No page fetch monkey patches, interception, proxy server or remote collection service.

Capture starts only after the user grants optional HTTP(S) host access. Debugger permission and attachment are separately opt-in. Current tab means the most recently active supported web tab; opening the inspector does not change that target. All tabs means permitted web tabs, never internal browser pages or other extensions. The observer remains available when debugger attachment fails.

## Persistence and lifecycle

IndexedDB stores indexed request summaries separately from bodies and replay results. Atomic transactions preserve summary/body consistency. Workspace, session, collection, saved-filter and settings records also live in IndexedDB. Durable capture records allow subsequent events to resume after worker restart. Listeners register synchronously at worker evaluation, before asynchronous initialization. Counts come from stored records; notification and badge writes are throttled. The UI reconnects through request/response messaging and database change notifications.

## Trust boundaries

Network and imported content is untrusted text. No captured HTML rendering, scripts, eval or dynamic code execution. Import schemas and command payloads are validated. Replay uses a fixed, bundled fetch function in an isolated tab world or the extension worker. Only HTTP(S) URLs are accepted. Restricted headers are removed with a visible explanation. Browser replay respects the page's CORS and cookie rules. It never automatically retries in another context.

## Sources checked September 15, 2026

- [Chrome webRequest API](https://developer.chrome.com/docs/extensions/reference/api/webRequest)
- [Chrome debugger API and child targets](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [Extension worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [CDP Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- [Extension cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Playwright extension testing](https://playwright.dev/docs/chrome-extensions)

See README and TESTING for implemented behavior, limitations and verification evidence.
