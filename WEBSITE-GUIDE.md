# ApiSip website: analytics, feedback and search guide

Public site: <https://mihirbhadak.github.io/ApiSip/>. Publisher: [Mihir Bhadak](https://github.com/mihirbhadak).

## What is working, and what needs your account

| Feature                                                              | Status                                                            | Where to see it                                                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Real GitHub ZIP download counters                                    | Collected now; daily GitHub Actions snapshot configured           | [JSON history](stats/downloads.json), [CSV history](stats/downloads.csv), repository Actions → Record release downloads |
| Website feedback                                                     | Working, with public GitHub drafts and issue templates            | [ApiSip issues](https://github.com/mihirbhadak/ApiSip/issues)                                                           |
| Page views, sources, countries, click events                         | Enabled September 17, 2026; browser privacy preferences respected | [Your GoatCounter dashboard](https://mihirbhadak.goatcounter.com/) (sign-in required)                                   |
| Google impressions, search queries, clicks, CTR and average position | Requires your Search Console ownership verification               | Your Search Console property                                                                                            |
| Completed Chrome installations or extension usage                    | Not tracked                                                       | Unpacked installation has no reliable website-side installation callback                                                |

The website and extension are separate privacy boundaries. Nothing in this integration reads extension traffic, headers, bodies, saved requests or local history. The extension remains free of telemetry.

### Opening Chrome's extensions page

The installation page offers **How to open extensions**, with a keyboard-accessible guide to **Chrome menu (⋮) → Extensions → Manage Extensions**. The menu instructions remain visible without JavaScript. No clipboard access is required. Chrome deliberately prevents normal websites from linking to `chrome://extensions`, so a website button cannot open it directly; see [Google's unpacked installation instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked). The guide does not attempt blocked navigation or create an empty tab.

## 1. View and manage website analytics

**Your endpoint is configured:** `https://mihirbhadak.goatcounter.com/count`. Sign in at [mihirbhadak.goatcounter.com](https://mihirbhadak.goatcounter.com/) to view the private dashboard. No password or API secret belongs in this repository. The public website sends metrics; the Chrome extension does not.

1. Open the public site in a normal browser tab with JavaScript enabled. Click Download once and look for `/ApiSip/` and `download_hero` or `download_nav` in your dashboard. Allow time for the provider to process the requests and check the dashboard date range/time zone. These manual verification clicks affect counters.
2. Use the pages/events, referring sites, browsers and location reports. Campaign labels such as `campaign:linkedin/launch` appear under **referrers**, not the automatic campaign widget. See the exact event names below.
3. Test **Turn off website metrics** in the footer. The preference is saved locally and applies across open tabs. Do Not Track and Global Privacy Control also prevent analytics requests. Blocking the analytics service must never block downloads or feedback.
4. Keep collection of individual pageview records off in GoatCounter settings if you only need aggregate reporting. Select only the dimensions you actually need. Review the provider's privacy terms for your audience.

Automated browser checks identify themselves to GoatCounter as WebDriver traffic. They verify actual endpoint responses but may be excluded from ordinary visitor totals. A successful counting request alone does not prove dashboard ingestion. Localhost visits are deliberately ignored. The private dashboard requires your sign-in to confirm visible statistics; never share account credentials for this check.

### Change or disable the endpoint later

Edit `analyticsEndpoint` in [website/config.json](website/config.json); set it to an empty string to disable collection for everyone. Leave the other fields intact, then run:

```sh
npm run site:build
npm run test:site
```

Update the status in `PRIVACY.md` and this guide, then commit the configuration, documentation and generated `docs` changes and push `main`. GitHub Pages serves the committed `docs` output; editing source alone does not update the deployed page.

The bundled integration sends small asynchronous requests to GoatCounter's [documented counting endpoint](https://www.goatcounter.com/help/pixel) after initial page work; it loads no third-party script. It sends a fixed page path and allowlisted event names, not form contents, arbitrary URL parameters, hash fragments, API data or emails. Referral URLs are reduced to their origin. The service still receives normal connection information such as an IP address; see [GoatCounter's privacy policy](https://www.goatcounter.com/help/privacy) for its processing and aggregation. This is not a promise of zero network metadata or perfect counting.

The endpoint comes from your GoatCounter embed snippet. Do not add that script tag alongside the bundled integration: it would create a second page counter and send the stock script's raw query-string field. The current integration uses the supported counting protocol directly so the website's privacy filtering remains in control.

### Events you will see

| Event                                                                  | Meaning                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/ApiSip/`                                                             | Page visit (provider visit/session rules apply)                                                |
| `download_nav`, `download_hero`, `download_install`, `download_footer` | Download CTA clicked, by location                                                              |
| `download_retry`                                                       | Visitor clicked the retry link in the popup                                                    |
| `install_open`                                                         | Installation link clicked                                                                      |
| `install_view`                                                         | Installation section exposed in the viewport, once per page load; the download modal is closed |
| `install_menu_guide`                                                   | Visitor opened the Chrome menu instructions; not proof the extensions page opened              |
| `feedback_open`                                                        | Feedback link clicked                                                                          |
| `feedback_continue`                                                    | Visitor continued to a GitHub draft; **not proof an issue was submitted**                      |
| `coffee_click`                                                         | Support link clicked; **not a payment**                                                        |
| `social_github`, `social_linkedin`, `social_instagram`                 | Creator social icon clicked                                                                    |

Use the date/hour ranges, pages/events, referring sites and location breakdowns in your dashboard. Locations are approximate aggregate countries/regions supplied by the provider, not precise personal locations. Privacy settings, ad blockers, disabled JavaScript, denied referrers, bots and network failures affect coverage. Nothing can reconstruct analytics from before you enabled collection.

### Measure where visitors and download clicks come from

Use campaign links in your posts and profiles:

```text
https://mihirbhadak.github.io/ApiSip/?utm_source=github&utm_campaign=launch
https://mihirbhadak.github.io/ApiSip/?utm_source=linkedin&utm_campaign=launch
https://mihirbhadak.github.io/ApiSip/?utm_source=instagram&utm_campaign=profile
```

Allowed sources are `github`, `linkedin`, `instagram`, `google`, `bing` and `newsletter`. Allowed campaign names live in `website/config.json`; the initial values are `launch`, `profile` and `release-0-1-1`. Known campaigns are recorded as safe referral labels such as `campaign:linkedin/launch` on pageviews and events. This intentionally uses the **referrers** report instead of forwarding arbitrary campaign query strings to GoatCounter's automatic campaign parser. Unknown source/campaign values are discarded. Do not put emails, usernames, tokens or customer identifiers into campaign links.

Organic Google search usually provides the Google origin, not the visitor's search query. For queries, use Search Console below.

## 2. Understand the actual download counts

GitHub's [release asset API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset) exposes `download_count`. The scheduled workflow records each ApiSip ZIP's counter with an observation time in UTC at approximately **00:17 UTC / 05:47 India time daily**. GitHub can delay scheduled runs. You can also run **Actions → Record release downloads → Run workflow** or run `npm run stats:downloads` locally.

The snapshots are cumulative counters keyed by asset ID. Compare the same ID in two snapshots to see the observed increase between those times. The first snapshot is a baseline, not a daily total. A new/replaced asset has a new ID; deleted assets can disappear. Do not subtract total sums across changing sets of assets. The retained file is bounded to 400 snapshots, with the initial observation and subsequent daily samples until older samples age out.

These counts include downloads from GitHub directly and may include retries, automation and our QA downloads. They exclude GitHub's automatically generated source-code archives. They do **not** identify unique people, prove a transfer completed on disk or prove installation. The API does not expose per-download timestamps, referrers, identities or countries. The timestamp in this report is when the counter was read.

Website click events provide approximate source/time attribution; GitHub counters provide asset totals. They will not match exactly, and a static cross-origin website cannot join an individual click to a confirmed GitHub download. Historical source attribution is unavailable.

GitHub schedules can be disabled after prolonged repository inactivity. Monitor the Actions tab and re-enable the workflow if needed. A collection/API failure leaves existing history intact. The workflow uses GitHub's short-lived built-in token with repository-content permission; no personal access token or paid backend is required.

## 3. Enable Google search reporting

1. Open [Google Search Console](https://search.google.com/search-console/).
2. Add a **URL-prefix** property: `https://mihirbhadak.github.io/ApiSip/`. Do not choose a DNS domain property for `github.io`, which you do not control.
3. Choose the **HTML tag** verification method. Copy only the `content` token from the supplied `google-site-verification` meta tag into `searchConsoleVerification` in `website/config.json`.
4. Rebuild, commit the source/config and generated `docs` files, push, and wait for Pages deployment. Then click Verify in Search Console. Keep the token in later builds so ownership remains verifiable. The token is public by design; it is not an account credential.
5. Submit `https://mihirbhadak.github.io/ApiSip/sitemap.xml` under Sitemaps.
6. Use URL inspection for the canonical page and request indexing once. Indexing and rich results are Google's decisions, not guaranteed by validation or a sitemap.
7. Under **Performance → Search results**, review clicks, impressions, CTR, average position and query/page/country/device dimensions over time. New properties need time and traffic before useful data appears. Some low-volume queries are omitted for privacy.

Google documents [ownership verification](https://support.google.com/webmasters/answer/9008080) and [search performance metrics](https://support.google.com/webmasters/answer/10268906). No website analytics JavaScript can measure every time a non-clicking user sees your search result. Search Console supplies that separate reporting.

For Bing, use [Bing Webmaster Tools](https://www.bing.com/webmasters/) and its ownership/import flow separately. Do not add an invented verification token.

## 4. Receive and manage feedback

The website's short form opens a **GitHub issue draft** with the entered title/body. The visitor reviews and submits it on GitHub. The website does not silently post, send email or claim submission succeeded. A GitHub account is required; feedback is public. This continues to work without website JavaScript.

Bug, feature and general-feedback templates are in `.github/ISSUE_TEMPLATE`. Read new reports under **Issues**, reply there, and use GitHub labels/milestones as needed. Enable your preferred repository notification settings from your own GitHub account.

If you later need private, anonymous feedback, use a hosted form provider such as Tally or Google Forms after creating your own form and reviewing its current limits/privacy terms. A normal link avoids loading a heavy embed. No unowned form endpoint or fake email address is configured here.

## 5. Validation, performance and metadata

- Publisher/author: Mihir Bhadak with his GitHub URL in structured data and an author link. GitHub is the host, not falsely listed as the software's author.
- Every content image has descriptive alt text and a title. Every link has a descriptive title; icon-only social links also have accessible names. Decorative SVGs are hidden from assistive technology.
- X/Twitter and Open Graph tags include the title, description, full image URL and alternative text. The preview is a real local-demo screenshot, sized 1200 × 630. No X handle is invented. Add `twitter:creator` or `twitter:site` only if you have an actual account to associate.
- Screenshots use responsive WebP variants (480/960/1512 px); small creator portraits replace the full-resolution JPEG in the page. Originals remain available as source assets.
- CSS is minified and embedded at build time, eliminating the separate render-blocking stylesheet request. The small application script is deferred and content-hashed. No frontend runtime framework or remote fonts ship to the page.
- Image/script filenames change when their content changes. This prevents stale asset reuse; it **does not change GitHub Pages' cache duration**. The public server currently sends `Cache-Control: max-age=600`. GitHub Pages has no repository `_headers` or `.htaccess` override. Short-cache warnings can remain even when assets are tiny.
- If long-lived immutable asset headers become a requirement, migrate the static `docs` output to a host that supports them, such as [Cloudflare Pages custom headers](https://developers.cloudflare.com/pages/configuration/headers/). Set long cache lifetimes only for content-hashed assets and short/revalidated HTML. Update canonical/social/sitemap URLs if the public address changes. This task does not change hosts.

### Recheck the requested reports

- [W3C Nu HTML](https://validator.w3.org/nu/?doc=https%3A%2F%2Fmihirbhadak.github.io%2FApiSip%2F)
- [PageSpeed Insights — start a fresh mobile run](https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fmihirbhadak.github.io%2FApiSip%2F&form_factor=mobile)
- [W3C CSS validator](https://jigsaw.w3.org/css-validator/validator?uri=https%3A%2F%2Fmihirbhadak.github.io%2FApiSip%2F)
- [WMTips keyword analyzer](https://www.wmtips.com/tools/keyword-density-analyzer/#https://mihirbhadak.github.io/ApiSip/)

An old PageSpeed report is a saved measurement and will not update itself when code changes. Run it again. Lab results vary with the device/network profile; field data, when available, uses a longer reporting window.

Public W3C Nu validation returned zero messages; a later repeat encountered a human-verification screen. The latest mobile Lighthouse run with GoatCounter enabled, at **September 17, 2026, 05:03 UTC**, scored **100 performance, 100 accessibility, 100 best practices and 100 SEO**, with no run warnings. An earlier run scored 99 performance; an intermediate run exposed an unfinished analytics response, which was reproduced and fixed before the final clean audit. The prior delivery audit found no render-blocking requests; cache/image estimates were approximately 33 KiB and 27 KiB. Higher-density screens receive larger screenshots for legible UI text. The direct PageSpeed API previously returned HTTP 429 due to its shared daily quota, so run a fresh report through the link above for a Google-hosted result. See [TESTING.md](TESTING.md#goatcounter-activation-september-17-2026) for the latest live verification, evidence and limits. A lab score is not a guarantee for every visitor.

The CSS validator's older CSS3 profile can reject standards-based [SVG paint properties](https://www.w3.org/TR/SVG2/painting.html), [CSS masking](https://www.w3.org/TR/css-masking-1/) or [pointer-event declarations](https://www.w3.org/TR/css-ui-4/#pointer-events) that current browsers support. Record the actual messages and verify them against the relevant standards; do not remove correct interaction or accessibility behavior just to satisfy an outdated property table.

WMTips presented a Cloudflare human-verification screen to automated access during this task. Run it in your own browser if you want its exact report. Keyword frequency can help find awkward repetition, but there is no target percentage to chase. Prefer natural explanations of Chrome API capture, replay and testing. Google explicitly treats [keyword stuffing](https://developers.google.com/search/docs/essentials/spam-policies#keyword-stuffing) as spam; do not add hidden keywords or repeated phrases for a score.

## Development commands

```sh
npm run site:build
npm run site:dev
npm run test:site
npm run test:site-tools
npm run stats:downloads
```

Edit `website/index.html`, `website/site.css`, `website/site.js`, `website/analytics.js` and `website/config.json`. `docs/index.html` and `docs/assets/web-*` are generated; do not edit them by hand. Commit generated output because GitHub Pages publishes `main:/docs` directly. The image optimizer and bundler are development dependencies only, with no browser runtime cost. Previous hashed assets and the original `docs/site.css` / `docs/site.js` are retained for cached older HTML; new pages do not request those legacy files. Do not delete previously published assets during a release while cached pages may still reference them.
