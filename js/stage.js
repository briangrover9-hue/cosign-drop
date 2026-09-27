// The stage: six full-screen scenes under a fixed frame. One scroll, swipe or arrow key moves
// one scene, and the frame keeps the title, the page's climbing rating, the counter and its dots.
// Scenes 4 and 5 share one section, the lab: its chart stays put while its text changes. A
// "Why?" in a scene opens a few sentences of evidence in a frosted card over the scene's text.
//
// Every change is announced as a "stage:scene" event on document, with the scene's index and
// id, the one before it and the direction. The charts and the lab use it to play, pause and
// replay. The current index is also on <html data-scene>, for CSS and for scripts that load later.
//
// On screens under 500px tall the scenes cannot fit, so the page becomes a plain scroll
// (no .stage-on), and the current scene follows the reader's scroll position instead.
import { MOVE_MS, animate, motionAllowed } from './motion.js';
import { setStarRow } from './stars.js';

const html = document.documentElement;
const SCENES = [
  { id: 'start', section: 0, beat: null, rating: 3.0 },
  { id: 'everywhere', section: 1, beat: null, rating: 3.4 },
  { id: 'guess', section: 2, beat: null, rating: 3.8 },
  { id: 'lab', section: 3, beat: 'lab', rating: 4.2 },
  { id: 'fix', section: 3, beat: 'fix', rating: 4.6 },
  { id: 'cosign', section: 4, beat: null, rating: 5.0 },
];
const LAST = SCENES.length - 1;
const sections = [...document.querySelectorAll('.stage > .scene')];
const stageFits = window.matchMedia('(min-height: 500px)');
const frameNow = document.querySelector('.frame-now');
const dots = [...document.querySelectorAll('.frame-dots [data-go]')];
const ratingStars = document.querySelector('#page-rating .stars');
const ratingNum = document.querySelector('.page-rating-num');
const ratingSaid = document.getElementById('rating-said');

let current = -1;
let shownRating = 3;
let stopRating = null;
const leaveTimers = new Map();

const unitOf = (i) => {
  const s = SCENES[i];
  const section = sections[s.section];
  return s.beat ? section.querySelector(`.beat[data-beat="${s.beat}"]`) : section;
};
const staged = () => html.classList.contains('stage-on');
// While "Try other rules" is open, the lab owns the keys and the wheel.
const tuning = () => html.classList.contains('is-tuning');

/* ---------- Words and arrivals ---------- */

// Each headline becomes one word per span, so the words can arrive one at a time. Screen
// readers get the plain sentence; the words are hidden from them.
function splitWords(el) {
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  const said = document.createElement('span');
  said.className = 'visually-hidden';
  said.textContent = text;
  const shown = document.createElement('span');
  shown.setAttribute('aria-hidden', 'true');
  text.split(' ').forEach((word, i) => {
    if (i) shown.append(' ');
    const w = document.createElement('span');
    w.className = 'w';
    // Past the tenth word the rest arrive together, so a long headline still lands quickly.
    w.style.setProperty('--i', String(Math.min(i, 10)));
    w.textContent = word;
    shown.append(w);
  });
  el.replaceChildren(said, shown);
  return text.split(' ').length;
}

// Every other piece of a scene arrives after its headline has started: the visual first, then
// the text under the headline, one piece at a time. Every piece has started by 480ms, so the
// whole scene is in within about a second of the key press.
function setDelays(unit, words) {
  let k = 0;
  for (const el of unit.querySelectorAll('[data-rise]')) {
    if (el.closest('.beat') !== (unit.classList.contains('beat') ? unit : null)) continue;
    const visual = el.classList.contains('scene-visual');
    el.style.setProperty('--delay', `${visual ? 60 : Math.min(480, 200 + Math.min(words, 10) * 20 + k++ * 60)}ms`);
  }
}

function stageUnit(unit) {
  unit.classList.remove('is-in');
  unit.classList.add('is-staged');
}
function enterUnit(unit) {
  unit.classList.remove('is-staged');
  unit.classList.add('is-in');
}

/* ---------- Moving between scenes ---------- */

function setInert(el, value) {
  if (value) el.setAttribute('inert', '');
  else el.removeAttribute('inert');
}

// Hides a section or a beat after its fade, and puts its pieces back at their start.
function leave(el) {
  el.classList.remove('is-current');
  if (el.classList.contains('scene')) el.classList.add('is-leaving');
  clearTimeout(leaveTimers.get(el));
  leaveTimers.set(
    el,
    setTimeout(() => {
      el.classList.remove('is-leaving');
      if (el.classList.contains('is-current')) return;
      setInert(el, true);
      stageUnit(el);
      el.querySelectorAll('.beat').forEach(stageUnit);
    }, MOVE_MS + 40),
  );
  setInert(el, true);
}

function arrive(el) {
  clearTimeout(leaveTimers.get(el));
  el.classList.remove('is-leaving');
  el.classList.add('is-current');
  setInert(el, false);
}

function go(next, { focus = false, from = 'input' } = {}) {
  next = Math.max(0, Math.min(LAST, next));
  if (next === current) return false;
  const focusInCard = Boolean(openWhy && openWhy.card.contains(document.activeElement));
  closeWhy(false);
  const prev = current;
  current = next;
  const dir = prev < 0 || next > prev ? 1 : -1;
  html.style.setProperty('--dir', String(dir));

  const nextScene = SCENES[next];
  const nextSection = sections[nextScene.section];
  const nextUnit = unitOf(next);
  const prevScene = prev >= 0 ? SCENES[prev] : null;
  const prevSection = prevScene ? sections[prevScene.section] : null;
  const prevUnit = prev >= 0 ? unitOf(prev) : null;
  const newSection = prevSection !== nextSection;
  const hadFocus = prevUnit && prevUnit.contains(document.activeElement);

  if (staged()) {
    // A tab in the background paints no frames, so a scene changed there would not start its
    // arrival until the reader came back. There the scene is simply in place. The first scene
    // still arrives in motion, when the reader first looks.
    const sudden = document.hidden && from !== 'load';
    if (sudden) html.classList.add('is-sudden');
    // Stage the arriving pieces at their start, in this direction, before anything moves.
    if (newSection) stageUnit(nextSection);
    if (nextUnit !== nextSection) stageUnit(nextUnit);
    void nextSection.offsetWidth;
    if (newSection && prevSection) leave(prevSection);
    if (prevUnit && prevUnit !== prevSection && prevUnit !== nextUnit && !newSection) leave(prevUnit);
    arrive(nextSection);
    if (nextUnit !== nextSection) {
      nextSection.querySelectorAll('.beat').forEach((beat) => {
        if (beat !== nextUnit) {
          beat.classList.remove('is-current');
          if (newSection) {
            setInert(beat, true);
            stageUnit(beat);
          }
        }
      });
      arrive(nextUnit);
      nextSection.dataset.beat = nextScene.beat;
    }
    // The pieces start on their way now, from the start the reflow above fixed, instead of on
    // the next frame, so a late frame never holds the words back.
    if (newSection) enterUnit(nextSection);
    if (nextUnit !== nextSection) enterUnit(nextUnit);
    if (sudden) {
      void nextSection.offsetWidth;
      html.classList.remove('is-sudden');
    }
    if (focus || hadFocus || focusInCard) {
      nextUnit.querySelector('.scene-title')?.focus({ preventScroll: true });
    }
  }

  updateFrame(next);
  if (from !== 'load' && from !== 'scroll') {
    const url = next === 0 ? location.pathname + location.search : `#${nextScene.id}`;
    history.replaceState(null, '', url);
  }
  document.dispatchEvent(new CustomEvent('stage:scene', { detail: sceneDetail(next, prev, dir) }));
  return true;
}

const sceneDetail = (index, previous, direction) => ({
  index,
  previous,
  id: SCENES[index].id,
  previousId: previous >= 0 ? SCENES[previous].id : null,
  direction,
  staged: staged(),
});

function updateFrame(i) {
  html.dataset.scene = String(i);
  if (frameNow) frameNow.textContent = String(i + 1).padStart(2, '0');
  dots.forEach((dot, k) => {
    if (k === i) dot.setAttribute('aria-current', 'step');
    else dot.removeAttribute('aria-current');
  });
  const target = SCENES[i].rating;
  if (ratingSaid) {
    ratingSaid.textContent =
      i === LAST
        ? 'This page’s own rating is now 5.0, like everything else.'
        : `This page’s own rating is ${target.toFixed(1)} and climbs with each scene.`;
  }
  if (stopRating) stopRating();
  const from = shownRating;
  const show = (v) => {
    shownRating = v;
    if (ratingNum) ratingNum.textContent = v.toFixed(1);
    if (ratingStars) setStarRow(ratingStars, Number(v.toFixed(1)));
  };
  if (!motionAllowed() || document.hidden) show(target);
  else stopRating = animate(MOVE_MS, (e) => show(from + (target - from) * e));
}

/* ---------- "Why?" ---------- */

// A few plain sentences of evidence, with their sources, in a frosted card over the scene's
// text, so a curious reader goes deeper without leaving the scene. The chart stays as it was.
// Without the stage the card simply opens in the page.
let openWhy = null;
function openCard(button) {
  const card = document.getElementById(button.getAttribute('aria-controls'));
  if (!card) return;
  closeWhy(false);
  const section = card.closest('.scene');
  const text = section.querySelector('.scene-text');
  card.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  if (staged()) {
    section.classList.add('is-why');
    if (text) text.inert = true;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-open')));
  card.focus({ preventScroll: true });
  openWhy = { button, card, section, text };
}
function closeWhy(returnFocus = true) {
  if (!openWhy) return;
  const { button, card, section, text } = openWhy;
  openWhy = null;
  card.classList.remove('is-open');
  button.setAttribute('aria-expanded', 'false');
  section.classList.remove('is-why');
  if (text) text.inert = false;
  setTimeout(() => {
    if (!card.classList.contains('is-open')) card.hidden = true;
  }, MOVE_MS);
  if (returnFocus) button.focus({ preventScroll: true });
}
document.querySelectorAll('.why-button').forEach((button) => {
  button.addEventListener('click', () => (button.getAttribute('aria-expanded') === 'true' ? closeWhy() : openCard(button)));
});
document.querySelectorAll('[data-why-close]').forEach((button) => button.addEventListener('click', () => closeWhy()));
// A press anywhere outside the open card closes it.
document.addEventListener('pointerdown', (event) => {
  if (!openWhy || !(event.target instanceof Element)) return;
  if (!openWhy.card.contains(event.target) && !event.target.closest('.why-button')) closeWhy(false);
});
document.addEventListener('stage:close-why', () => closeWhy(false));

/* ---------- Input ---------- */

// Can this element, or one it sits in, scroll further in this direction? Then the wheel is
// its, not the stage's.
function scrollsInside(target, dy) {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
    if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
  }
  return false;
}

// One scene per gesture. A trackpad's swipe keeps sending wheel events for a second or more
// after the fingers lift, so after a move the stage waits for the wheel to go quiet before it
// listens again; a mouse wheel's notches do the same, one scene per spin.
let wheelSum = 0;
let wheelLast = 0;
let wheelQuiet = false;
let wheelLock = 0;
window.addEventListener(
  'wheel',
  (event) => {
    if (!staged() || event.ctrlKey) return; // ctrl + wheel is the browser's zoom
    if (tuning() || scrollsInside(event.target, event.deltaY)) return;
    event.preventDefault();
    const now = performance.now();
    const gap = now - wheelLast;
    wheelLast = now;
    if (wheelQuiet) {
      if (gap < 220) return;
      wheelQuiet = false;
    }
    if (gap > 220) wheelSum = 0;
    if (now < wheelLock) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const dy = event.deltaY * unit;
    if (Math.abs(dy) < Math.abs(event.deltaX * unit)) return;
    wheelSum += dy;
    if (Math.abs(wheelSum) >= 40) {
      const moved = go(current + Math.sign(wheelSum));
      wheelSum = 0;
      if (moved) {
        wheelLock = now + MOVE_MS + 150;
        wheelQuiet = true;
      }
    }
  },
  { passive: false },
);

// Swipes: up for the next scene, down for the one before. A touch that starts on a slider or
// in the rules panel belongs to that control.
let touch = null;
const touchable = (target) => !(target instanceof Element && target.closest('input[type="range"], .lab-panel'));
document.addEventListener(
  'touchstart',
  (event) => {
    if (!staged() || tuning() || event.touches.length !== 1 || !touchable(event.target)) {
      touch = null;
      return;
    }
    const area = event.target instanceof Element ? event.target.closest('.scene-visual') : null;
    const scrolls = area && area.scrollHeight > area.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(area).overflowY);
    touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, area: scrolls ? area : null, top: scrolls ? area.scrollTop : 0 };
  },
  { passive: true },
);
document.addEventListener(
  'touchmove',
  (event) => {
    if (event.touches.length > 1) touch = null; // a second finger: the reader is zooming
    if (touch && touch.area) return; // an area that scrolls scrolls natively
    if (touch && event.cancelable) event.preventDefault(); // no rubber band while swiping
  },
  { passive: false },
);
document.addEventListener('touchend', (event) => {
  if (!touch) return;
  const t = event.changedTouches[0];
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  const { area, top } = touch;
  touch = null;
  // A swipe that scrolled its area stays in the scene; one at the area's end moves the scene.
  if (area) {
    if (Math.abs(area.scrollTop - top) > 2) return;
    const atEnd = dy < 0 ? area.scrollTop + area.clientHeight >= area.scrollHeight - 2 : area.scrollTop <= 0;
    if (!atEnd) return;
  }
  if (Math.abs(dy) > 44 && Math.abs(dy) > Math.abs(dx) * 1.2) go(current + (dy < 0 ? 1 : -1));
});
document.addEventListener('touchcancel', () => (touch = null));

// Keys: down, Page Down and space go forward; up, Page Up and shift + space go back; Home and
// End jump to the ends. A key pressed in a slider or a switch group stays with that control.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openWhy) {
    event.preventDefault();
    closeWhy();
    return;
  }
  if (!staged() || tuning() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target instanceof Element ? event.target : document.body;
  if (target.closest('input, select, textarea, [contenteditable]')) return;
  const onControl = target.closest('button, a, summary');
  let next = null;
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowRight':
    case 'PageDown':
      next = current + 1;
      break;
    case 'ArrowUp':
    case 'ArrowLeft':
    case 'PageUp':
      next = current - 1;
      break;
    case ' ':
      if (onControl) return;
      next = current + (event.shiftKey ? -1 : 1);
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = LAST;
      break;
    default:
      return;
  }
  event.preventDefault();
  go(next, { focus: !target.closest('.frame-bottom') });
});

// The dots, the cue and the title: a click goes to that scene.
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-go]') : null;
  if (!target) return;
  const index = Number(target.dataset.go);
  if (!staged()) {
    const unit = unitOf(index);
    event.preventDefault();
    unit.scrollIntoView({ behavior: motionAllowed() ? 'smooth' : 'auto', block: 'start' });
    return;
  }
  event.preventDefault();
  if (tuning()) document.dispatchEvent(new CustomEvent('lab:close-rules'));
  go(index, { focus: target.classList.contains('frame-cue') });
});

// A link to one of the scenes, from this page or another.
function sceneFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const i = SCENES.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}
window.addEventListener('hashchange', () => go(sceneFromHash(), { focus: true, from: 'hash' }));

/* ---------- Without the stage: the scroll decides ---------- */

let scrollTicking = false;
function followScroll() {
  scrollTicking = false;
  if (staged()) return;
  const line = window.innerHeight * 0.5;
  let i = 0;
  SCENES.forEach((s, k) => {
    if (unitOf(k).getBoundingClientRect().top <= line) i = k;
  });
  go(i, { from: 'scroll' });
}
window.addEventListener(
  'scroll',
  () => {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(followScroll);
    }
  },
  { passive: true },
);

// Stage on or off, as the screen's height allows.
function applyMode() {
  const on = stageFits.matches;
  html.classList.toggle('stage-on', on);
  const units = [...sections, ...document.querySelectorAll('.stage .beat')];
  if (!on) {
    // A plain page: every piece in place and reachable.
    units.forEach((u) => {
      setInert(u, false);
      enterUnit(u);
    });
    followScroll();
    return;
  }
  const scene = SCENES[Math.max(0, current)];
  sections.forEach((section, k) => {
    const here = k === scene.section;
    section.classList.toggle('is-current', here);
    section.classList.remove('is-leaving');
    setInert(section, !here);
    if (here) enterUnit(section);
    else stageUnit(section);
  });
  document.querySelectorAll('.stage .beat').forEach((beat) => {
    const here = beat === unitOf(Math.max(0, current));
    beat.classList.toggle('is-current', here);
    setInert(beat, !here);
    if (here) enterUnit(beat);
    else stageUnit(beat);
  });
}
stageFits.addEventListener('change', () => {
  applyMode();
  document.dispatchEvent(new CustomEvent('stage:scene', { detail: sceneDetail(current, current, 0) }));
});

/* ---------- Start ---------- */

document.querySelectorAll('.why-card').forEach((card) => (card.hidden = true));

let words = 0;
document.querySelectorAll('[data-words]').forEach((el) => {
  const n = splitWords(el);
  const unit = el.closest('.beat') || el.closest('.scene');
  unit.dataset.words = String(n);
});
[...sections, ...document.querySelectorAll('.stage .beat')].forEach((unit) => {
  words = Number(unit.dataset.words || (unit.querySelector('.beat') ? 0 : 6));
  setDelays(unit, words);
  stageUnit(unit);
});

const first = sceneFromHash();
html.dataset.scene = String(first);
sections.forEach((section) => section.classList.remove('is-current'));

// The first scene arrives once the fonts are in, so its words do not reflow as they rise; a
// slow font gets 400ms before the scene arrives in the fallback face.
const fontsIn = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 400))]) : Promise.resolve();
fontsIn.then(() => {
  if (staged()) {
    sections.forEach((section) => setInert(section, true));
    document.querySelectorAll('.stage .beat').forEach((beat) => setInert(beat, true));
  }
  html.classList.add('stage-ready');
  go(first, { from: 'load' });
  if (!staged()) applyMode();
});
