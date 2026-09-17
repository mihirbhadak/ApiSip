/* global APISIP_SCREENSHOTS */
import { initializeAnalytics, track } from './analytics.js';
const root = document.documentElement;
root.classList.add('enhanced');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const menu = document.querySelector('.menu-toggle');
const navigation = document.getElementById('nav-links');

function closeNavigation(restoreFocus = false) {
  if (menu.getAttribute('aria-expanded') !== 'true') return;
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Open navigation');
  navigation.classList.remove('is-open');
  if (restoreFocus) menu.focus();
}
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  navigation.classList.toggle('is-open', open);
});
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  if (!event.target.closest('.nav-shell') || event.target.closest('.nav-links a'))
    closeNavigation();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeNavigation(true);
});
document.addEventListener('focusin', (event) => {
  if (event.target instanceof Element && !event.target.closest('.nav-shell')) closeNavigation();
});
window.matchMedia('(min-width: 861px)').addEventListener('change', () => closeNavigation());

const downloadDialog = document.getElementById('download-dialog');
let downloadGuidePending = false;
function showInstallation() {
  history.replaceState(null, '', '#install');
  document.getElementById('install').scrollIntoView({ behavior: 'instant', block: 'start' });
}
document.querySelectorAll('[data-download]').forEach((link) => {
  link.addEventListener('click', (event) => {
    track(`download_${link.dataset.download}`);
    // Let the real release link start its download. The support message never gates it.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    closeNavigation();
    showInstallation();
    downloadGuidePending = true;
    if (!downloadDialog.open) downloadDialog.showModal();
    // Native modal autofocus must not bring the download trigger back into view.
    requestAnimationFrame(showInstallation);
  });
});
downloadDialog.addEventListener('close', () => {
  if (!downloadGuidePending) return;
  downloadGuidePending = false;
  const heading = document.getElementById('install-title');
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
  showInstallation();
  trackInstallationView();
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close();
  });
});
document.querySelector('[data-install-link]').addEventListener('click', (event) => {
  event.preventDefault();
  downloadDialog.close();
  history.pushState(null, '', '#install');
  document.getElementById('install').scrollIntoView({
    behavior: reducedMotion.matches ? 'instant' : 'smooth',
  });
  const installation = document.getElementById('install-title');
  installation.setAttribute('tabindex', '-1');
  installation.focus({ preventScroll: true });
});

const screenshots = {
  capture: {
    ...APISIP_SCREENSHOTS.capture,
    alt: 'ApiSip displaying a JSON response from its local test API at 127.0.0.1:4177',
    caption: 'Live requests, readable responses, and the details that matter.',
  },
  editor: {
    ...APISIP_SCREENSHOTS.editor,
    alt: 'ApiSip standalone request editor in dark mode, editing and replaying a request to the local test API',
    caption: 'Your request, its own tab. Edit, replay and compare without losing your place.',
  },
  runner: {
    ...APISIP_SCREENSHOTS.runner,
    alt: 'ApiSip timed-run analytics in dark mode using synthetic data from the local test server',
    caption: 'Set the pace. Follow the timings, outcomes and delays in one local report.',
  },
  lab: {
    ...APISIP_SCREENSHOTS.lab,
    alt: 'ApiSip Test lab with a saved two-step workflow using only the local demo API, response checks and variable extraction',
    caption: 'Capture once. Save a suite, check responses and pass values into the next request.',
  },
};
const tabs = [...document.querySelectorAll('[data-shot]')];
const showcaseImage = document.getElementById('showcase-image');
const caption = document.getElementById('showcase-caption');
const panel = document.getElementById('showcase-panel');
function selectScreenshot(tab) {
  const screenshot = screenshots[tab.dataset.shot];
  if (!screenshot) return;
  tabs.forEach((item) => {
    item.setAttribute('aria-selected', String(item === tab));
    item.tabIndex = item === tab ? 0 : -1;
  });
  panel.setAttribute('aria-labelledby', tab.id);
  showcaseImage.src = screenshot.src;
  showcaseImage.srcset = screenshot.srcset;
  showcaseImage.dataset.full = screenshot.full;
  showcaseImage.alt = screenshot.alt;
  showcaseImage.title = screenshot.alt;
  caption.textContent = screenshot.caption;
  if (!reducedMotion.matches) {
    showcaseImage.classList.remove('image-enter');
    requestAnimationFrame(() => showcaseImage.classList.add('image-enter'));
  }
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectScreenshot(tab));
  tab.addEventListener('keydown', (event) => {
    const positions = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(event.key in positions)) return;
    event.preventDefault();
    const next = tabs[positions[event.key]];
    selectScreenshot(next);
    next.focus();
  });
});
document.getElementById('expand-screenshot').addEventListener('click', () => {
  const image = document.getElementById('expanded-image');
  image.src = showcaseImage.dataset.full || APISIP_SCREENSHOTS.capture.full;
  image.alt = showcaseImage.alt;
  image.title = showcaseImage.title;
  document.getElementById('screenshot-dialog').showModal();
});

const extensionsGuide = document.getElementById('show-extensions-guide');
extensionsGuide.hidden = false;
extensionsGuide.addEventListener('click', () => {
  document.getElementById('extensions-guide-dialog').showModal();
  track('install_menu_guide');
});

document
  .querySelectorAll('[data-event]')
  .forEach((link) => link.addEventListener('click', () => track(link.dataset.event)));
document.getElementById('feedback-form').addEventListener('submit', (event) => {
  const form = event.currentTarget;
  const message = document.getElementById('feedback-status');
  const title = form.elements.namedItem('title').value.trim();
  const body = form.elements.namedItem('body').value.trim();
  if (!title || !body) {
    event.preventDefault();
    message.textContent = 'Add a short title and describe your feedback.';
    return;
  }
  const url = new URL(form.action);
  url.search = new URLSearchParams(new FormData(form)).toString();
  if (url.href.length > 7500) {
    event.preventDefault();
    message.textContent = 'Please shorten the message before continuing to GitHub.';
    return;
  }
  track('feedback_continue');
  message.textContent = 'Continue in GitHub to review and submit. Nothing is posted automatically.';
});
let installationTracked = false;
function trackInstallationView() {
  if (installationTracked || downloadDialog.open) return;
  installationTracked = true;
  track('install_view');
  installationObserver.disconnect();
}
const installationObserver = new IntersectionObserver(
  (entries) => {
    if (entries.some((entry) => entry.isIntersecting)) trackInstallationView();
  },
  { threshold: 0.2 },
);
initializeAnalytics();
installationObserver.observe(document.getElementById('install'));

if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.07 },
  );
  root.classList.add('motion-ready');
  document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
}
