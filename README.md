# API Catcher

A local-first Manifest V3 Chrome extension for inspecting, organizing and replaying HTTP(S) requests. The extension icon opens a full-page developer tool.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run build
```

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select **`D:\Projects\api-catcher`** (this repository's root). The production build generates a root manifest that points to the built files in `dist`.
   Alternatively, `dist` is a standalone extension folder suitable for packaging. Use one installation path consistently: Chrome assigns separate extension identities and local history to different folders.
4. Open an HTTP(S) web page, then click the API Catcher icon.
5. Click **Start capture** and grant the requested site access.
6. Enable **Response capture** if you want response bodies and WebSocket messages, then repeat the requests.

### Fix "Manifest file is missing or unreadable"

Run `npm run build` from this repository, then retry **Load unpacked** with `D:\Projects\api-catcher`. The build creates both `manifest.json` at the root and the standalone `dist/manifest.json`. Do not load `src` or `public`; they do not contain the complete production extension. Keep `dist` beside the root manifest. If Chrome already has API Catcher installed, use **Reload** on that extension card after rebuilding.

After source changes, build again and click **Reload** on the extension card. `npm run dev` serves the UI for development, but capture and replay require the installed extension.

## Capabilities

- Current-tab and all-tabs capture, pause/resume, persistent sessions and live badge counts.
- Passive request metadata, available upload bodies, headers, statuses, redirects and errors.
- Opt-in Chrome debugger/CDP capture for available response bodies, timings, cache information, GraphQL and bounded WebSocket messages.
- Virtualized, sortable request table; configurable columns, pinning, favorites, multi-selection and resizable details.
- Global search through URLs, headers, query values, bodies, tags and notes in a separate worker.
- Nested AND/OR/NOT filters, visual builder, expression editor, saved filters and quick filters.
- Persistent workspaces, sessions, collections, editable saved requests, tags and notes.
- Request editor with query/header/body editing, browser-context and extension-context replay, history and structural JSON comparison.
- cURL/Bash/CMD, PowerShell, JavaScript fetch/Axios, TypeScript fetch, Python requests/httpx, Go, Java, C#, PHP, Ruby, Rust and HTTPie generators.
- JSON, CSV, Markdown, HAR and text exports; versioned JSON/HAR imports; sensitive values excluded by default.
- Local statistics, status/type/domain/latency distributions, endpoint grouping and slow/large-request lists.
- System/light/dark themes, keyboard shortcuts, command palette, diagnostics, retention controls and destructive-action confirmations.

## Dashboard controls and help

- Three-dot menus close on outside click, Escape, Tab or after an action. Use arrows and Home/End to navigate; Enter activates an action. Delete and clear actions stay red.
- The header checkbox selects all matching requests, including rows off screen. A dash means partial selection. Ctrl/Cmd + A selects all when the request list has focus. Deselect clears the entire selection, including requests outside the current filters.
- Dropdowns support typing to search, arrows to navigate and Enter to choose. Escape cancels; Tab moves on. Field and method pickers accept custom values with Enter.
- The ? buttons open a searchable guide covering capture, filters, organization, details, replay, exports, analytics, privacy and settings.
- Hold Ctrl, Cmd or Alt alone for one second to reveal shortcuts without moving focus. Release the key, press another key or leave the window to dismiss the hints.
- Section tabs support Left/Right and Home/End. The command palette displays its shortcuts.

### Creator

Built by **Mihir Bhadak**. [GitHub](https://github.com/mihirbhadak), [LinkedIn](https://www.linkedin.com/in/mihirbhadak/), [Instagram](https://www.instagram.com/mihir_bhadak/). His profile photo is bundled locally. Links open only when clicked; no remote social widgets are loaded.

## Capture modes and limitations

**Passive capture** uses Chrome's `webRequest` observer. It does not modify traffic and cannot read response bodies. Response size and detailed timing are unavailable when the provider does not expose them.

**Response capture** attaches `chrome.debugger` to supported tabs and observes CDP Network events. Chrome displays a debugging notice. Opening DevTools, another debugger, enterprise policy, navigation or a closed target can prevent or terminate attachment. Passive metadata capture remains available when attachment fails. The settings diagnostics tab provides a retry action.

Neither mode captures literally all browser networking. Chrome-internal pages, other extensions, sensitive browser requests, traffic before capture starts, inaccessible targets and some background/service-worker/cache activity are excluded or incomplete. Related iframe/worker targets are instrumented where Chrome allows them; this is not a guarantee of complete frame or worker coverage. Captures are observations, not packet traces.

- Bodies can be evicted, omitted, streamed indefinitely, inaccessible, or larger than CDP's buffer. Unavailability and truncation are displayed explicitly.
- Body limits are 1, 5, 10 or 25 MB. Unlimited capture is deliberately unavailable.
- Multipart upload file content and original wire boundaries may be missing. Incomplete/binary/multipart bodies must be replaced before replay or reproducible code generation.
- WebSocket capture keeps up to 200 messages per connection and 16 KB per payload; it does not replay WebSocket conversations.
- Header duplicates are preserved when exposed. Extra-info ordering across redirects can be ambiguous, so primary-event headers are used for those hops.
- Raw mode reconstructs exposed fields; it cannot reproduce HTTP/2 frames or the exact bytes sent on the network.
- Regex filters support literals, anchors, character classes and at most one repetition anchored at the beginning. Groups, alternatives, backreferences and counted repetitions are rejected to bound search cost.
- P95 appears after 20 measured durations and P99 after 100. Missing timings and sizes are not invented.
- Current-tab capture follows the most recently active supported web tab. Opening the inspector preserves that target. If no target exists when capture starts, a supported active/recent tab is selected.
- Sessions continue across navigation. Optional navigation cleanup removes unsaved completed requests; SPA/hash changes preserve history.

## Replay behavior

**Browser** runs a bundled fetch function in the source tab's isolated content-script world. It uses that tab's cookie/CORS context and refuses a changed source origin. Closed tabs and CORS restrictions produce a recorded error.

**Extension** fetches from the extension worker with granted host access. It omits ambient cookies. It is useful for cross-origin API calls but does not reproduce the source page's identity automatically.

Automatic selection prefers the browser context when a source tab exists. Requests are never automatically retried in another context. Fetch controls forbidden headers such as Cookie, Origin, Referer, Host, Content-Length and Sec-*. The inspector lists omitted headers. Response headers may be filtered by fetch, especially Set-Cookie. Replays time out after 25 seconds and retain the latest 30 results per request.

## Permissions

| Permission                           | Purpose                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `webRequest`                         | Observe permitted requests without interception or blocking.                                                                           |
| `debugger`                           | CDP response-body, timing and WebSocket capture. Chrome **does not allow** this permission to be optional; attachment is still opt-in. |
| `activeTab`                          | Identify the page when the extension icon is clicked.                                                                                  |
| `scripting`                          | Execute the fixed browser-context replay function in the selected source tab.                                                          |
| `storage`                            | Keep a browser-lifetime capture identifier in session storage; request data uses IndexedDB.                                            |
| `alarms`                             | Run periodic local retention cleanup.                                                                                                  |
| Optional `http://*/*`, `https://*/*` | Observe APIs and initiators across supported sites and perform explicit replay. Requested when capture starts.                         |

No blocking/interception, cookies API, history API, native messaging, cloud service, remote scripts, telemetry or hidden analytics. Clipboard writing uses the user's click/shortcut and requires no blanket clipboard permission.

## Privacy and data management

Captured content may contain credentials. Masking affects display and export; **stored data is not encrypted**. Use a dedicated browser profile for sensitive debugging and clear history when finished. Known secret names, Bearer/Basic credentials and JWT-like values are redacted; arbitrary unstructured secrets may require manual review. See [PRIVACY.md](PRIVACY.md).

Retention defaults to 30 days, 10,000 requests and an approximate 500 MB budget. Cleanup runs every five minutes. Favorites, pinned requests and collections are protected and may exceed those limits. Settings exposes explicit clearing actions. Import/export files are capped at 100 MB; export smaller selections for large histories.

## Shortcuts

| Shortcut                          | Action                                      |
| --------------------------------- | ------------------------------------------- |
| Alt + Shift + A                   | Open or focus the inspector                 |
| Ctrl/Cmd + K or F                 | Search requests                             |
| Ctrl/Cmd + Shift + P              | Command palette                             |
| Ctrl/Cmd + Enter                  | Send from request editor                    |
| Ctrl/Cmd + Shift + C              | Copy cURL                                   |
| Ctrl/Cmd + E                      | Export                                      |
| Alt + Shift + C                   | Start or pause capture                      |
| Alt + Shift + N / W / L           | New session / workspace / collection        |
| Alt + Shift + F / S / H           | Open filters / settings / help              |
| Alt + Shift + R                   | Focus the request list                      |
| Ctrl/Cmd + A                      | Select all matching requests (focused list) |
| Space                             | Toggle focused request selection            |
| Shift + F10                       | Open the focused request menu               |
| Arrow keys, Home, End             | Navigate the focused request list           |
| Left / Right, Home / End          | Navigate section tabs                       |
| Type, Up / Down, Enter            | Search dropdowns and choose an option       |
| Delete                            | Confirm deletion of selected requests       |
| ?                                 | Open help (outside text fields)             |
| Hold Ctrl/Cmd or Alt for 1 second | Reveal shortcuts                            |
| Escape                            | Close a menu, dropdown, dialog or details   |

Alt + Shift + A is a Chrome extension command; configure it at `chrome://extensions/shortcuts` if Chrome preserves an unassigned or conflicting shortcut. The remaining shortcuts apply while the inspector has focus. Normal editing keys are preserved in form controls.

## Development and verification

See [DEVELOPMENT.md](DEVELOPMENT.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [TESTING.md](TESTING.md). Optional interception/mocking, environment-variable secrets, OpenAPI/Postman import, remote sharing and cloud sync are intentionally outside this implementation.
