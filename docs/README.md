# ApiSip website

The public landing page is a static site published by GitHub Pages from `main:/docs` at <https://mihirbhadak.github.io/ApiSip/>. Authoring files live in `website`; a small build step produces indexable HTML, inline minified CSS, a deferred script and responsive optimized images. No frontend framework or remote fonts are shipped. Optional website metrics use the owner's [GoatCounter account](https://mihirbhadak.goatcounter.com/) with footer opt-out and browser privacy controls. The extension has no telemetry.

**Hosting status, September 16, 2026:** the site is live over HTTPS, with automatic HTTP-to-HTTPS redirects. The inherited obsolete custom domain was removed with the owner's approval. Screenshots, responsive layouts, accessibility and the real release download were checked on the public site; see [the verification report](../TESTING.md#hosting-verification).

## Local development

From the repository root:

```sh
npm ci
npm run site:dev
```

Open <http://127.0.0.1:4178/ApiSip/>. The server maps the production subdirectory so relative assets are exercised correctly.

```sh
npm run test:site
npm run test:site-tools
npm run format:check
npm run lint
```

The Playwright suite covers desktop/mobile layouts, axe accessibility, screenshot navigation, dialogs, automatic installation scrolling, all download links, clipboard success/failure, feedback drafts, no-JavaScript behavior, metadata, image selection and asset budgets. Focused analytics tests substitute only the provider transport and exercise event allowlists, query/referrer sanitization, opt-out, browser privacy signals and blocked requests. Local UI tests stub the ZIP transfer; the real archive is checked separately during publication.

## Screenshots and updates

All screenshots originate in the actual extension E2E suite using the bundled loopback test server at `127.0.0.1:4177`. Never add third-party traffic or real credentials. The creator photo is intentionally public and bundled locally.

For a new release, update the visible version, all ZIP URLs and structured-data version/download URL in `website/index.html`, plus the expected release in `tests/site/website.spec.ts`. Run `npm run site:build` and commit generated `docs` files too. Publish and verify that release before deploying the page. Canonical, Open Graph and sitemap URLs must match the hosting location. GitHub Pages provides HTTPS and static caching; search ranking and real-user performance are not guaranteed by metadata or local tests.

Download clicks go directly to the release archive and open an optional creator/support dialog on the page. Contributions never gate the download. The dialog says the download _should_ start because a cross-origin file download cannot be confirmed by this page. External links load only after interaction. GitHub, social sites and Buy Me a Coffee have their own privacy policies.

The page moves to the installation section behind the dialog. Closing it focuses the installation heading. Social links use local SVG icons with accessible names. Feedback opens a reviewable public GitHub draft and does not post automatically.

See [WEBSITE-GUIDE.md](../WEBSITE-GUIDE.md) for GoatCounter setup, actual ZIP counters, Search Console verification, campaign links, feedback, cache limitations and validator reports. Edit `website` source files; `docs/index.html` and `docs/assets/web-*` are generated output.
