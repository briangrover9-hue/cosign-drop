// The trust lab: 80 coworkers vouching for each other, drawn as a dot plot
// that moves round by round. The model lives in lab-model.js; this file draws
// it and wires up the controls.
import { createWorld, createRun, DEFAULTS, WORST, TOP_N, HIGH_BAR } from './lab-model.js';
import { STAR_PATH, starRow, setStarRow } from './stars.js';

const NS = 'http://www.w3.org/2000/svg';
const ROUND_MS = 420; // time between rounds while playing
const TWEEN_MS = 280; // time dots take to reach their new places
// Dots stack in score columns 0.05 wide, or 0.1 wide when the field is too
// narrow for 0.05 columns to sit side by side without piling into each other.
// Both widths put column edges on 4.8 and 5, so the 4.8+ band stays exact.
const COLUMNS_PER_STAR = [20, 10, 5];
const LANE_COLUMNS = 4; // the "No vouches" lane stacks people four across
const WIDE_FIELD = 520; // field width in pixels from which dots and the field get bigger

const SWITCHES = [
  { key: 'type', legend: 'A vouch is', options: [['tap', 'One tap'], ['written', 'Written'], ['work', 'Tied to work']] },
  { key: 'vis', legend: 'They see it', options: [['visible', 'Right away'], ['blind', 'After both write']] },
  { key: 'who', legend: 'Who can vouch', options: [['anyone', 'Anyone'], ['worked', 'Worked with you']] },
  { key: 'feed', legend: 'Feed ranks by', options: [['ranked', 'Followers'], ['plain', 'Nothing']] },
];

const percent = (v) => `${Math.round(v * 100)}%`;
const ASSUMPTIONS = [
  { id: 'push', path: ['push', 'visible'], min: 0, max: 0.3, step: 0.01, format: (v) => `${v.toFixed(2)} stars a round`,
    label: 'How much people shade up when the other person can see the vouch' },
  { id: 'autofive', path: ['autoFive', 'tap'], min: 0, max: 0.8, step: 0.05, format: percent,
    label: 'Share of one-tap vouches that are reflexive fives' },
  { id: 'anchor', path: ['anchor', 'work'], min: 0, max: 1, step: 0.05, format: percent,
    label: 'How much a piece of work anchors the rating' },
  { id: 'halo', path: ['halo'], min: 0, max: 1, step: 0.05, format: (v) => v.toFixed(2),
    label: 'How much follower counts sway judgment' },
];
for (const a of ASSUMPTIONS) a.initial = a.path.reduce((o, k) => o[k], DEFAULTS);

const READOUTS = [
  { key: 'mean', label: 'Average score' },
  { key: 'top48', label: 'At 4.8 or above' },
  { key: 'hits', label: 'The top 10 by score' },
  { key: 'unrated', label: 'No vouches at all' },
];

const root = document.getElementById('lab-root');
if (root) mount(root);

function mount(root) {
  const world = createWorld(Number(root.dataset.seed) || 11);
  const N = world.people.length;
  const skilled = new Set(world.topSkill);
  // Within a column the most skilled sit lowest, so the order never shuffles.
  const bySkill = world.people.map((p) => p.id).sort((a, b) => world.people[b].skill - world.people[a].skill);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motion.matches;

  root.querySelector('.fallback')?.remove();
  root.insertAdjacentHTML('beforeend', template(N));
  const $ = (selector) => root.querySelector(selector);
  const fieldWrap = $('.lab-field-wrap');
  const svg = $('.lab-field');
  const roundLabel = $('.lab-round');
  const playButton = $('[data-action="play"]');
  const statusLine = $('.lab-status');
  const live = $('.lab-live');
  const avgStars = $('.lab-avg-stars');
  const readouts = Object.fromEntries(
    READOUTS.map(({ key }) => {
      const box = $(`[data-readout="${key}"]`);
      return [key, { num: box.querySelector('.lab-num'), unit: box.querySelector('.lab-unit'), last: box.querySelector('.lab-last') }];
    }),
  );

  // Static layer (axis, band, lane) and one reusable node per person. People
  // sit in three layers so filled dots draw above hollow ones and stars above both.
  const staticLayer = svgEl('g', { class: 'lab-static' });
  const hollowLayer = svgEl('g');
  const filledLayer = svgEl('g');
  const starLayer = svgEl('g');
  svg.append(staticLayer, hollowLayer, filledLayer, starLayer);
  const nodes = world.people.map((p) => {
    const home = skilled.has(p.id) ? filledLayer : hollowLayer;
    const g = svgEl('g', { class: skilled.has(p.id) ? 'lab-p is-skilled' : 'lab-p' });
    const circle = svgEl('circle', { r: 4.5 });
    const star = svgEl('path', { class: 'lab-star', d: STAR_PATH });
    g.append(circle, star);
    home.append(g);
    return { g, circle, star, home, top: false };
  });

  const state = {
    settings: { ...WORST },
    values: Object.fromEntries(ASSUMPTIONS.map((a) => [a.id, a.initial])),
    runSeed: 1,
    run: null,
    key: '',
    snap: null,
    playing: false,
    autoplayed: false,
    resumeOnShow: false,
    onScreen: false,
    lastFinished: null, // { key, metrics } of the most recent finished run
    reference: null, // the finished run before the current one, for "last run"
  };

  // Positions: where each dot is drawn now, where a tween started, where it ends.
  const cur = new Float64Array(N * 2);
  const from = new Float64Array(N * 2);
  const to = new Float64Array(N * 2);
  let geo = null;
  let tweenStart = -1;
  let frameId = 0;
  let nextRoundAt = 0;

  /* ---------- Runs ---------- */

  function overrides() {
    const out = {};
    for (const a of ASSUMPTIONS) {
      const value = state.values[a.id];
      if (value === a.initial) continue;
      let node = out;
      a.path.slice(0, -1).forEach((k) => (node = node[k] ??= {}));
      node[a.path[a.path.length - 1]] = value;
    }
    return out;
  }

  function startRun() {
    state.run = createRun(world, state.settings, state.runSeed, overrides());
    state.key = [...Object.values(state.settings), ...ASSUMPTIONS.map((a) => state.values[a.id])].join('|');
    state.reference = state.lastFinished;
  }

  // A fresh run that plays at once, or jumps to its end when motion is reduced.
  function rerun() {
    state.playing = false;
    startRun();
    if (reduced) finishNow();
    else play();
  }

  function play() {
    state.autoplayed = true;
    state.resumeOnShow = false;
    if (reduced) {
      if (state.run.done) startRun();
      finishNow();
      return;
    }
    if (state.run.done) startRun();
    state.playing = true;
    playButton.textContent = 'Pause';
    statusLine.textContent = '';
    svg.setAttribute('aria-label', `A dot plot of ${N} people by score, changing round by round.`);
    const now = performance.now();
    advance(now);
    nextRoundAt = now + ROUND_MS;
    loop();
  }

  function pause(auto = false) {
    if (!state.playing) return;
    state.playing = false;
    state.resumeOnShow = auto;
    playButton.textContent = 'Play';
  }

  function restart() {
    state.autoplayed = true;
    state.playing = false;
    startRun();
    if (reduced) idle();
    else play();
  }

  // Round 0: nobody has been vouched for yet.
  function idle() {
    playButton.textContent = 'Play';
    show(state.run.snapshot(), false);
    statusLine.textContent = 'Press play to run 30 rounds of vouching.';
    svg.setAttribute('aria-label', `A dot plot of ${N} people by score, before anyone has been vouched for.`);
  }

  function advance(now) {
    show(state.run.step(), !reduced, now);
    if (state.run.done) finish();
  }

  function finishNow() {
    state.autoplayed = true;
    state.playing = false;
    while (!state.run.done) state.run.step();
    show(state.run.snapshot(), false);
    finish();
  }

  function finish() {
    state.playing = false;
    playButton.textContent = 'Play';
    const m = state.run.snapshot().metrics;
    const ref = state.reference && state.reference.key !== state.key ? state.reference.metrics : null;
    for (const { key } of READOUTS) {
      const last = readouts[key].last;
      last.hidden = !ref;
      if (ref) last.textContent = `last run: ${numberText(key, ref)}`;
    }
    const sentence = verdict(m);
    statusLine.textContent = sentence;
    svg.setAttribute(
      'aria-label',
      `After ${state.run.rounds} rounds, the average score is ${m.mean.toFixed(2)}, ${m.top48} of ${N} people are at ${HIGH_BAR} or above, and the top ${TOP_N} by score includes ${m.hits} of the ${TOP_N} most skilled.`,
    );
    announce(
      `Round ${state.run.rounds} of ${state.run.rounds}. ` +
        READOUTS.map(({ key, label }) => `${label}: ${valueText(key, m, N)}.`).join(' ') +
        ` ${sentence}`,
    );
    state.lastFinished = { key: state.key, metrics: m };
  }

  // Clear, then fill after a beat, so a repeated summary is still announced.
  let announceTimer = 0;
  function announce(text) {
    clearTimeout(announceTimer);
    live.textContent = '';
    announceTimer = setTimeout(() => (live.textContent = text), 60);
  }

  /* ---------- Drawing ---------- */

  function show(snap, animate, now = performance.now()) {
    state.snap = snap;
    roundLabel.textContent = `Round ${snap.round} of ${state.run.rounds}`;

    // Gold stars for the top 10 by score, among people who have a score.
    const top = new Set(snap.topScore.filter((i) => snap.scores[i] !== null));
    nodes.forEach((n, i) => {
      const isTop = top.has(i);
      if (isTop === n.top) return;
      n.top = isTop;
      n.g.classList.toggle('is-top', isTop);
      (isTop ? starLayer : n.home).append(n.g);
    });

    if (geo) moveTo(targets(snap, geo), animate, now);
    updateReadouts(snap.metrics);
    if (!state.run.done) for (const { key } of READOUTS) readouts[key].last.hidden = true;
  }

  function updateReadouts(m) {
    const rated = m.mean !== null;
    setText(readouts.mean.num, rated ? m.mean.toFixed(2) : '');
    setText(readouts.mean.unit, rated ? '' : 'no scores yet');
    avgStars.style.display = rated ? '' : 'none';
    if (rated) setStarRow(avgStars, m.mean);
    setText(readouts.top48.num, String(m.top48));
    setText(readouts.hits.num, rated ? String(m.hits) : '');
    setText(readouts.hits.unit, rated ? ` of the ${TOP_N} most skilled` : 'no scores yet');
    setText(readouts.unrated.num, String(m.unrated));
  }

  // Pixel geometry of the field for a given width.
  function geometry(width) {
    const wide = width >= WIDE_FIELD;
    const r = wide ? 5.5 : 4.5;
    const height = wide ? 300 : 240;
    const step = 2 * r + 1; // center to center, dots side by side or stacked
    const plotTop = 20; // top of the band and the lane rule; labels sit above
    const base = height - 28; // the axis line; tick labels sit below
    const laneLeft = 1;
    const laneRight = laneLeft + LANE_COLUMNS * step + 3;
    const x1 = laneRight + r + 10;
    const x5 = width - r - 6;
    const perStar = (x5 - x1) / 4;
    const columns = COLUMNS_PER_STAR.find((n) => perStar / n >= 0.6 * step) ?? COLUMNS_PER_STAR[COLUMNS_PER_STAR.length - 1];
    return {
      width, height, r, step, plotTop, base, laneLeft, laneRight, x1, x5, columns,
      bottom: base - r - 1.5, // center of the lowest dot in a stack
      highest: plotTop + r + 3, // center of the highest dot a stack may reach
      starSize: Math.round(r * 2.8),
      x: (score) => x1 + (score - 1) * perStar,
    };
  }

  function drawStatic(G) {
    svg.setAttribute('width', G.width);
    svg.setAttribute('height', G.height);
    svg.setAttribute('viewBox', `0 0 ${G.width} ${G.height}`);
    const bandX = G.x(HIGH_BAR);
    const labelY = G.plotTop - 7;
    let ticks = '';
    for (let v = 1; v <= 5; v++) {
      const x = G.x(v).toFixed(1);
      ticks +=
        `<line class="lab-tick" x1="${x}" x2="${x}" y1="${G.base}" y2="${G.base + 5}"/>` +
        `<text class="lab-tick-label" x="${x}" y="${G.base + 19}" text-anchor="middle">${v}</text>`;
    }
    staticLayer.innerHTML =
      `<rect class="lab-band" x="${bandX.toFixed(1)}" y="${G.plotTop}" width="${(G.width - bandX).toFixed(1)}" height="${G.base - G.plotTop}"/>` +
      `<text class="lab-label" x="${G.width - 1}" y="${labelY}" text-anchor="end">${HIGH_BAR}+</text>` +
      `<line class="lab-lane-rule" x1="${G.laneRight + 0.5}" x2="${G.laneRight + 0.5}" y1="${G.plotTop}" y2="${G.base}"/>` +
      `<text class="lab-label" x="0" y="${labelY}">No vouches</text>` +
      `<line class="lab-axis" x1="0" x2="${G.width}" y1="${G.base + 0.5}" y2="${G.base + 0.5}"/>` +
      ticks;
    const half = G.starSize / 2;
    const scale = G.starSize / 24;
    for (const n of nodes) {
      n.circle.setAttribute('r', G.r);
      n.star.setAttribute('transform', `translate(${-half} ${-half}) scale(${scale})`);
    }
  }

  // Where each person belongs: a score column, or the lane if unrated.
  function targets(snap, G) {
    const out = new Float64Array(N * 2);
    const columns = new Map();
    const lane = [];
    for (const i of bySkill) {
      const s = snap.scores[i];
      if (s === null) {
        lane.push(i);
        continue;
      }
      const c = Math.min(Math.floor(s * G.columns + 1e-6), 5 * G.columns - 1);
      let list = columns.get(c);
      if (!list) columns.set(c, (list = []));
      list.push(i);
    }
    // One spacing for every column, so heights stay comparable; it only
    // tightens when the tallest column would run out of room.
    const span = G.bottom - G.highest;
    const pitchFor = (count) => (count > 1 ? Math.min(G.step, span / (count - 1)) : G.step);
    let tallest = 1;
    for (const list of columns.values()) tallest = Math.max(tallest, list.length);
    const pitch = pitchFor(tallest);
    for (const [c, list] of columns) {
      const x = G.x((c + 0.5) / G.columns);
      list.forEach((i, k) => {
        out[2 * i] = x;
        out[2 * i + 1] = G.bottom - k * pitch;
      });
    }
    const lanePitch = pitchFor(Math.ceil(lane.length / LANE_COLUMNS));
    lane.forEach((i, k) => {
      out[2 * i] = G.laneLeft + G.r + (k % LANE_COLUMNS) * G.step;
      out[2 * i + 1] = G.bottom - Math.floor(k / LANE_COLUMNS) * lanePitch;
    });
    return out;
  }

  function place(i) {
    nodes[i].g.setAttribute('transform', `translate(${cur[2 * i].toFixed(1)} ${cur[2 * i + 1].toFixed(1)})`);
  }

  function moveTo(next, animate, now) {
    if (!animate) {
      cur.set(next);
      to.set(next);
      tweenStart = -1;
      for (let i = 0; i < N; i++) place(i);
      return;
    }
    from.set(cur);
    to.set(next);
    tweenStart = now;
    loop();
  }

  function tween(now) {
    const t = Math.min(1, Math.max(0, (now - tweenStart) / TWEEN_MS));
    // Cubic ease-out, softer than the page's --ease-out on purpose: the dots leave on the
    // round's tick, and the gentler curve keeps them visibly traveling long enough to follow.
    const e = 1 - (1 - t) ** 3;
    for (let i = 0; i < N; i++) {
      const x = 2 * i;
      if (from[x] === to[x] && from[x + 1] === to[x + 1]) continue;
      cur[x] = from[x] + (to[x] - from[x]) * e;
      cur[x + 1] = from[x + 1] + (to[x + 1] - from[x + 1]) * e;
      place(i);
    }
    if (t >= 1) tweenStart = -1;
  }

  function loop() {
    if (!frameId) frameId = requestAnimationFrame(frame);
  }

  function frame(now) {
    frameId = 0;
    if (state.playing && now >= nextRoundAt) {
      advance(now);
      nextRoundAt = now + ROUND_MS;
    }
    if (tweenStart >= 0) tween(now);
    if (state.playing || tweenStart >= 0) loop();
  }

  function resize(width) {
    width = Math.floor(width);
    if (!width || (geo && geo.width === width)) return;
    geo = geometry(width);
    drawStatic(geo);
    if (state.snap) moveTo(targets(state.snap, geo), false);
  }

  /* ---------- Controls ---------- */

  root.querySelectorAll('.lab-seg input').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.settings[input.name.slice(4)] = input.value;
      rerun();
    });
  });

  playButton.addEventListener('click', () => (state.playing ? pause() : play()));
  $('[data-action="restart"]').addEventListener('click', restart);
  $('[data-action="again"]').addEventListener('click', () => {
    state.runSeed += 1;
    rerun();
  });

  const sliders = ASSUMPTIONS.map((a) => {
    const input = $(`#lab-a-${a.id}`);
    const output = $(`[data-value="${a.id}"]`);
    const sync = () => {
      const text = a.format(Number(input.value));
      output.textContent = text;
      input.setAttribute('aria-valuetext', text);
    };
    input.addEventListener('input', sync);
    input.addEventListener('change', () => {
      sync();
      state.values[a.id] = Number(input.value);
      rerun();
    });
    return { a, input, sync };
  });
  $('[data-action="reset"]').addEventListener('click', () => {
    let changed = false;
    for (const { a, input, sync } of sliders) {
      if (state.values[a.id] !== a.initial) changed = true;
      state.values[a.id] = a.initial;
      input.value = String(a.initial);
      sync();
    }
    if (changed) rerun();
  });

  motion.addEventListener('change', (event) => {
    reduced = event.matches;
    if (!reduced) return;
    if (state.playing) finishNow();
    else if (tweenStart >= 0) moveTo(to.slice(), false);
  });

  // Autoplay once when the field is 40% visible; pause while it is offscreen
  // or the tab is hidden, and pick up again on return.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          state.onScreen = entry.isIntersecting;
          if (!entry.isIntersecting) pause(true);
          else if (entry.intersectionRatio >= 0.4 && !state.autoplayed && !reduced) play();
          else if (state.resumeOnShow && !document.hidden) play();
        }
      },
      { threshold: [0, 0.4] },
    ).observe(fieldWrap);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(true);
    else if (state.resumeOnShow && state.onScreen) play();
  });

  let resizeTimer = 0;
  if ('ResizeObserver' in window) {
    new ResizeObserver((entries) => {
      const width = entries[entries.length - 1].contentRect.width;
      if (!geo) return resize(width);
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => resize(width), 120);
    }).observe(fieldWrap);
  } else {
    window.addEventListener('resize', () => resize(fieldWrap.getBoundingClientRect().width));
  }

  resize(fieldWrap.getBoundingClientRect().width);
  startRun();
  idle();
}

/* ---------- Text ---------- */

function numberText(key, m) {
  return key === 'mean' ? m.mean.toFixed(2) : String(m[key]);
}

function valueText(key, m, N) {
  if (key === 'mean') return m.mean.toFixed(2);
  if (key === 'top48') return `${m.top48} of ${N}`;
  if (key === 'hits') return `${m.hits} of the ${TOP_N} most skilled`;
  return String(m.unrated);
}

// The one-line reading of a finished run.
function verdict(m) {
  let text;
  if (m.top48 >= 30 && m.hits <= 3) {
    text = 'The scores have piled up near 5, and a top 10 by score does barely better than chance.';
  } else if (m.hits >= 7 && m.top48 <= 10) {
    text = 'The scores stay spread out, and a top 10 by score finds most of the best people.';
  } else if (m.top48 <= 10) {
    // Spread out, but the top 10 finds fewer than 7 of the best. Without this
    // case these runs would fall through to "still bunch near the top".
    text = `The scores stay spread out, and a top 10 by score finds ${m.hits === 0 ? 'none' : m.hits} of the 10 most skilled.`;
  } else {
    text = 'Better, but the scores still bunch near the top.';
  }
  if (m.unrated >= 5) text += ` ${m.unrated} people never got a single vouch.`;
  return text;
}

function template(N) {
  const switches = SWITCHES.map(
    (s) =>
      `<fieldset class="lab-switch"><legend>${s.legend}</legend><div class="lab-seg">` +
      s.options
        .map(
          ([value, text]) =>
            `<label><input type="radio" name="lab-${s.key}" value="${value}"${WORST[s.key] === value ? ' checked' : ''}><span>${text}</span></label>`,
        )
        .join('') +
      `</div></fieldset>`,
  ).join('');

  const readouts = READOUTS.map(({ key, label }) => {
    const unit = key === 'top48' ? ` of ${N}` : '';
    const stars = key === 'mean' ? starRow(0, { size: 15, gap: 3, className: 'stars lab-avg-stars' }) : '';
    return (
      `<div class="lab-readout" data-readout="${key}"><dt>${label}</dt><dd>` +
      `<span class="lab-value"><span class="lab-num"></span>${stars}<span class="lab-unit">${unit}</span></span>` +
      `<span class="lab-last" hidden></span></dd></div>`
    );
  }).join('');

  const sliders = ASSUMPTIONS.map(
    (a) =>
      `<div class="lab-slider"><label for="lab-a-${a.id}">${a.label}</label><div class="lab-slider-row">` +
      `<input type="range" id="lab-a-${a.id}" min="${a.min}" max="${a.max}" step="${a.step}" value="${a.initial}" aria-valuetext="${a.format(a.initial)}">` +
      `<span class="lab-slider-value" data-value="${a.id}" aria-hidden="true">${a.format(a.initial)}</span></div></div>`,
  ).join('');

  const key = (cls) => `<svg class="lab-key ${cls}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${
    cls.includes('star') ? `<path d="${STAR_PATH}" transform="translate(-0.4 -0.1) scale(0.7)"/>` : '<circle cx="8" cy="8" r="5"/>'
  }</svg>`;

  return `
    <div class="lab-grid">
      <div class="lab-switches">${switches}</div>
      <div class="lab-stage">
        <p class="lab-round">Round 0 of 30</p>
        <div class="lab-field-wrap"><svg class="lab-field" role="img" aria-label="A dot plot of ${N} people by score."></svg></div>
        <div class="lab-playback">
          <button class="btn lab-play" type="button" data-action="play">Play</button>
          <button class="btn btn-quiet" type="button" data-action="restart">Restart</button>
          <button class="btn btn-quiet" type="button" data-action="again">Run again</button>
        </div>
      </div>
      <dl class="lab-readouts">${readouts}</dl>
      <p class="lab-status"></p>
      <p class="lab-legend">Each dot ${key('is-dot')}is a person, placed by score. Filled dots ${key('is-dot is-filled')}are the 10 most skilled. A gold star ${key('is-star')}marks the top 10 by score, with a dark edge ${key('is-star is-edge')}when that person is also one of the 10 most skilled. People nobody has vouched for sit in the lane at the left.</p>
      <details class="lab-drawer">
        <summary>Change the assumptions</summary>
        <div class="lab-drawer-body">
          ${sliders}
          <p class="lab-note">These change the size of each effect. The directions come from the research; the sizes are ours.</p>
          <button class="btn btn-quiet" type="button" data-action="reset">Reset assumptions</button>
        </div>
      </details>
      <div class="lab-live visually-hidden" aria-live="polite"></div>
    </div>`;
}

/* ---------- Helpers ---------- */

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}
