# ApiSip website

The public landing page is a buildless static site served by GitHub Pages from `main:/docs` at <https://mihirbhadak.github.io/ApiSip/>. HTML contains the complete indexable content; a small local script progressively enhances navigation, screenshot tabs, copying and accessible dialogs. No runtime framework, external fonts, tracking, cookies, or API calls are needed.

## Local development

From the repository root:

```sh
npm ci
npm run site:dev
```

Open <http://127.0.0.1:4178/ApiSip/>. The server maps the production subdirectory so relative assets are exercised correctly.

```sh
npm run test:site
npm run format:check
npm run lint
```

The Playwright suite covers desktop/mobile layouts, axe accessibility, keyboard screenshot navigation, enlarged-image dismissal, download-to-creator dialogs, all download links, navigation dismissal, clipboard success/failure, no-JavaScript behavior, metadata and asset budgets. Only the external ZIP transfer is stubbed in local UI tests; the actual release archive is downloaded and checked separately during publication.

## Screenshots and updates

All screenshots originate in the actual extension E2E suite using the bundled loopback test server at `127.0.0.1:4177`. Never add third-party traffic or real credentials. The creator photo is intentionally public and bundled locally.

For a new release, update the visible version, all ZIP URLs and structured-data version/download URL in `index.html`, plus the expected release in `tests/site/website.spec.ts`. Publish and verify that release before deploying the page. Canonical, Open Graph and sitemap URLs must match the hosting location. GitHub Pages provides HTTPS and static caching; search ranking and real-user performance are not guaranteed by metadata or local tests.

Download clicks go directly to the release archive and open an optional creator/support dialog on the page. Contributions never gate the download. The dialog says the download _should_ start because a cross-origin file download cannot be confirmed by this page. External links load only after interaction. GitHub, social sites and Buy Me a Coffee have their own privacy policies.
