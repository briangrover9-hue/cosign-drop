// One motion system for the whole drop. Anything that moves uses one easing,
// cubic-bezier(.16, 1, .3, 1), over 500ms; hover and press changes take 200ms; text fades take
// 600ms. style.css holds the same values as custom properties for CSS, and this module gives
// scripts the same curve, so a dot the lab moves and a scene CSS moves ease alike.

export const MOVE_MS = 500;
export const PRESS_MS = 200;
export const FADE_MS = 600;

export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
export const motionAllowed = () => !reduceMotion.matches;

// cubic-bezier(x1, y1, x2, y2) as a function of elapsed time from 0 to 1, solved the way
// browsers solve it: Newton's method on x, with bisection when the slope is too flat.
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const xAt = (t) => ((ax * t + bx) * t + cx) * t;
  const yAt = (t) => ((ay * t + by) * t + cy) * t;
  const slope = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = xAt(t) - x;
      if (Math.abs(error) < 1e-6) return yAt(t);
      const d = slope(t);
      if (Math.abs(d) < 1e-6) break;
      t -= error / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (hi - lo > 1e-6) {
      if (xAt(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return yAt(t);
  };
}

export const ease = cubicBezier(0.16, 1, 0.3, 1);

// Calls onFrame with the eased progress, 0 to 1, on every frame for ms milliseconds, then
// done. Returns a function that stops it early.
export function animate(ms, onFrame, done) {
  const start = performance.now();
  let id = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    onFrame(ease(t));
    if (t < 1) id = requestAnimationFrame(step);
    else if (done) done();
  };
  id = requestAnimationFrame(step);
  return () => cancelAnimationFrame(id);
}

// A line of text that changes by crossfading: the old words fade out while the new ones fade
// in, in the same place, so nothing around the line moves. The element's first words are
// wrapped the first time it changes. Text fades take 600ms, with reduced motion too.
export function setLine(el, text) {
  if (!el) return;
  let now = el.querySelector(':scope > .line-copy.is-now');
  if (!now) {
    now = document.createElement('span');
    now.className = 'line-copy is-now is-shown';
    now.textContent = el.textContent.trim();
    el.textContent = '';
    el.append(now);
  }
  if (now.textContent === text) return;
  const next = document.createElement('span');
  next.className = 'line-copy is-now';
  next.textContent = text;
  now.classList.remove('is-now', 'is-shown');
  now.setAttribute('aria-hidden', 'true');
  const old = now;
  setTimeout(() => old.remove(), FADE_MS + 60);
  el.append(next);
  requestAnimationFrame(() => requestAnimationFrame(() => next.classList.add('is-shown')));
}
