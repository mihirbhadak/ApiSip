/* global APISIP_SITE_CONFIG */
const config = APISIP_SITE_CONFIG;
const preferenceKey = 'apisip-website-metrics-disabled';
const queue = [];
let ready = false;
let enabled = false;
let started = false;
let pageCounted = false;
const sources = new Set(['github', 'linkedin', 'instagram', 'google', 'bing', 'newsletter']);
const parameters = new URLSearchParams(location.search);
const source = parameters.get('utm_source')?.toLowerCase();
const campaign = parameters.get('utm_campaign');
let referrer = '';
if (sources.has(source))
  referrer = `campaign:${source}${config.allowedCampaigns.includes(campaign) ? `/${campaign}` : ''}`;
else {
  try {
    const url = new URL(document.referrer);
    if (url.origin !== location.origin && ['http:', 'https:'].includes(url.protocol))
      referrer = url.origin;
  } catch {
    /* An absent referrer is a direct/unknown visit. */
  }
}
function optedOut() {
  try {
    return localStorage.getItem(preferenceKey) === '1';
  } catch {
    return false;
  }
}
function canMeasure() {
  return (
    Boolean(config.analyticsEndpoint) &&
    !optedOut() &&
    navigator.doNotTrack !== '1' &&
    !navigator.globalPrivacyControl &&
    location.hostname === 'mihirbhadak.github.io'
  );
}
function send(event) {
  if (!enabled || !canMeasure()) return;
  try {
    // GoatCounter's documented /count protocol. Never pass location.search (q).
    // The stock count.js includes q implicitly, so this integration sends its own allowlist.
    const url = new URL(config.analyticsEndpoint);
    url.searchParams.set('p', event.path);
    url.searchParams.set('t', event.title);
    url.searchParams.set('r', referrer);
    url.searchParams.set('rnd', String(crypto.getRandomValues(new Uint32Array(1))[0]));
    if (event.event) {
      url.searchParams.set('e', 'true');
      url.searchParams.set('ns', 'true');
    }
    if (navigator.webdriver) url.searchParams.set('b', '153');
    void fetch(url, {
      mode: 'no-cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Metrics must never affect the site. */
  }
}
export function track(name) {
  // No field values, full URLs, query strings, emails or request data can become events.
  const allowed =
    /^(download_(nav|hero|install|footer|retry)|install_view|install_open|install_copy|feedback_open|feedback_continue|coffee_click|social_(github|linkedin|instagram))$/;
  if (!allowed.test(name) || !enabled) return;
  const event = { path: name, title: name.replaceAll('_', ' '), event: true, no_session: true };
  if (ready) send(event);
  else if (queue.length < 20) queue.push(event);
}
function begin() {
  enabled = canMeasure();
  if (!enabled || started) return;
  started = true;
  ready = true;
  if (!pageCounted) {
    send({ path: '/ApiSip/', title: 'ApiSip website', event: false });
    pageCounted = enabled;
  }
  for (const event of queue.splice(0)) send(event);
}
export function initializeAnalytics() {
  const control = document.querySelector('[data-analytics-toggle]');
  if (!config.analyticsEndpoint) return;
  control.hidden = false;
  const update = () => {
    const privacySignal = navigator.doNotTrack === '1' || navigator.globalPrivacyControl;
    control.disabled = Boolean(privacySignal);
    control.textContent = privacySignal
      ? 'Website metrics off (browser preference)'
      : optedOut()
        ? 'Turn on website metrics'
        : 'Turn off website metrics';
    control.setAttribute('aria-pressed', String(!canMeasure()));
  };
  control.addEventListener('click', () => {
    try {
      localStorage.setItem(preferenceKey, optedOut() ? '0' : '1');
    } catch {
      control.textContent = 'Preference could not be saved; browser privacy controls still apply.';
      return;
    }
    enabled = canMeasure();
    if (!enabled) queue.length = 0;
    else {
      begin();
      if (ready && !pageCounted) {
        send({ path: '/ApiSip/', title: 'ApiSip website', event: false });
        pageCounted = true;
      }
    }
    update();
  });
  window.addEventListener('storage', () => {
    enabled = canMeasure();
    if (!enabled) queue.length = 0;
    update();
  });
  update();
  // Load after the primary page work; no blocking vendor request on the render path.
  enabled = canMeasure();
  if ('requestIdleCallback' in window) window.requestIdleCallback(begin, { timeout: 1500 });
  else window.setTimeout(begin, 1000);
}
