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
document.querySelectorAll('[data-download]').forEach((link) => {
  link.addEventListener('click', (event) => {
    // Let the real release link start its download. The support message never gates it.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    closeNavigation();
    if (!downloadDialog.open) downloadDialog.showModal();
  });
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
    src: 'screenshots/response-light.png',
    alt: 'ApiSip displaying a JSON response from its local test API at 127.0.0.1:4177',
    caption: 'Live requests, readable responses, and the details that matter.',
  },
  editor: {
    src: 'screenshots/editor-dark.png',
    alt: 'ApiSip standalone request editor in dark mode, editing and replaying a request to the local test API',
    caption: 'Your request, its own tab. Edit, replay and compare without losing your place.',
  },
  runner: {
    src: 'screenshots/runner-dark.png',
    alt: 'ApiSip timed-run analytics in dark mode using synthetic data from the local test server',
    caption: 'Set the pace. Follow the timings, outcomes and delays in one local report.',
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
  showcaseImage.alt = screenshot.alt;
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
  image.src = showcaseImage.src;
  image.alt = showcaseImage.alt;
  document.getElementById('screenshot-dialog').showModal();
});

let toastTimeout;
function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => element.classList.remove('visible'), 4500);
}
document.getElementById('copy-extensions').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('chrome://extensions');
    toast('Address copied. Paste it into Chrome’s address bar.');
  } catch {
    const code = document.querySelector('.copy-field code');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(code);
    selection?.removeAllRanges();
    selection?.addRange(range);
    toast('Copy wasn’t available. Select and copy the highlighted address.');
  }
});

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
