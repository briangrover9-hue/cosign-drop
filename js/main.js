// Page-level behavior: the header rating that climbs as you read, keeping the
// reader's place while the page builds, and the two hidden vouch cards that flip
// at the same moment.
import { setStarRow } from './stars.js';

const header = document.querySelector('.site-header');
const rating = document.getElementById('page-rating');
const ratingStars = rating?.querySelector('svg');
const ratingNum = rating?.querySelector('.num');
const title = document.getElementById('title');

// The page's own rating starts at an honest 3.0 and drifts to 5.0 by the end.
const START = 3;
const END = 5;
let lastShown = '';
let ticking = false;

function update() {
  ticking = false;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  const value = START + (END - START) * progress;
  const shown = value.toFixed(1);
  if (shown !== lastShown && ratingNum && ratingStars) {
    lastShown = shown;
    ratingNum.textContent = shown;
    setStarRow(ratingStars, Number(shown));
  }
  if (!header) return;
  // The hairline marks the bar as soon as anything is under it. The bar's title
  // takes over once the headline has gone fully behind the bar.
  const barBottom = header.offsetHeight;
  header.classList.toggle('is-scrolled', window.scrollY > 0);
  header.classList.toggle('is-titled', title ? title.getBoundingClientRect().bottom <= barBottom : window.scrollY > 200);
}

function onScroll() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(update);
  }
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
// The page also changes height with no scroll event: charts arriving, the lab's drawer opening.
if ('ResizeObserver' in window) new ResizeObserver(onScroll).observe(document.body);
update();

// Reloads and links to a section. The charts build once their data arrives, which
// can be after the browser has restored the reader's place or jumped to the link,
// and each chart above the reader then moves the text. Until the reader scrolls,
// taps or types, put the place back after every change in the page's height.
const PLACE_KEY = 'everyones-a-4.8:scroll-y';
const savePlace = () => {
  try {
    sessionStorage.setItem(PLACE_KEY, String(Math.round(window.scrollY)));
  } catch {
    // Storage can be switched off; the browser's own restore still runs.
  }
};
window.addEventListener('pagehide', savePlace);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') savePlace();
});

function holdPlace() {
  if (!('ResizeObserver' in window)) return;
  const type = performance.getEntriesByType?.('navigation')[0]?.type;
  let putBack = null;
  if (type === 'reload' || type === 'back_forward') {
    let y = NaN;
    try {
      y = Number(sessionStorage.getItem(PLACE_KEY));
    } catch {
      return;
    }
    if (y > 0) putBack = () => window.scrollTo(0, y);
  } else if (location.hash.length > 1) {
    let target = null;
    try {
      target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    } catch {
      return;
    }
    if (target) putBack = () => target.scrollIntoView();
  }
  if (!putBack) return;
  const holder = new ResizeObserver(() => putBack());
  const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  const release = () => {
    holder.disconnect();
    inputs.forEach((name) => window.removeEventListener(name, release, true));
  };
  inputs.forEach((name) => window.addEventListener(name, release, { capture: true, passive: true }));
  holder.observe(document.body);
  // A chart slower than this lands wherever the browser leaves it.
  const later = () => setTimeout(release, 4000);
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
}
holdPlace();

// iOS Safari has needed a touch listener on the page before it shows :active on a tap, which
// the buttons use for press feedback. The listener is passive and does nothing else.
document.addEventListener('touchstart', () => {}, { passive: true });

// Blind reveal: both cards stay face down until both vouches are in, then flip together.
const reveal = document.getElementById('reveal');
const revealBtn = document.getElementById('reveal-btn');
const revealNote = document.getElementById('reveal-note');

if (reveal && revealBtn) {
  const fronts = reveal.querySelectorAll('.card-front');
  const backs = reveal.querySelectorAll('.card-back');
  const setOpen = (open) => {
    reveal.classList.toggle('is-open', open);
    fronts.forEach((el) => el.setAttribute('aria-hidden', String(open)));
    backs.forEach((el) => el.setAttribute('aria-hidden', String(!open)));
    // The label names the next action, so the button carries no aria-pressed state:
    // "Seal them again, pressed" would contradict itself.
    revealBtn.textContent = open ? 'Seal them again' : 'Both are in. Reveal them.';
    if (revealNote) {
      revealNote.textContent = open
        ? 'Both opened at the same moment, so neither could be written to match the other.'
        : "An example. Neither person could read the other's before writing.";
    }
  };
  setOpen(false);
  revealNote?.setAttribute('aria-live', 'polite'); // after the first setOpen, so load is silent
  revealBtn.addEventListener('click', () => setOpen(!reveal.classList.contains('is-open')));
}
