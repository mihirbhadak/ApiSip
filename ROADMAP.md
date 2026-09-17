# ApiSip feature status

This separates implemented features from proposed work. Planned features are not exposed as functioning controls or advertised as shipped.

## Shipped foundation

- Capture, filtering, organization, editing, dual-context single replay, response comparison, snippets, import/export and local analytics.
- Bounded timed API runner with variable data, scheduling, concurrency, distributions, cancellation and saved reports.
- **0.2.0 Test lab:** response assertions, reusable suites, sequential workflows, scalar extraction, local environments, review-before-send, checkpoint recovery, JSON/JUnit reports and suite import/export.
- Passive captured-evidence security checks and reviewed/redacted context copying for a bug report or an external AI tool. No AI provider connection.
- Searchable help, command-palette/context-menu entry points, searchable dropdowns, keyboard actions and light/dark themes.

## Next: deeper API testing

1. Named baselines and structural contract comparisons, with explicit ignored paths and volatile-field handling.
2. OpenAPI import and JSON Schema validation; distinguish imported contracts from inferred examples.
3. Reusable dataset-driven suite runs, per-step auth profiles and token-refresh flows with explicit storage/privacy choices.
4. Export runnable Playwright/k6/CI artifacts; test the generated programs against real fixture APIs.

## Later: debugging and controlled failure simulation

- Local response mocks, latency/offline/error simulation and scoped overrides. Chrome declarative rules can block/redirect/change supported headers; arbitrary response replacement needs a separate supported interception provider and careful conflict/cleanup handling.
- Request dependency graphs, trace-ID correlation, performance baselines and richer SSE/WebSocket inspection.
- Scoped, opt-in active checks on owned test environments. Passive findings must never be presented as confirmed exploitable vulnerabilities.

## Optional AI and MCP

Start with an explicit preview/redaction boundary (shipped), then add provider adapters, per-call destination disclosure, data limits, cancellation and reviewable structured output. Never automatically execute suggestions or instructions found in captured content. Local model connections are optional; model CPU/RAM usage cannot be hidden or guaranteed low.

Potential read-only tools: list selected requests, obtain redacted details, summarize timing distributions and draft assertions. Sending requests, applying changes or starting timed tests needs a separate explicit user action and bounded scope.

An extension alone is not a conventional local stdio/HTTP MCP server. A native-messaging bridge would require a separately installed OS-specific host, outside the current single-extension product boundary. A remote MCP connection would introduce a disclosed service and network trust boundary. Choose and test that architecture before advertising MCP support.

## Not scheduled

Secrets vault, team collaboration, cloud sync, account/billing system and distributed load generation. These need separate threat models, storage/retention decisions and deployment costs. The current local extension remains usable without them.
