// The four charts in "Everyone's a 4.8":
//   #why-now-root   paired bars, what employers would pay before ChatGPT and in 2024
//   #guess-root     guess the typical Airbnb rating, then see every listing on the full scale
//   #drift-root     100 stars per rating system, gold for the share at the top of its scale
//   #validity-root  dot plot, how well hiring methods predict the job, 1998 and 2022
//
// Each container starts with a fallback (a table, list or sentence). Once a chart's data
// loads, a table fallback moves into a visually hidden wrapper, so screen readers still get
// the numbers, and the chart renders beside it. The drift list and the guess sentence are
// removed instead: the drift chart's own text already gives every number, and the guess
// sentence would tell screen reader users the answer before they guess. If the data cannot
// load, the fallback stays.

import { STAR_PATH, starRow, setStarRow } from './stars.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const wideLayout = window.matchMedia('(min-width: 720px)');

function loadJSON(path) {
  const request = fetch(new URL(path, import.meta.url)).then((res) => {
    if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
    return res.json();
  });
  request.catch(() => {}); // Each chart reports its own failure.
  return request;
}

const figuresReady = loadJSON('../data/figures.json');
const airbnbReady = loadJSON('../data/airbnb.json');

/* Small helpers */

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const crisp = (v) => Math.round(v) + 0.5; // centers a 1px line on a pixel
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const oneDecimal = (n) => (Math.round(n * 10) / 10).toFixed(1);
const dec = (v) => v.toFixed(2).replace(/^0/, ''); // .54 style: two decimals, no leading zero
const monoWidth = (text, size) => text.length * size * 0.6; // IBM Plex Mono is 0.6em wide
const motionAllowed = () => !reduceMotion.matches;

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

// Calls render(width) now and again whenever the element's width settles on a new value.
// Returns a function that forces a render at the current width.
function watchWidth(el, render) {
  let last = 0;
  let timer = 0;
  const check = (force) => {
    const width = Math.floor(el.clientWidth);
    if (width > 0 && (force === true || width !== last)) {
      last = width;
      render(width);
    }
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(check, 120);
  };
  check();
  if ('ResizeObserver' in window) new ResizeObserver(later).observe(el);
  else window.addEventListener('resize', later);
  return () => check(true);
}

// Runs fn once, the first time el is well inside the reading area: below the sticky
// header and above the bottom fifth of the screen, so nothing starts while it is only
// peeking in at an edge. An element taller than that area counts once it fills most of it.
function onceInView(el, fn, share = 0.9) {
  if (!('IntersectionObserver' in window)) {
    fn();
    return;
  }
  const headerHeight = document.querySelector('.site-header')?.offsetHeight ?? 0;
  const io = new IntersectionObserver(
    (entries) => {
      const seen = entries.some((e) => {
        const tall = e.rootBounds && e.intersectionRect.height >= e.rootBounds.height * share;
        return e.isIntersecting && (e.intersectionRatio >= share || tall);
      });
      if (seen) {
        io.disconnect();
        fn();
      }
    },
    // Fine steps, so a tall element reports in before it has filled the whole area.
    { rootMargin: `-${headerHeight}px 0px -20% 0px`, threshold: Array.from({ length: 21 }, (_, i) => i / 20) }
  );
  io.observe(el);
}

// Removes the pending class after the first state has painted, so CSS transitions run.
function play(el) {
  requestAnimationFrame(() => requestAnimationFrame(() => el && el.classList.remove('is-pending')));
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

/* 1. Why now: paired bars on one scale from $0 to $50 */

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
          `${lowerFirst(r.label)}, $${r.before.toFixed(2)} ${data.beforeWhen} and $${r.after.toFixed(2)} ${data.afterWhen}, ${r.note}`
      )
      .join('; ') +
    '.';

  const legend = document.createElement('div');
  legend.className = 'ch-legend';
  legend.setAttribute('aria-hidden', 'true');
  legend.innerHTML =
    `<span class="ch-key"><span class="wn-swatch wn-swatch-before"></span>${esc(data.beforeLabel)}</span>` +
    `<span class="ch-key"><span class="wn-swatch wn-swatch-after"></span>${esc(data.afterLabel)}</span>`;
  const plot = document.createElement('div');
  root.append(legend, plot);

  let pending = motionAllowed();
  watchWidth(root, (width) => {
    plot.innerHTML = whyNowSVG(rows, width, pending, label);
  });
  if (pending) {
    onceInView(root, () => {
      pending = false;
      play(plot.firstElementChild);
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

/* 2. The guess: pick a rating, then see every listing on the full scale */

// The slider thumb is the page's star, drawn from STAR_PATH. The image goes in as a literal
// rule, one per engine, because a rule that names both pseudo-elements is dropped everywhere
// and some engines do not pass custom properties into the thumb.
function addThumbStyle() {
  if (document.getElementById('gs-thumb-style')) return;
  const url = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${STAR_PATH}" ` +
      'fill="#dca320" stroke="#93650a" stroke-width="1" stroke-linejoin="round"/></svg>'
  )}")`;
  const style = document.createElement('style');
  style.id = 'gs-thumb-style';
  style.textContent =
    `.gs-range::-webkit-slider-thumb{background-image:${url}}` +
    `.gs-range::-moz-range-thumb{background-image:${url}}`;
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
    iMax: bins.indexOf(maxCount),
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
          `${g[key]} (a difference of ${r2(computed - g[key])} points).`
      );
    }
  }
  if (m.n !== g.n) console.warn(`Airbnb check: the histogram holds ${m.n} listings, figures.json says ${g.n}.`);
  if (m.median.toFixed(2) !== Number(g.median).toFixed(2)) {
    console.warn(`Airbnb check: the histogram median is ${m.median.toFixed(2)}, figures.json says ${g.median}.`);
  }
}

async function buildGuess(root) {
  const [figures, air] = await Promise.all([figuresReady, airbnbReady]);
  const g = figures.guess;
  const m = histogramModel(air, g);
  checkGuessFigures(m, g);

  const answer = document.getElementById('guess-answer');
  const start = Number(g.defaultGuess ?? 3);
  const medianText = Number(g.median).toFixed(2);
  const stats = [
    `${oneDecimal(m.ge45)}% at 4.5 or above`,
    `${oneDecimal(m.ge48)}% at 4.8 or above`,
    `${oneDecimal(m.lt40)}% below 4.0`,
  ];
  const statsHTML = stats.map((s, i) => `<span>${s}${i < stats.length - 1 ? ' ·' : ''}</span>`).join(' ');
  const ticks = [1, 2, 3, 4, 5].map((v) => `<span style="left:${(v - 1) * 25}%">${v}</span>`).join('');

  root.insertAdjacentHTML(
    'beforeend',
    `<div class="gs-step">` +
      `<p class="gs-prompt" id="gs-prompt">Drag the star to where you think the typical Airbnb in San Francisco or New York is rated.</p>` +
      `<div class="gs-readout" aria-hidden="true"><span class="gs-num">${start.toFixed(2)}</span>` +
      starRow(start, { size: 24, gap: 4, className: 'gs-stars' }) +
      `</div>` +
      `<div class="gs-slider">` +
      `<label class="visually-hidden" for="gs-range">Your guess, in stars</label>` +
      `<input class="gs-range" id="gs-range" type="range" min="1" max="5" step="0.05" value="${start}" ` +
      `autocomplete="off" aria-valuetext="${start.toFixed(2)} stars" aria-describedby="gs-prompt">` +
      `<div class="gs-ticks" aria-hidden="true">${ticks}</div>` +
      `</div>` +
      `<div class="gs-actions">` +
      `<button class="btn" type="button" data-act="show">Show me</button>` +
      `<button class="btn btn-quiet" type="button" data-act="skip">Skip the guess</button>` +
      `</div>` +
      `</div>` +
      `<div class="gs-result" hidden><div class="gs-hist"></div><p class="gs-stats">${statsHTML}</p></div>` +
      `<p class="gs-message" aria-live="polite"></p>` +
      `<div class="gs-again" hidden><button class="btn btn-quiet" type="button" data-act="again">Guess again</button></div>`
  );

  const q = (sel) => root.querySelector(sel);
  const step = q('.gs-step');
  const result = q('.gs-result');
  const hist = q('.gs-hist');
  const message = q('.gs-message');
  const again = q('.gs-again');
  const againBtn = again.querySelector('button');
  const range = q('.gs-range');
  const readout = q('.gs-num');
  const stars = q('.gs-stars');
  addThumbStyle();

  const state = { revealed: false, guess: null, played: false };

  const showGuess = () => {
    const v = Number(range.value);
    readout.textContent = v.toFixed(2);
    setStarRow(stars, v);
    range.setAttribute('aria-valuetext', `${v.toFixed(2)} stars`);
  };
  range.addEventListener('input', showGuess);
  showGuess();

  // Share of listings rated below the guess, as the end of a sentence.
  const belowSentence = (guess) => {
    const share = m.shareBelow(guess);
    if (share === 0) return 'none of the listings are rated below your guess.';
    const pct = share < 0.05 ? 'less than 0.1%' : `${oneDecimal(share)}%`;
    return `${pct} of listings are rated below your guess.`;
  };

  const labelFor = (guess) =>
    `Histogram of ${m.n.toLocaleString('en-US')} listings on the full scale from 1 to 5: ` +
    `${stats[0]}, the median is ${medianText}` +
    (guess == null ? '.' : `, and your guess of ${guess.toFixed(2)} is marked on the axis.`);

  // The first reveal always starts pending: charts.css grows the bars, or fades them in when
  // motion is reduced. The reader asked for this one, so it is not autoplay.
  const renderHist = (width) => {
    const pending = !state.played;
    hist.innerHTML = histogramSVG(m, width, state.guess, pending, labelFor(state.guess));
    if (pending) {
      state.played = true;
      play(hist.firstElementChild);
    }
  };
  watchWidth(root, (width) => {
    if (state.revealed) renderHist(width);
  });

  const scrollBehavior = () => (motionAllowed() ? 'smooth' : 'auto');

  // Scrolls just far enough to show first through last, but never so far that first
  // goes behind the sticky header. Smooth only when motion is allowed.
  const bringIntoView = (first, last) => {
    const top = first.getBoundingClientRect().top;
    const bottom = last.getBoundingClientRect().bottom;
    const clear = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const room = window.innerHeight - 16;
    let dy = bottom > room ? bottom - room : 0;
    if (top - dy < clear) dy = top - clear;
    if (Math.abs(dy) >= 1) window.scrollBy({ top: dy, behavior: scrollBehavior() });
  };

  const reveal = (guess) => {
    state.revealed = true;
    state.guess = guess;
    step.hidden = true;
    result.hidden = false;
    again.hidden = false;
    renderHist(Math.floor(root.clientWidth));
    message.textContent =
      guess == null
        ? `The median listing is rated ${medianText}.`
        : `You guessed ${guess.toFixed(2)}. The median listing is rated ${medianText}, and ` +
          belowSentence(guess);
    if (answer) answer.hidden = false;
    againBtn.focus({ preventScroll: true });
    // The histogram, the sentence about the reader's guess and the focused button,
    // measured two frames on so every style change on the new content has landed.
    requestAnimationFrame(() => requestAnimationFrame(() => bringIntoView(result, again)));
  };

  const reset = () => {
    state.revealed = false;
    state.guess = null;
    step.hidden = false;
    result.hidden = true;
    again.hidden = true;
    message.textContent = '';
    if (answer) answer.hidden = true;
    range.focus({ preventScroll: true });
    step.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  };

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-act]');
    if (!button || !root.contains(button)) return;
    const act = button.dataset.act;
    if (act === 'show') reveal(Number(range.value));
    else if (act === 'skip') reveal(null);
    else if (act === 'again') reset();
  });

  if (answer) answer.hidden = true;
}

function histogramSVG(m, W, guess, pending, label) {
  const narrow = W < 480;
  const padL = 12; // room for the "1" tick and a guess star at 1.00
  const padR = 46; // room beside the tallest bar for its share
  const plotW = W - padL - padR;
  const x = (v) => padL + ((v - 1) / 4) * plotW;
  const bandTop = 22;
  const plotTop = 46;
  const plotH = narrow ? 132 : 168;
  const yAxis = plotTop + plotH;
  const pitch = plotW / m.bins.length;
  const gap = pitch >= 5 ? 1 : 0.5;

  // The 4.8+ band sits behind the bars and rises above the tallest one to carry its label.
  const bx0 = x(4.8);
  const bx1 = x(5);
  let body = `<rect class="gs-band" x="${r2(bx0)}" y="${bandTop}" width="${r2(bx1 - bx0)}" height="${yAxis - bandTop}"/>`;

  let d = '';
  m.bins.forEach((count, i) => {
    if (!count) return;
    const h = (count / m.maxCount) * plotH;
    d += `M${r2(padL + i * pitch + gap / 2)} ${yAxis}v${r2(-h)}h${r2(pitch - gap)}v${r2(h)}z`;
  });
  body += `<path class="gs-bars" d="${d}" style="transform-origin:0 ${yAxis}px"/>`;

  body += `<line class="ch-axis" x1="${padL}" x2="${r2(x(5))}" y1="${yAxis + 0.5}" y2="${yAxis + 0.5}"/>`;
  const tickY = guess == null ? yAxis + 19 : yAxis + 29;
  for (let v = 1; v <= 5; v++) {
    const xv = crisp(x(v) - 0.5);
    body += `<line class="ch-tick" x1="${xv}" x2="${xv}" y1="${yAxis + 1}" y2="${yAxis + 6}"/>`;
    body += `<text class="ch-tick-label" x="${xv}" y="${tickY}" text-anchor="middle">${v}</text>`;
  }

  let anno = '';
  const xm = crisp(x(m.median) - 0.5);
  anno += `<line class="gs-median" x1="${xm}" x2="${xm}" y1="3" y2="${yAxis}"/>`;
  anno += `<text class="gs-median-label" x="${xm - 5}" y="14" text-anchor="end">Median ${m.median.toFixed(2)}</text>`;
  anno += `<text class="gs-band-label" x="${r2(bx0 - 5)}" y="${bandTop + 12}" text-anchor="end">4.8+</text>`;

  // Share of listings in the tallest bar: beside it when it is the last bin, else above it.
  const topShare = `${oneDecimal((m.maxCount / m.n) * 100)}%`;
  if (m.iMax === m.bins.length - 1) {
    anno += `<text class="gs-top-label" x="${r2(bx1 + 5)}" y="${plotTop + 4}">${topShare}</text>`;
  } else {
    const cx = padL + (m.iMax + 0.5) * pitch;
    const half = monoWidth(topShare, 12) / 2;
    anno += `<text class="gs-top-label" x="${r2(clamp(cx, half, W - half))}" y="${plotTop - 5}" text-anchor="middle">${topShare}</text>`;
  }

  // The reader's guess stays outside the fading group, so their star is on the axis from the
  // first frame, where the slider left it, while the bars grow.
  let you = '';
  if (guess != null) {
    const xg = x(guess);
    you += starGlyph(xg, yAxis, narrow ? 20 : 22, 'gs-guess');
    const text = `Your guess ${guess.toFixed(2)}`;
    const half = monoWidth(text, 12) / 2;
    you += `<text class="gs-guess-label" x="${r2(clamp(xg, half + 1, W - half - 1))}" y="${yAxis + 47}" text-anchor="middle">${text}</text>`;
  }

  const H = guess == null ? yAxis + 26 : yAxis + 54;
  return svgTag('gs-svg', W, H, label, `${body}<g class="gs-anno">${anno}</g>${you}`, pending);
}

/* 3. The drift: a grid of 100 stars per system */

async function buildDrift(root) {
  const items = (await figuresReady).drift;
  const counts = items.map((it) => ({
    gold: Math.round((it.then || it.now).value),
    total: Math.round(it.now.value),
  }));
  // The added stars fill at one speed everywhere, so the biggest gain takes about 900ms.
  const fade = 200;
  const maxAdded = Math.max(1, ...counts.map((c, i) => (items[i].then ? c.total - c.gold : 0)));
  const stepMs = maxAdded > 1 ? (900 - fade) / (maxAdded - 1) : 0;
  const animate = motionAllowed();

  let html =
    `<svg class="dr-sprite" aria-hidden="true" focusable="false">` +
    `<symbol id="dr-star" viewBox="0 0 24 24"><path d="${STAR_PATH}" vector-effect="non-scaling-stroke"/></symbol></svg>` +
    `<ul class="dr-list" role="list">`;

  items.forEach((it, i) => {
    const { gold, total } = counts[i];
    const pair = Boolean(it.then);
    let uses = '';
    // Fill from the bottom left, left to right, row by row upward, like a rising level.
    for (let k = 0; k < 100; k++) {
      const col = k % 10;
      const row = 9 - Math.floor(k / 10);
      let cls = 'dr-s0';
      let style = '';
      if (k < gold) cls = 'dr-s1';
      else if (k < total) {
        cls = 'dr-s2';
        style = ` style="transition-delay:${Math.round((k - gold) * stepMs)}ms"`;
      }
      uses += `<use href="#dr-star" class="${cls}" x="${col * 24 + 1}" y="${row * 24 + 1}" width="22" height="22"${style}/>`;
    }
    const aria = pair
      ? `Grid of 100 stars: ${gold} gold and ${total - gold} lighter gold.`
      : `Grid of 100 stars: ${gold} gold.`;
    const value = pair
      ? `<span class="dr-nw">${esc(it.then.label)} <b>${it.then.value}%</b></span> to ` +
        `<span class="dr-nw">${esc(it.now.label)} <b>${it.now.value}%</b></span>`
      : `<b>${it.now.value}%</b><br><span class="dr-sub">${esc(it.now.label)}</span>`;
    html +=
      `<li class="dr-item${pair ? ' dr-pair' : ''}">` +
      `<p class="dr-title">${esc(it.title)}</p>` +
      `<p class="dr-measure label">${esc(it.measure)}</p>` +
      `<svg class="dr-stars${pair && animate ? ' is-pending' : ''}" viewBox="0 0 240 240" role="img" aria-label="${esc(aria)}">${uses}</svg>` +
      `<p class="dr-value">${value}</p>` +
      `<a class="dr-src" href="${esc(it.source.url)}">Source<span class="visually-hidden">: ${esc(it.source.label)}</span></a>` +
      `</li>`;
  });
  root.insertAdjacentHTML('beforeend', `${html}</ul>`);

  if (animate) {
    // Watch the grid itself, where the fill happens, not the whole block around it.
    root.querySelectorAll('.dr-pair .dr-stars').forEach((grid) => {
      onceInView(grid, () => play(grid));
    });
  }
}

/* 4. What predicts the job: dot plot, 1998 estimate against 2022 revision */

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
  legend.className = 'ch-legend';
  legend.setAttribute('aria-hidden', 'true');
  legend.innerHTML =
    `<span class="ch-key"><svg class="va-key" width="14" height="14" viewBox="0 0 14 14"><circle class="va-1998" cx="7" cy="7" r="5.25"/></svg>1998 estimate</span>` +
    `<span class="ch-key"><svg class="va-key" width="14" height="14" viewBox="0 0 14 14"><circle class="va-2022" cx="7" cy="7" r="6"/></svg>2022 revision</span>`;
  const plot = document.createElement('div');
  root.append(legend, plot);

  const redraw = watchWidth(root, (width) => {
    plot.innerHTML = validitySVG(revised, kept, width, wideLayout.matches, label);
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

mount('why-now-root', buildWhyNow);
mount('guess-root', buildGuess, { dropFallback: true });
mount('drift-root', buildDrift, { dropFallback: true });
mount('validity-root', buildValidity);
