// The charts in "Everyone's a 4.8":
//   #guess-root     scene 2: guess the typical Airbnb rating, then see every listing
//   #drift-root     scene 3: 100 stars per rating system, gold for the share at the top
//   #why-now-root   methods page: what employers would pay before ChatGPT and in 2024
//   #validity-root  methods page: how well hiring methods predict the job, 1998 and 2022
//
// Each container starts with a fallback (a table, list or sentence). Once a chart's data
// loads, a table fallback moves into a visually hidden wrapper, so screen readers still get
// the numbers, and the chart renders beside it. The drift list and the guess sentence are
// removed instead: the drift chart's own text gives every number, and the guess sentence would
// tell screen reader users the answer before they guess. If the data cannot load, the
// fallback stays.
//
// On the stage the scene charts fill each time their scene arrives ("stage:scene" events from
// stage.js); on the methods page the charts fill each time they scroll into view.

import { STAR_PATH, starRow, setStarRow } from './stars.js';
import { MOVE_MS, animate, motionAllowed, setLine } from './motion.js';

const wideLayout = window.matchMedia('(min-width: 720px)');
const html = document.documentElement;

// The page starts its requests in its head (window.chartData); fetch here only if it didn't.
function loadJSON(name, path) {
  const early = window.chartData && window.chartData[name];
  const request = (early || fetch(new URL(path, import.meta.url))).then((res) => {
    if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
    return res.json();
  });
  request.catch(() => {}); // Each chart reports its own failure.
  return request;
}

const has = (id) => Boolean(document.getElementById(id));
const figuresReady = ['guess-root', 'drift-root', 'why-now-root', 'validity-root'].some(has) ? loadJSON('figures', '../data/figures.json') : null;
const airbnbReady = has('guess-root') ? loadJSON('airbnb', '../data/airbnb.json') : null;

/* Small helpers */

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const crisp = (v) => Math.round(v) + 0.5; // centers a 1px line on a pixel
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const oneDecimal = (n) => (Math.round(n * 10) / 10).toFixed(1);
const dec = (v) => v.toFixed(2).replace(/^0/, ''); // .54 style: two decimals, no leading zero

// The stage's scene changes: the handler gets each one, and the current scene at once.
const SCENE_IDS = ['start', 'everywhere', 'guess', 'lab', 'fix', 'cosign'];
function onScene(handler) {
  document.addEventListener('stage:scene', (event) => handler(event.detail));
  if (html.dataset.scene !== undefined && html.classList.contains('stage-ready')) {
    const index = Number(html.dataset.scene);
    handler({ index, previous: -1, id: SCENE_IDS[index], previousId: null, direction: 1, staged: html.classList.contains('stage-on') });
  }
}

// Builds a chart, then moves the fallback out of sight, or removes it when dropFallback
// is set. On any failure the chart's own nodes are removed and the fallback stays where it was.
async function mount(id, build, { dropFallback = false } = {}) {
  const root = document.getElementById(id);
  if (!root) return;
  const fallback = root.querySelector(':scope > .fallback');
  const existing = new Set(root.children);
  try {
    await build(root);
    if (fallback && dropFallback) {
      fallback.remove();
    } else if (fallback) {
      const hidden = document.createElement('div');
      hidden.className = 'visually-hidden';
      root.insertBefore(hidden, fallback);
      hidden.append(fallback);
    }
  } catch (err) {
    [...root.children].forEach((node) => {
      if (!existing.has(node)) node.remove();
    });
    console.warn(`#${id} kept its fallback because the chart could not be built.`, err);
  }
}

// Calls render(width, height) now and again whenever the element's size settles on new values.
// Returns a function that forces a render at the current size.
function watchSize(el, render) {
  let last = '';
  let timer = 0;
  const check = (force) => {
    const width = Math.floor(el.clientWidth);
    const height = Math.floor(el.clientHeight);
    const key = `${width}x${height}`;
    if (width > 0 && (force === true || key !== last)) {
      last = key;
      render(width, height);
    }
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(check, 90);
  };
  check();
  if ('ResizeObserver' in window) new ResizeObserver(later).observe(el);
  else window.addEventListener('resize', later);
  return () => check(true);
}

// Calls enter each time el comes well into view, and leave once it has gone off the screen
// entirely, so a chart can refill every time the reader scrolls back to it (methods page).
function eachTimeInView(el, { enter, leave }, share = 0.9) {
  if (!('IntersectionObserver' in window)) {
    enter();
    return;
  }
  const headerHeight = document.querySelector('.site-header')?.offsetHeight ?? 0;
  let armed = true;
  new IntersectionObserver(
    (entries) => {
      const seen = entries.some((e) => {
        const tall = e.rootBounds && e.intersectionRect.height >= e.rootBounds.height * share;
        return e.isIntersecting && (e.intersectionRatio >= share || tall);
      });
      if (seen && armed) {
        armed = false;
        enter();
      }
    },
    { rootMargin: `-${headerHeight}px 0px -20% 0px`, threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
  ).observe(el);
  new IntersectionObserver((entries) => {
    if (!entries[entries.length - 1].isIntersecting && !armed) {
      armed = true;
      leave();
    }
  }).observe(el);
}

// Puts a chart back to its empty state at once, ready to fill again.
function unfill(el) {
  if (!el) return;
  el.classList.add('is-resetting', 'is-pending');
  void el.getBoundingClientRect(); // lands the empty state before transitions come back
  el.classList.remove('is-resetting');
}

// Removes the pending class after the first state has painted, so CSS transitions run.
function play(el, delay = 0) {
  const go = () => requestAnimationFrame(() => requestAnimationFrame(() => el && el.classList.remove('is-pending')));
  if (delay) setTimeout(go, delay);
  else go();
}

function svgTag(cls, width, height, label, body, pending) {
  return (
    `<svg class="ch-svg ${cls}${pending ? ' is-pending' : ''}" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${body}</svg>`
  );
}

// One gold star centered on (cx, cy), using the page's shared star classes.
function starGlyph(cx, cy, size, cls = '') {
  const k = Math.round((size / 24) * 10000) / 10000;
  return (
    `<g class="${cls}" transform="translate(${r2(cx - size / 2)} ${r2(cy - size / 2)}) scale(${k})">` +
    `<path class="star-fill" d="${STAR_PATH}"/>` +
    `<path class="star-edge" d="${STAR_PATH}" vector-effect="non-scaling-stroke"/></g>`
  );
}

/* 1. The guess: drag the star to a rating, then see every listing on the same scale */

// The slider thumb is the page's star, drawn from STAR_PATH. The image goes in as a literal
// rule, one per engine, because a rule that names both pseudo-elements is dropped everywhere
// and some engines do not pass custom properties into the thumb.
function addThumbStyle() {
  if (document.getElementById('gs-thumb-style')) return;
  const url = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${STAR_PATH}" ` +
      'fill="#dca320" stroke="#936f1c" stroke-width="1" stroke-linejoin="round"/></svg>',
  )}")`;
  const style = document.createElement('style');
  style.id = 'gs-thumb-style';
  style.textContent = `.gs-range::-webkit-slider-thumb{background-image:${url}}` + `.gs-range::-moz-range-thumb{background-image:${url}}`;
  document.head.append(style);
}

// Reads the 0.01-wide histogram and derives everything the reveal shows.
function histogramModel(air, expected) {
  const group = expected.group.split('.').reduce((node, key) => (node ? node[key] : undefined), air);
  const hist = group && group.histogram;
  const fine = hist && hist.bins_1_00_to_5_00_step_0_01;
  if (!Array.isArray(fine) || fine.length !== 401) throw new Error('Airbnb histogram not found');
  const below1 = hist.below_1 || 0;
  // cum[k] counts listings rated below 1 + k / 100.
  const cum = [below1];
  for (let i = 0; i < 401; i++) cum.push(cum[i] + fine[i]);
  const n = cum[401];
  const countBelow = (v) => cum[clamp(Math.round((v - 1) * 100), 0, 401)];
  const valueAtRank = (rank) => {
    let i = 0;
    while (i < 401 && cum[i + 1] < rank) i++;
    return 1 + i / 100;
  };
  const median = n % 2 ? valueAtRank((n + 1) / 2) : (valueAtRank(n / 2) + valueAtRank(n / 2 + 1)) / 2;

  // 0.05-wide bins: 1.00 to 1.04, 1.05 to 1.09, and so on; the last, 4.95 to 5.00, includes 5.00.
  const bins = [];
  for (let j = 0; j < 80; j++) {
    let sum = 0;
    for (let i = 5 * j; i < 5 * j + 5; i++) sum += fine[i];
    bins.push(sum);
  }
  bins[79] += fine[400];
  const maxCount = Math.max(...bins);
  const pct = (count) => (count / n) * 100;
  return {
    n,
    bins,
    maxCount,
    median,
    countBelow,
    shareBelow: (v) => pct(countBelow(v)),
    ge45: pct(n - countBelow(4.5)),
    ge48: pct(n - countBelow(4.8)),
    lt40: pct(countBelow(4.0)),
  };
}

function checkGuessFigures(m, g) {
  const checks = [
    ['shareAtLeast45', m.ge45],
    ['shareAtLeast48', m.ge48],
    ['shareBelow40', m.lt40],
  ];
  for (const [key, computed] of checks) {
    if (oneDecimal(computed) !== Number(g[key]).toFixed(1)) {
      console.warn(
        `Airbnb check: ${key} computes to ${oneDecimal(computed)} from the histogram, but figures.json says ` +
          `${g[key]} (a difference of ${r2(computed - g[key])} points).`,
      );
    }
  }
  if (m.n !== g.n) console.warn(`Airbnb check: the histogram holds ${m.n} listings, figures.json says ${g.n}.`);
  if (m.median.toFixed(2) !== Number(g.median).toFixed(2)) {
    console.warn(`Airbnb check: the histogram median is ${m.median.toFixed(2)}, figures.json says ${g.median}.`);
  }
}

// The thumb is 36px wide, so a value sits half a thumb in from each end of the track.
const THUMB_HALF = 18;

async function buildGuess(root) {
  const [figures, air] = await Promise.all([figuresReady, airbnbReady]);
  const g = figures.guess;
  const m = histogramModel(air, g);
  checkGuessFigures(m, g);

  const body = document.getElementById('guess-body');
  const intro = body ? body.textContent.trim() : '';
  const start = Number(g.defaultGuess ?? 3);
  const medianText = Number(g.median).toFixed(2);
  const answer = `By our own count of this year’s listings, half are rated ${medianText} or higher. When nearly everyone is near a 5, the rating stops telling you much.`;
  const ticks = [1, 2, 3, 4, 5].map((v) => `<span style="left:${(v - 1) * 25}%">${v}</span>`).join('');

  root.insertAdjacentHTML(
    'beforeend',
    `<div class="gs">` +
      `<div class="gs-plot">` +
      `<div class="gs-number" aria-hidden="true">` +
      `<p class="gs-number-label label line">Your guess</p>` +
      `<p class="gs-num">${start.toFixed(2)}</p>` +
      starRow(start, { size: 24, gap: 5, className: 'gs-stars' }) +
      `</div>` +
      `<div class="gs-hist"></div>` +
      `</div>` +
      `<div class="gs-slider">` +
      `<label class="visually-hidden" for="gs-range">Your guess, in stars</label>` +
      `<input class="gs-range" id="gs-range" type="range" min="1" max="5" step="0.05" value="${start}" ` +
      `autocomplete="off" aria-valuetext="${start.toFixed(2)} stars" aria-describedby="gs-hint">` +
      `<div class="gs-ticks" aria-hidden="true">${ticks}</div>` +
      `</div>` +
      `<div class="gs-foot">` +
      `<p class="gs-hint label line" id="gs-hint">Drag the star to your guess</p>` +
      `<button class="btn" type="button" data-act="show">Show me</button>` +
      `</div>` +
      `<p class="gs-message visually-hidden" aria-live="polite"></p>` +
      `</div>`,
  );

  const q = (sel) => root.querySelector(sel);
  const plot = q('.gs-plot');
  const hist = q('.gs-hist');
  const numberLabel = q('.gs-number-label');
  const num = q('.gs-num');
  const stars = q('.gs-stars');
  const range = q('.gs-range');
  const hint = q('.gs-hint');
  const button = q('[data-act]');
  const message = q('.gs-message');
  addThumbStyle();

  const state = { revealed: false, guess: null, shown: start, stop: null };

  const showNumber = (v) => {
    state.shown = v;
    num.textContent = v.toFixed(2);
    setStarRow(stars, v);
  };
  const showGuess = () => {
    const v = Number(range.value);
    showNumber(v);
    range.setAttribute('aria-valuetext', `${v.toFixed(2)} stars`);
  };
  range.addEventListener('input', showGuess);
  showGuess();

  // How many places are rated below the guess, as one short sentence.
  const belowSentence = (guess) => {
    const share = m.shareBelow(guess);
    if (share === 0) return 'None are rated below your guess.';
    if (share < 1) return 'Fewer than 1 in 100 are rated below your guess.';
    return `About ${Math.round(share)} in 100 are rated below your guess.`;
  };

  const label =
    `Histogram of ${m.n.toLocaleString('en-US')} listings on the full scale from 1 to 5: ` +
    `${oneDecimal(m.ge45)}% at 4.5 or above, and half are rated ${medianText} or higher.`;

  let size = { width: 0, height: 0 };
  const renderHist = (pending) => {
    if (!state.revealed || !size.width) return;
    hist.innerHTML = histogramSVG(m, size.width, size.height, pending, label);
  };
  watchSize(plot, (width, height) => {
    size = { width, height };
    renderHist(false);
  });

  const reveal = () => {
    state.revealed = true;
    state.guess = Number(range.value);
    range.disabled = true;
    root.classList.add('is-revealed');
    renderHist(true);
    play(hist.firstElementChild);
    if (state.stop) state.stop();
    const from = state.shown;
    const to = m.median;
    if (motionAllowed()) state.stop = animate(MOVE_MS, (e) => showNumber(from + (to - from) * e));
    else showNumber(to);
    setLine(numberLabel, 'The typical rating');
    setLine(hint, `Your guess ${state.guess.toFixed(2)} · typical ${medianText}`);
    setLine(body, answer);
    button.textContent = 'Guess again';
    button.classList.add('btn-quiet');
    message.textContent = `You guessed ${state.guess.toFixed(2)}. The typical place is rated ${medianText}. ${belowSentence(state.guess)}`;
    button.focus({ preventScroll: true });
  };

  const reset = () => {
    state.revealed = false;
    range.disabled = false;
    root.classList.remove('is-revealed');
    hist.innerHTML = '';
    if (state.stop) state.stop();
    showGuess();
    setLine(numberLabel, 'Your guess');
    setLine(hint, 'Drag the star to your guess');
    setLine(body, intro);
    button.textContent = 'Show me';
    button.classList.remove('btn-quiet');
    message.textContent = '';
    range.focus({ preventScroll: true });
  };

  button.addEventListener('click', () => (state.revealed ? reset() : reveal()));

  // Coming back to the guess after the reveal, the bars grow again.
  onScene(({ id, previousId }) => {
    if (id !== 'guess' || previousId === 'guess' || !state.revealed || !motionAllowed()) return;
    const svg = hist.firstElementChild;
    unfill(svg);
    play(svg, 160);
  });
}

// Bars rise from the slider's track, which is the axis: each value sits where the thumb would
// sit at that value, half a thumb in from either end.
function histogramSVG(m, W, H, pending, label) {
  const inset = THUMB_HALF;
  const plotW = W - 2 * inset;
  const x = (v) => inset + ((v - 1) / 4) * plotW;
  const top = 30; // room above the tallest bar for the labels
  const plotH = Math.max(40, H - top);
  const base = H;
  const pitch = plotW / m.bins.length;
  const gap = pitch >= 5 ? 1 : 0.5;

  const bx0 = x(4.8);
  const bx1 = x(5) + pitch / 2;
  let body = `<rect class="gs-band" x="${r2(bx0)}" y="${top - 12}" width="${r2(bx1 - bx0)}" height="${r2(base - top + 12)}"/>`;

  let d = '';
  m.bins.forEach((count, i) => {
    if (!count) return;
    const h = (count / m.maxCount) * plotH;
    d += `M${r2(inset + i * pitch + gap / 2)} ${base}v${r2(-h)}h${r2(pitch - gap)}v${r2(h)}z`;
  });
  body += `<path class="gs-bars" d="${d}" style="transform-origin:0 ${base}px"/>`;

  let anno = '';
  const xm = crisp(x(m.median) - 0.5);
  anno += `<line class="gs-median" x1="${xm}" x2="${xm}" y1="4" y2="${base}"/>`;
  anno += `<text class="gs-median-label" x="${xm - 6}" y="14" text-anchor="end">${m.median.toFixed(2)}</text>`;
  anno += `<text class="gs-band-label" x="${r2(bx0 - 6)}" y="${top + 2}" text-anchor="end">4.8+</text>`;
  return svgTag('gs-svg', W, H, label, `${body}<g class="gs-anno">${anno}</g>`, pending);
}

/* 2. The drift: a grid of 100 stars per system, filling as the scene arrives */

async function buildDrift(root) {
  const items = (await figuresReady).drift;
  const moving = motionAllowed();

  let markup =
    `<svg class="dr-sprite" aria-hidden="true" focusable="false">` +
    `<symbol id="dr-star" viewBox="0 0 24 24"><path d="${STAR_PATH}" vector-effect="non-scaling-stroke"/></symbol></svg>` +
    `<ul class="dr-list" role="list">`;

  items.forEach((it, g) => {
    const gold = Math.round((it.then || it.now).value);
    const total = Math.round(it.now.value);
    const pair = Boolean(it.then);
    let uses = '';
    // Fill from the bottom left, left to right, row by row upward, like a rising level.
    for (let k = 0; k < 100; k++) {
      const col = k % 10;
      const row = 9 - Math.floor(k / 10);
      const cls = k < gold ? 'dr-s1' : k < total ? 'dr-s2' : 'dr-s0';
      const delay = k < total ? ` style="--d:${Math.round(g * 90 + k * 7)}ms"` : '';
      uses += `<use href="#dr-star" class="${cls}" x="${col * 24 + 1}" y="${row * 24 + 1}" width="22" height="22"${delay}/>`;
    }
    const aria = pair
      ? `${it.title}, ${lowerFirst(it.measure)}: ${it.then.value}% in ${it.then.label} and ${it.now.value}% in ${it.now.label}. Grid of 100 stars: ${gold} gold and ${total - gold} lighter gold.`
      : `${it.title}, ${lowerFirst(it.measure)}: ${it.now.value}%. Grid of 100 stars: ${gold} gold.`;
    markup +=
      `<li class="dr-item${pair ? ' dr-pair' : ''}">` +
      `<svg class="dr-stars${moving ? ' is-pending' : ''}" viewBox="0 0 240 240" role="img" aria-label="${esc(aria)}">${uses}</svg>` +
      `<p class="dr-num" aria-hidden="true">${it.now.value}%</p>` +
      `<p class="dr-name label"><a href="${esc(it.source.url)}">${esc(it.name)}<span class="visually-hidden">, source: ${esc(it.source.label)}</span></a></p>` +
      `<p class="dr-note label" aria-hidden="true">${esc(it.note)}</p>` +
      `</li>`;
  });
  root.insertAdjacentHTML('beforeend', `${markup}</ul>`);

  // Each grid is as big as the room allows: half the width, or what the height leaves once
  // the tallest number and labels in its row are placed under it. The labels wrap with the
  // grid's width, so the size settles in a pass or two.
  const list = root.querySelector('.dr-list');
  const fit = () => {
    const width = root.clientWidth;
    // Without the stage the page scrolls, so only the width limits a grid.
    const height = html.classList.contains('stage-on') ? root.clientHeight : Infinity;
    if (!width || !height) return;
    const style = getComputedStyle(list);
    const gapX = parseFloat(style.columnGap) || 0;
    const gapY = parseFloat(style.rowGap) || 0;
    const cols = style.gridTemplateColumns.split(' ').length;
    const items = [...list.children];
    const rows = Math.ceil(items.length / cols);
    const across = (width - (cols - 1) * gapX) / cols;
    let n = Math.floor(Math.min(300, across));
    for (let pass = 0; pass < 5; pass++) {
      list.style.setProperty('--dr-n', `${n}px`);
      let text = 0;
      for (let row = 0; row < rows; row++) {
        text += Math.max(...items.slice(row * cols, row * cols + cols).map((it) => it.getBoundingClientRect().height - it.querySelector('.dr-stars').getBoundingClientRect().height));
      }
      const next = Math.floor(Math.min(300, across, (height - (rows - 1) * gapY - text) / rows));
      if (!Number.isFinite(next) || Math.abs(next - n) < 1) break;
      n = Math.max(36, next);
    }
  };
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(root);

  if (!moving) return;
  const grids = [...root.querySelectorAll('.dr-stars')];
  // Each arrival fills the grids from empty; a departure empties them once they are hidden.
  let leaveTimer = 0;
  onScene(({ id, previousId }) => {
    clearTimeout(leaveTimer);
    if (id === 'everywhere' && previousId !== 'everywhere') {
      grids.forEach((grid) => unfill(grid));
      grids.forEach((grid) => play(grid, 180));
    } else if (previousId === 'everywhere' && id !== 'everywhere') {
      leaveTimer = setTimeout(() => grids.forEach((grid) => unfill(grid)), MOVE_MS + 60);
    }
  });
}

/* 3. Why now (methods page): paired bars on one scale from $0 to $50 */

async function buildWhyNow(root) {
  const data = (await figuresReady).whyNow;
  const rows = data.rows.map((row) => {
    const change = Math.round(((row.after - row.before) / row.before) * 100);
    const note = change < 0 ? `down ${-change}%` : change > 0 ? `up ${change}%` : 'no change';
    return { ...row, change, note };
  });
  if (rows.some((r) => Math.max(r.before, r.after) > 50 || Math.min(r.before, r.after) < 0)) {
    console.warn('Why now: a value falls outside the fixed $0 to $50 scale.');
  }
  const label =
    'Bar chart of what an employer would pay: ' +
    rows
      .map(
        (r) =>
          `${lowerFirst(r.label)}, $${r.before.toFixed(2)} ${data.beforeWhen} and $${r.after.toFixed(2)} ${data.afterWhen}, ${r.note}`,
      )
      .join('; ') +
    '.';

  const legend = document.createElement('div');
  legend.className = 'ch-legend label';
  legend.setAttribute('aria-hidden', 'true');
  legend.innerHTML =
    `<span class="ch-key"><span class="wn-swatch wn-swatch-before"></span>${esc(data.beforeLabel)}</span>` +
    `<span class="ch-key"><span class="wn-swatch wn-swatch-after"></span>${esc(data.afterLabel)}</span>`;
  const plotEl = document.createElement('div');
  root.append(legend, plotEl);

  let pending = motionAllowed();
  watchSize(root, (width) => {
    plotEl.innerHTML = whyNowSVG(rows, width, pending, label);
  });
  if (pending) {
    eachTimeInView(root, {
      enter: () => {
        pending = false;
        play(plotEl.firstElementChild);
      },
      leave: () => {
        pending = true;
        unfill(plotEl.firstElementChild);
      },
    });
  }
}

function whyNowSVG(rows, W, pending, label) {
  const narrow = W < 480;
  const labelSize = narrow ? 16 : 17;
  const barH = narrow ? 16 : 18;
  const gap = 4;
  const labelBand = 27; // the row label, then its two bars
  const rowH = labelBand + barH * 2 + gap;
  const rowGap = 26;
  const plotW = W - 60; // leaves room after the longest bar for its value
  const x = (v) => (v / 50) * plotW;
  let body = '';
  rows.forEach((row, i) => {
    const top = i * (rowH + rowGap);
    const base = top + 18;
    body += `<text class="wn-label" x="0" y="${base}" style="font-size:${labelSize}px">${esc(row.label)}</text>`;
    body += `<text class="wn-note" x="${W}" y="${base}" text-anchor="end">${esc(row.note)}</text>`;
    const yB = top + labelBand;
    const yA = yB + barH + gap;
    const wB = x(row.before);
    const wA = x(row.after);
    // The outline sits inside the bar's extent, so both bars end exactly at their values.
    body += `<rect class="wn-bar wn-before" x="0.75" y="${yB + 0.75}" width="${r2(wB - 1.5)}" height="${barH - 1.5}"/>`;
    body += `<rect class="wn-bar wn-after" x="0" y="${yA}" width="${r2(wA)}" height="${barH}"/>`;
    body += `<text class="wn-value" x="${r2(wB + 7)}" y="${r2(yB + barH / 2 + 4.5)}">$${row.before.toFixed(2)}</text>`;
    body += `<text class="wn-value" x="${r2(wA + 7)}" y="${r2(yA + barH / 2 + 4.5)}">$${row.after.toFixed(2)}</text>`;
  });
  const yAxis = rows.length * (rowH + rowGap) - rowGap + 16;
  body += `<line class="ch-axis" x1="0" x2="${r2(x(50))}" y1="${yAxis + 0.5}" y2="${yAxis + 0.5}"/>`;
  for (let v = 0; v <= 50; v += 10) {
    const xv = v === 0 ? 0.5 : crisp(x(v) - 1);
    body += `<line class="ch-tick" x1="${xv}" x2="${xv}" y1="${yAxis + 1}" y2="${yAxis + 6}"/>`;
    body +=
      `<text class="ch-tick-label" x="${v === 0 ? 0 : xv}" y="${yAxis + 20}" ` +
      `text-anchor="${v === 0 ? 'start' : 'middle'}">$${v}</text>`;
  }
  return svgTag('wn-svg', W, yAxis + 25, label, body, pending);
}

/* 4. What predicts the job (methods page): dot plot, 1998 estimate against 2022 revision */

async function buildValidity(root) {
  const rows = (await figuresReady).validity.rows;
  const revised = rows.filter((r) => r.y2022 != null);
  const kept = rows.filter((r) => r.y2022 == null);
  const fell = revised.filter((r) => r.y2022 < r.y1998).length;
  const rose = revised.filter((r) => r.y2022 > r.y1998).length;
  const star = revised.find((r) => r.method === 'Work samples');
  if (rows.some((r) => [r.y1998, r.y2022].some((v) => v != null && (v < 0 || v > 0.6)))) {
    console.warn('Validity: a value falls outside the fixed .0 to .6 axis.');
  }
  const label =
    `Dot plot of ${rows.length} hiring methods, 1998 estimate against 2022 revision: ` +
    `${fell} of the ${revised.length} re-estimated methods came out lower` +
    (rose ? ` and ${rose} higher` : '') +
    (star ? `, work samples (the gold star) went from ${dec(star.y1998)} to ${dec(star.y2022)}` : '') +
    (kept.length ? `, and ${kept.length} were not re-estimated.` : '.');

  const legend = document.createElement('div');
  legend.className = 'ch-legend label';
  legend.setAttribute('aria-hidden', 'true');
  legend.innerHTML =
    `<span class="ch-key"><svg class="va-key" width="14" height="14" viewBox="0 0 14 14"><circle class="va-1998" cx="7" cy="7" r="5.25"/></svg>1998 estimate</span>` +
    `<span class="ch-key"><svg class="va-key" width="14" height="14" viewBox="0 0 14 14"><circle class="va-2022" cx="7" cy="7" r="6"/></svg>2022 revision</span>`;
  const plotEl = document.createElement('div');
  root.append(legend, plotEl);

  const redraw = watchSize(root, (width) => {
    plotEl.innerHTML = validitySVG(revised, kept, width, wideLayout.matches, label);
  });
  if (wideLayout.addEventListener) wideLayout.addEventListener('change', () => redraw());
  else if (wideLayout.addListener) wideLayout.addListener(() => redraw());
}

function validitySVG(revised, kept, W, wide, label) {
  const labelCol = 208; // about 13rem
  const valueCol = 84;
  const x0 = wide ? labelCol + 14 : 10;
  const x1 = wide ? W - valueCol : W - 10;
  const x = (v) => x0 + (v / 0.6) * (x1 - x0);
  const rowH = wide ? 34 : 50;
  const tickBase = 12;
  const segments = []; // gridline spans on phones, one per row
  let body = '';
  let y = 26; // top of the first row

  const drawRow = (r) => {
    let cy;
    let labelY;
    let valueY;
    if (wide) {
      cy = y + rowH / 2;
      labelY = cy + 5.5;
      valueY = cy + 4.3;
    } else {
      labelY = y + 16;
      valueY = y + 16;
      cy = y + 35;
      segments.push([cy - 11, cy + 11]);
    }
    const value = r.y2022 == null ? dec(r.y1998) : `${dec(r.y1998)} to ${dec(r.y2022)}`;
    body += `<text class="va-label${r.highlight ? ' is-strong' : ''}" x="0" y="${r2(labelY)}">${esc(r.method)}</text>`;
    body += `<text class="va-value" x="${W}" y="${r2(valueY)}" text-anchor="end">${value}</text>`;
    const xa = r2(x(r.y1998));
    if (r.y2022 != null) {
      const xb = r2(x(r.y2022));
      body += `<line class="va-line" x1="${xb}" x2="${xa}" y1="${cy}" y2="${cy}"/>`;
      body += `<circle class="va-1998" cx="${xa}" cy="${cy}" r="5.25"/>`;
      body += r.method === 'Work samples' ? starGlyph(xb, cy, 18) : `<circle class="va-2022" cx="${xb}" cy="${cy}" r="6"/>`;
    } else {
      body += `<circle class="va-1998" cx="${xa}" cy="${cy}" r="5.25"/>`;
    }
    y += rowH;
  };

  revised.forEach(drawRow);
  if (kept.length) {
    const subY = y + 24;
    body += `<text class="va-sub" x="0" y="${subY}">Not re-estimated in 2022</text>`;
    y = subY + (wide ? 8 : 10);
    kept.forEach(drawRow);
  }
  const bottom = y;

  let grid = '';
  for (let i = 0; i <= 6; i++) {
    const xv = crisp(x(i / 10) - 0.5);
    if (wide) grid += `<line class="va-grid" x1="${xv}" x2="${xv}" y1="${tickBase + 8}" y2="${bottom}"/>`;
    else segments.forEach(([a, b]) => (grid += `<line class="va-grid" x1="${xv}" x2="${xv}" y1="${a}" y2="${b}"/>`));
    grid += `<text class="ch-tick-label" x="${xv}" y="${tickBase}" text-anchor="middle">.${i}</text>`;
  }
  return svgTag('va-svg', W, bottom + 4, label, grid + body, false);
}

mount('guess-root', buildGuess, { dropFallback: true });
mount('drift-root', buildDrift, { dropFallback: true });
mount('why-now-root', buildWhyNow);
mount('validity-root', buildValidity);
