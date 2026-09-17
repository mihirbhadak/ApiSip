# Test lab guide

Test lab turns captured APIs into repeatable, sequential checks. It runs entirely inside ApiSip with no native program, account, backend or additional extension permission.

## Find it

- **Sidebar → Test lab** opens your current workspace's library.
- **Request details → Create test**, request context menu → **Create test suite**, or **Editor → Create test** starts from an independent copy of the selected request, including header/body eye controls.
- Search the command palette for **Test lab**, **Create test** or **Security**.
- The **?** button opens the in-app guide. Ctrl/Cmd + S saves; Ctrl/Cmd + Enter reviews. Neither shortcut sends requests. Use Tab and searchable dropdowns throughout the editor.

## Example: read a user, then reuse its ID

Run the bundled local test server with `npm run test:server`. Grant ApiSip website access from the inspector. Use test accounts and endpoints you control.

1. Create a suite named **User journey**.
2. Step 1: `GET http://127.0.0.1:4177/api/users`; leave the status-equals-200 check.
3. Add an extraction: variable `userId`, source **JSON value**, selector `/users/0/id`.
4. Add a blank step. Set method **POST**, URL `http://127.0.0.1:4177/api/json`, header `Content-Type: application/json`, and body `{"id":"{{userId}}"}`.
5. Add a check: **JSON value**, selector `/body/id`, **equals**, expected `1`. The echo endpoint wraps your request in `body`.
6. Save, review both destinations, then start. Two real requests should produce a passed report. A whole JSON placeholder preserves the numeric ID; embedded text becomes a string.

To check omission, add `"omit":"sample"` to step 2's body, close its eye, and add a **does not exist** check for `/body/omit`. Closed-eye fields remain in the saved definition but are excluded from the outgoing request.

## Checks and selectors

| Source          | Selector        | Useful check                                      |
| --------------- | --------------- | ------------------------------------------------- |
| Status          | None            | equals `200`; at least `200` plus less than `300` |
| Response header | `content-type`  | contains text `application/json`                  |
| JSON value      | `/users/0/name` | exists; has type `string`; equals `Mihir`         |
| Response text   | None            | contains text `ready`                             |
| Duration        | None            | at most `500` milliseconds                        |

Selectors use **JSON Pointer**, not JavaScript, JSONPath or arbitrary expressions. Empty pointer selects the root. `/items/0/id` selects the first item's ID; `~1` escapes `/` and `~0` escapes `~` in a key. Traversal uses own properties only and is limited to 32 levels. JSON numbers use JavaScript floating-point precision. Comparisons of non-finite or unsafe integer JSON values are inconclusive, and extraction rejects them; return large integer IDs as strings to preserve them exactly.

For JSON/status/duration, expected `123` is a number; `"123"` is a string; `true` and `null` retain their types. Unquoted ordinary text is a string. Equality supports scalar values; use **has type** for objects/arrays. Numeric comparisons require actual numbers. Header values are text. All checks must pass. A body check on missing, truncated, binary or malformed JSON is inconclusive and fails the step. Fetch's hidden `Set-Cookie` is also inconclusive when not exposed.

Duration includes fetch and reading the bounded response, not isolated server processing or DNS/TLS measurements. Use capture/timed-run analytics for their separately documented measurements.

## Variables and environments

Extractions run only after every check in that step passes. They can read an exposed response header or a JSON scalar, not an entire object/array. Variable names are unique identifiers such as `userId`; they cannot overwrite environment values or prior extractions. Forward references are rejected during review. Extracted values stay in memory and are discarded when the run ends.

An environment stores a name, optional HTTP(S) origin override and text values. Example: define `authHeader` as your entire `Bearer …` value, then use `Authorization: {{authHeader}}` in a request. A blank origin preserves each step's destination. `https://staging.example.com` replaces only origins, retaining paths/query strings; paths, URL credentials, queries and fragments are rejected in the override itself. Static credential headers must be excluded or replaced with environment placeholders before changing origin.

Use placeholders in URL paths/query values, headers or bodies; the target origin cannot be a variable. URL/form values are encoded. JSON placeholders must be quoted; an entire placeholder preserves an extracted scalar's type. `{{uuid}}`, `{{timestamp}}`, `{{index}}` and `{{randomInt}}` are reserved built-ins inherited from the template engine. In a suite, each step is one request, so `index` is always 1; use extracted/environment values for workflow IDs. No scripts are evaluated.

Environment values entered in the UI are strings, stored **unencrypted** in local IndexedDB. Masking/blur is display protection, not a vault. Environment selection is per tab; choose it again after reloading. Environments are deliberately omitted from exports. Recreate them on another installation and review all destinations/credentials before running imported suites.

## Review, execution and recovery

Review validates all steps and saves the definition, then shows methods, destination origins and omitted-header warnings. Start first checks site permission for every destination; the transport checks again for each request. Execution is sequential and uses extension fetch without ambient page cookies. Browser-managed headers are omitted. Redirects and automatic retries are disabled.

Default stop-on-failure also stops on inconclusive checks or extraction failure. You can turn it off to continue independent later steps; a step depending on a missing extracted variable will fail before sending. Cancel stops further requests and aborts the active fetch but cannot reverse a side effect already received by the server.

Keep the tab open. There is one active suite per lab tab, not a global suite lock. Multiple tabs may run independently; avoid accidental overlapping destructive workflows. Each checkpoint is saved before the first request and after every completed step. Reloading/closing never resends requests automatically. An unfinished report displays **interrupted**. Conflicting edits in two tabs are rejected; reload before saving. Storage failure stops the run at the checkpoint boundary instead of silently losing results.

## Reports and sharing

Reports retain suite/environment names, destination origins, timestamps, per-step status/duration, check outcomes and bounded diagnostic messages. They do not retain bodies, response-header values or extracted variables. Status/duration mismatches show numbers; other failed checks provide guidance without storing potentially private response values. Reports show completed and unsent steps separately. The workspace keeps the latest 25 reports; the sidebar shows the 10 most recent.

**Report JSON** preserves structured results. **JUnit XML** describes step outcomes and counts unsent/cancelled steps as skipped. Suites export as versioned `apisip-suite` JSON with known secrets redacted. Import assigns new identities, validates bounds and never runs automatically. Export and import are for definitions; environment values and reports are separate.

Lab data is outside general capture backups and workspace duplication. Export important suites separately. Clearing session/workspace capture history leaves suite copies intact. Deleting the workspace or all stored data removes suites, environments and reports; deleting a suite removes its reports. Definitions require explicit Save; the UI warns before discarding unsaved edits.

## Resource limits

| Item                                           | Limit                                               |
| ---------------------------------------------- | --------------------------------------------------- |
| Suites / environments per workspace            | 100 / 30                                            |
| Steps / checks per step / extractions per step | 30 / 50 / 20                                        |
| Serialized suite / environment                 | 2 million characters / 128 Ki characters            |
| Request body / headers                         | 1 MiB UTF-8 / 100 pairs; expanded headers 64 KiB    |
| Response read / request timeout                | 1 MiB / 25 seconds per step                         |
| Variables available to a step                  | 100; individual extracted string ≤10,000 characters |
| Searchable captured-request choices            | Latest 2,000 workspace summaries                    |
| Saved reports / visible recent reports         | 25 / 10 per workspace                               |

Binary, incomplete and multipart request bodies must be replaced with a complete text definition before sending. Responses are processed one step at a time and discarded after checks; no concurrent response backlog is retained. A network stream chunk can temporarily exceed the retained byte limit. No whole-computer CPU/RAM guarantee is made. Large suites are read individually on selection; the library keeps summaries.

## Troubleshooting

- **Grant website access:** return to the inspector's setup/permissions controls, grant access, then review again. There is no automatic retry.
- **Unknown variable:** define an environment value or an extraction on an earlier step. Check spelling and field-eye state.
- **Condition not met:** verify source, selector, expected type and value. Suite reports intentionally do not keep full response bodies.
- **Inconclusive:** a complete text response or visible header was unavailable; do not interpret it as a pass.
- **Request/extraction failed:** check connectivity, permission, timeout, redirects, missing/oversized extraction values and request templates.
- **Changed/deleted in another tab:** reload the library; stale saves cannot resurrect deleted definitions.

For passive security findings and reviewed AI context copying, open the request's **Security** tab. Live AI calls, MCP, active security probes, full schema validation and CI execution are not part of Test lab v1; see [ROADMAP.md](ROADMAP.md).
