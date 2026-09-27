// Page-level behavior: the header rating that climbs as you read, and the two
// hidden vouch cards that flip at the same moment.
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
  const pastTitle = title ? title.getBoundingClientRect().bottom < 0 : window.scrollY > 200;
  header?.classList.toggle('is-scrolled', pastTitle);
}

function onScroll() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(update);
  }
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
update();

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
    revealBtn.textContent = open ? 'Seal them again' : 'Both are in. Reveal them.';
    revealBtn.setAttribute('aria-pressed', String(open));
    if (revealNote) {
      revealNote.textContent = open
        ? 'Both opened at the same moment, so neither could be written to match the other.'
        : "An example. Neither person could read the other's before writing.";
    }
  };
  revealNote?.setAttribute('aria-live', 'polite');
  setOpen(false);
  revealBtn.addEventListener('click', () => setOpen(!reveal.classList.contains('is-open')));
}
