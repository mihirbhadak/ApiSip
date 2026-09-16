# Privacy and security

## Local data

ApiSip stores captured requests, available bodies, replay history, editor drafts, timed run reports, workspaces, sessions, collections, saved filters and settings in IndexedDB inside the extension's Chrome profile. Table preferences use localStorage. A random browser-lifetime identifier uses chrome.storage.session to prevent capture-key collisions.

Editor tabs automatically persist edited URLs, headers, bodies and replay context locally, including unfinished edits and credentials. Their URLs contain only a random draft ID. Drafts have the same unencrypted storage boundary as captured history. They are excluded from exports; Save as new request creates an exportable saved API.

There is no telemetry, analytics service, cloud account, remote logging, sync or remote script. Statistics are computed locally. Installing and using the inspector requires no external API.

Creator links, including the optional Buy me a Coffee support link, open an external website only after a click. No payment widget or social tracking script runs in the extension. Those sites have their own privacy policies. Support is optional and does not unlock or limit features.

**Replay sends the edited request to the API URL chosen by the user.** Opening an endpoint also navigates to that site. Copy and export put selected data on the system clipboard or into a local download, where other applications may access it.

**Start run repeatedly sends the reviewed API request according to the configured schedule.** The runner operates entirely within the extension, including when its editor closes. It streams and discards response bodies. Stored reports contain method, target origin, source/workspace/session IDs, numeric configuration, timing aggregates, status counts and bounded numeric/category samples. They exclude full request URLs, headers, cookies, payloads and variable/data-row values. These execution inputs remain in memory only for the run; the original edited API draft follows the persistent storage behavior above. Reports retain the latest 50 runs and export separately from capture backups. Closing Chrome or losing the runner interrupts execution, with no automatic resume or retry.

The added `offscreen` permission hosts a dedicated Web Worker using Chrome's supported WORKERS reason. It does not read other tabs, files or system performance counters. The host is closed when idle. Timed fetches require granted host access, omit ambient cookies, keep a fixed origin and block redirects. Cancelling a fetch cannot undo work an API already received. Revoking site access stops the run.

## Defaults

- Capture is paused until explicitly started.
- HTTP(S) host access is optional and requested when starting capture.
- Debugger attachment and response-body capture are off.
- Displayed sensitive values are masked; exported secrets and cookies are excluded by default.
- Replay defaults to the source browser tab when available, otherwise the extension context.
- Retention is 30 days, 10,000 requests and an approximate 500 MB storage budget.

## Masking is not encryption

Captured credentials are retained locally so authorized replay can use the original request. The database is **not encrypted by this extension**. Anyone with access to the browser profile or extension developer tools can inspect stored content. Uninstalling the extension removes its extension storage according to Chrome's behavior; exported files and clipboard history remain separate.

The redactor recognizes credential-like field/header/query names, cookies, passwords, API keys, token/session identifiers, Bearer/Basic credentials and JWT-like strings. Structured JSON and form values are handled separately. Unknown secret formats, secrets embedded in arbitrary paths/prose, and credentials under unusual field names may remain. Review exports before sharing them. Explicit reveal/copy/export controls can include original values.

## Untrusted content

URLs, headers, bodies and imported files are untrusted. React renders strings as text. Captured HTML/XML is inert text; active HTML previews are disabled. The extension never evaluates captured JavaScript or imported code. The MV3 policy prohibits remote scripts, unsafe-eval, objects and frames.

Import supports validated schema-version-1 JSON and a documented HAR subset, with a 100 MB file limit, fresh identifiers and atomic writes. Imported source tab IDs are removed. Imports cannot grant Chrome permissions or execute a request automatically. CSV protects formula-like leading characters, and Markdown escapes embedded HTML.

## Capture and replay boundaries

The extension observes permitted traffic without intercepting or modifying it. Chrome's debugger permission must be declared at installation because Chrome does not support making it optional. The UI only attaches when response capture is enabled. Revoking host access pauses capture.

Browser replay runs a fixed bundled function in an isolated content-script world and follows page-origin/CORS/cookie rules. Extension replay requires host access and omits ambient cookies. Neither context bypasses forbidden fetch headers. There is no automatic fallback or automatic retry that could duplicate a side effect. A click on Send may modify the remote API just like the same request from another API client.

## Retention and deletion

Cleanup runs every five minutes and protects favorites, pins, collection members and editor draft sources; those records can exceed configured limits. Drafts remain until discarded or explicitly removed with their source history. Storage-budget enforcement estimates payload sizes and is not a hard quota guarantee. Chrome can still deny writes when profile storage is exhausted. Failures appear in diagnostics without logging request payloads.

Settings offers confirmed deletion of a session's requests, a workspace's requests, all captured history, or all extension data. Workspace/session deletion removes contained history. These explicit history deletions also remove related editor drafts and run reports, and stop affected runs; open editors show an unavailable state. Active run sources are protected from automatic retention. Discard draft removes only that draft, preserving the original request and replay results. A terminal run report can be deleted separately after confirmation. Collection deletion removes membership, preserving request history. Exported files are never deleted by those actions.
