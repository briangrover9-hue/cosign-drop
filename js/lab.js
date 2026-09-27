// The trust lab: 80 coworkers vouching for each other, drawn as a dot plot
// that moves round by round, with a line of the average underneath. The model
// lives in lab-model.js; this file draws it and wires up the controls.
import { createWorld, createRun, DEFAULTS, WORST, COSIGN, TOP_N, HIGH_BAR } from './lab-model.js';
import { STAR_PATH, starRow, setStarRow } from './stars.js';

const NS = 'http://www.w3.org/2000/svg';
const ROUND_MS = 420; // time between rounds while playing
const TWEEN_MS = 280; // time dots take to reach their new places
// On the stars scale dots stack in score columns 0.05 wide, or 0.1 wide when the field is
// too narrow for 0.05 columns to sit side by side without piling into each other. Both
// widths put column edges on 4.8 and 5, so the 4.8+ band stays exact.
const COLUMNS_PER_STAR = [20, 10, 5];
const LANE_COLUMNS = 4; // the lane for people with nothing to count stacks them four across
const WIDE_FIELD = 520; // field width in pixels from which dots and the field get bigger
const MIN_FIELD_H = 120; // the shortest the field gets when it has to fit a pinned block
const TREND_H = 56; // height of the line of the average under the field
// Yes-scale axis ends. Each divides by 4, so the quarter ticks are whole numbers.
const YES_AXIS = [4, 8, 12, 16, 20, 24, 40, 60, 80, 100, 120, 160, 200, 240, 300, 400, 600, 800, 1000, 1200, 1600, 2000, 2400, 3000, 4000];
// Where the block with the field stays pinned under the header: every one-column layout
// at least 640px tall, and short landscape screens with the controls beside it. These
// match lab.css.
const PHONE_PIN = '(max-width: 879.98px) and (min-height: 640px)';
const SIDE_PIN = '(min-width: 640px) and (max-width: 879.98px) and (max-height: 500px)';

// Two starting points: the setting where the drift shows, and the one closest to Cosign's
// design. There is no "best" preset: the setting that scores highest does so because of
// assumptions we chose for vouches tied to work, and the page says so.
const PRESETS = [
  { id: 'worst', label: 'Worst', settings: WORST },
  { id: 'cosign', label: 'Cosign-style', settings: COSIGN },
];

const SWITCHES = [
  { key: 'scale', legend: 'The signal', options: [['stars', 'Stars, 1 to 5'], ['yes', 'A named yes']] },
  { key: 'type', legend: 'A vouch is', options: [['tap', 'One tap'], ['written', 'Written'], ['work', 'Tied to work']] },
  { key: 'vis', legend: 'They see it', options: [['visible', 'Right away'], ['blind', 'After both write']] },
  { key: 'who', legend: 'How they know you', options: [['anyone', 'Not said'], ['said', 'Said']] },
  { key: 'feed', legend: 'Feed ranks by', options: [['count', 'Count'], ['reputation', 'Who vouched'], ['plain', 'Nothing']] },
];

const percent = (v) => `${Math.round(v * 100)}%`;
// The anchor slider sits under "A vouch is"; the others live in the drawer. A slider with a
// scale shows only on that scale.
const ANCHOR = {
  id: 'anchor', path: ['anchor', 'work'], min: 0, max: 1, step: 0.05, format: percent, scale: 'stars',
  label: 'How firmly a vouch tied to work is held to a fixed standard',
};
const ASSUMPTIONS = [
  { id: 'push', path: ['push', 'visible'], min: 0, max: 0.3, step: 0.01, format: (v) => `${v.toFixed(2)} stars a round`, scale: 'stars',
    label: 'How much people shade up when the other person can see the vouch' },
  { id: 'autofive', path: ['autoFive', 'tap'], min: 0, max: 0.5, step: 0.01, format: percent, scale: 'stars',
    label: 'Share of one-tap ratings that are a reflexive five' },
  { id: 'autoyes', path: ['autoYes', 'tap'], min: 0, max: 0.6, step: 0.01, format: percent, scale: 'yes',
    label: 'Share of one-tap judgments that are a reflexive yes' },
  { id: 'repstrength', path: ['repStrength'], min: 0, max: 2, step: 0.1, format: (v) => v.toFixed(1), scale: 'yes',
    label: 'How strongly a track record weights a vouch' },
  { id: 'known', path: ['knownShare'], min: 0, max: 1, step: 0.05, format: percent,
    label: 'Share of vouches that go to people they worked with' },
  { id: 'stranger', path: ['strangerWeight'], min: 0, max: 1, step: 0.05, format: percent,
    label: 'How much a stranger’s vouch counts once they say how they know you' },
  { id: 'workvis', path: ['workVis'], min: 0, max: 1, step: 0.05, format: percent,
    label: 'How much strangers still judge visibility when a vouch points at work' },
  { id: 'halo', path: ['halo'], min: 0, max: 1, step: 0.05, format: (v) => v.toFixed(2),
    label: 'How much a ranked feed sways judgment' },
];
const SLIDERS = [ANCHOR, ...ASSUMPTIONS];
for (const a of SLIDERS) a.initial = a.path.reduce((o, k) => o[k], DEFAULTS);

// The four readouts on each scale, in the same four slots.
const READOUTS = {
  stars: [
    { key: 'mean', label: 'Average score' },
    { key: 'top48', label: 'At 4.8 or above' },
    { key: 'hits', label: 'The top 10 by score' },
    { key: 'unrated', label: 'No vouches at all' },
  ],
  yes: [
    { key: 'yesCount', label: 'Yeses per person' },
    { key: 'yesRate', label: 'Said yes' },
    { key: 'hits', label: 'The top 10 by standing' },
    { key: 'unrated', label: 'No yeses at all' },
  ],
};

// The line of the average, round by round.
const TREND = {
  // Every setting and assumption keeps the average between 3 and 5 (2.99 to 4.89 when
  // measured), so the axis starts at 3 to make the drift visible; the dot field shows the full scale.
  stars: { title: 'Average score, round by round', min: 3, max: 5, top: '5', bottom: '3', value: (h) => h.mean, text: (v) => v.toFixed(2) },
  yes: { title: 'Share of judgments that were a yes, round by round', min: 0, max: 1, top: '100%', bottom: '0%', value: (h) => h.yesRate, text: percent },
};

const root = document.getElementById('lab-root');
if (root) mount(root);

function mount(root) {
  const world = createWorld(Number(root.dataset.seed) || 102);
  const N = world.people.length;
  const skilled = new Set(world.topSkill);
  // Within a column the most skilled sit lowest, so the order never shuffles.
  const bySkill = world.people.map((p) => p.id).sort((a, b) => world.people[b].skill - world.people[a].skill);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motion.matches;
  const phonePin = window.matchMedia(PHONE_PIN);
  const sidePin = window.matchMedia(SIDE_PIN);
  const header = document.querySelector('.site-header');

  root.querySelector('.fallback')?.remove();
  root.insertAdjacentHTML('beforeend', template(N));
  const $ = (selector) => root.querySelector(selector);
  const stage = $('.lab-stage');
  const fieldWrap = $('.lab-field-wrap');
  const svg = $('.lab-field');
  const roundLabel = $('.lab-round');
  const trendTitle = $('.lab-trend-title');
  const trendSvg = $('.lab-trend-svg');
  const summary = $('.lab-summary');
  const playButton = $('[data-action="play"]');
  const statusLine = $('.lab-status');
  const legend = $('.lab-legend');
  const live = $('.lab-live');
  const avgStars = $('.lab-avg-stars');
  const probe = $('.lab-probe');
  const slots = [...root.querySelectorAll('.lab-readout')].map((box) => ({
    label: box.querySelector('dt'),
    num: box.querySelector('.lab-num'),
    unit: box.querySelector('.lab-unit'),
    last: box.querySelector('.lab-last'),
  }));

  // Static layer (axis, band, lane) and one reusable node per person. People
  // sit in three layers so filled dots draw above hollow ones and stars above both.
  const staticLayer = svgEl('g', { class: 'lab-static' });
  const hollowLayer = svgEl('g');
  const filledLayer = svgEl('g');
  const starLayer = svgEl('g');
  svg.append(staticLayer, hollowLayer, filledLayer, starLayer);
  const peopleLayers = [hollowLayer, filledLayer, starLayer];
  const nodes = world.people.map((p) => {
    const home = skilled.has(p.id) ? filledLayer : hollowLayer;
    const g = svgEl('g', { class: skilled.has(p.id) ? 'lab-p is-skilled' : 'lab-p' });
    const circle = svgEl('circle', { r: 4.5 });
    const star = svgEl('path', { class: 'lab-star', d: STAR_PATH });
    g.append(circle, star);
    home.append(g);
    return { g, circle, star, home, top: false };
  });

  // The line chart: rules and labels, the last run's line, this run's line and its end.
  const trendStatic = svgEl('g');
  const ghostLine = svgEl('polyline', { class: 'lab-trend-ghost' });
  const trendLine = svgEl('polyline', { class: 'lab-trend-line' });
  const trendDot = svgEl('circle', { class: 'lab-trend-dot', r: 2.5 });
  const trendValue = svgEl('text', { class: 'lab-trend-value' });
  trendSvg.append(trendStatic, ghostLine, trendLine, trendDot, trendValue);

  const state = {
    settings: { ...WORST },
    values: Object.fromEntries(SLIDERS.map((a) => [a.id, a.initial])),
    runSeed: 1,
    run: null,
    key: '',
    snap: null,
    playing: false,
    autoplayed: false,
    resumeOnShow: false,
    inReadingArea: false,
    axisMax: YES_AXIS[0], // yes scale: the axis end, which only grows during a run
    lastFinished: null, // { key, scale, metrics, history } of the most recent finished run
    reference: null, // the finished run before the current one, for "last run" and the dashed line
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
    for (const a of SLIDERS) {
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
    state.snap = state.run.snapshot(); // anything drawn from here on belongs to the new run
    state.key = [...Object.values(state.settings), ...SLIDERS.map((a) => state.values[a.id])].join('|');
    state.reference = state.lastFinished;
    state.axisMax = YES_AXIS[0];
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
    svg.setAttribute('aria-label', `A dot plot of 80 people ${placedBy()}, changing round by round.`);
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
    if (reduced) {
      idle();
      fadeIn();
    } else play();
  }

  // Everything left of the run at once. It works before, during or after a pause; a run
  // that is already over has nothing left to skip.
  function skip() {
    state.autoplayed = true;
    state.resumeOnShow = false;
    if (state.run.done) return;
    state.playing = false;
    while (!state.run.done) state.run.step();
    show(state.run.snapshot(), !reduced);
    fadeIn();
    finish();
  }

  // Round 0: nobody has been vouched for yet. With motion the lab autoplays, so it
  // never asks for a press.
  function idle() {
    playButton.textContent = 'Play';
    show(state.run.snapshot(), false);
    statusLine.textContent = reduced ? 'Press play to run 30 rounds.' : `Round 0 of ${state.run.rounds}`;
    svg.setAttribute('aria-label', `A dot plot of 80 people ${placedBy()}, before anyone has ${state.settings.scale === 'yes' ? 'said yes' : 'been vouched for'}.`);
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
    fadeIn();
    finish();
  }

  // With reduced motion the dots jump straight to their new places, and a short fade marks
  // the jump so it is not missed. Nothing moves. A jump within 300ms of the last one, as when
  // clicking or arrowing quickly through a switch, starts no new fade and lets a running one
  // finish, so a burst of quick changes fades once.
  let lastJump = -Infinity;
  function fadeIn() {
    const now = performance.now();
    const quick = now - lastJump < 300;
    lastJump = now;
    if (!reduced || quick || !svg.animate) return;
    const easing = getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || 'ease-out';
    for (const layer of peopleLayers) layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing });
  }

  function finish() {
    state.playing = false;
    playButton.textContent = 'Play';
    const snap = state.run.snapshot();
    const m = snap.metrics;
    const S = state.run.settings;
    const ref = sameScaleReference() && state.reference.key !== state.key ? state.reference.metrics : null;
    READOUTS[S.scale].forEach(({ key }, i) => {
      slots[i].last.hidden = !ref;
      if (ref) slots[i].last.textContent = `last run: ${numberText(key, ref)}`;
    });
    const sentence = verdict(m, S);
    statusLine.textContent = sentence;
    svg.setAttribute('aria-label', finishedLabel(m, S, state.run.rounds));
    announce(
      `Round ${state.run.rounds} of ${state.run.rounds}. ` +
        READOUTS[S.scale].map(({ key, label }) => `${label}: ${valueText(key, m, N, S.scale)}.`).join(' ') +
        ` ${sentence}`,
    );
    state.lastFinished = { key: state.key, scale: S.scale, metrics: m, history: snap.history };
  }

  function sameScaleReference() {
    return state.reference && state.reference.scale === state.run.settings.scale;
  }

  // Clear, then fill after a beat, so a repeated summary is still announced.
  let announceTimer = 0;
  function announce(text) {
    clearTimeout(announceTimer);
    live.textContent = '';
    announceTimer = setTimeout(() => (live.textContent = text), 60);
  }

  function placedBy() {
    if (state.settings.scale === 'stars') return 'by score';
    return weightedYeses(state.settings) ? 'by weighted yeses' : 'by yeses received';
  }

  /* ---------- Drawing ---------- */

  function show(snap, animate, now = performance.now()) {
    state.snap = snap;
    const S = state.run.settings;
    roundLabel.textContent = `Round ${snap.round} of ${state.run.rounds}`;
    if (snap.round > 0 && !state.run.done) statusLine.textContent = `Round ${snap.round} of ${state.run.rounds}`;

    // Gold stars for the top 10 by score, among people who have a score.
    const top = new Set(snap.topScore.filter((i) => snap.scores[i] !== null));
    nodes.forEach((n, i) => {
      const isTop = top.has(i);
      if (isTop === n.top) return;
      n.top = isTop;
      n.g.classList.toggle('is-top', isTop);
      (isTop ? starLayer : n.home).append(n.g);
    });

    // The yes axis grows to a round number above the top standing, and never shrinks mid-run.
    if (S.scale === 'yes') {
      state.axisMax = axisEnd(snap, state.axisMax);
      if (geo && geo.axisMax !== state.axisMax) {
        geo = geometry(geo.width, geo.height);
        drawStatic(geo, animate && snap.round > 1);
      }
    }

    if (geo) moveTo(targets(snap, geo), animate, now);
    updateReadouts(snap.metrics, S);
    updateSummary(snap.metrics, S);
    drawTrend();
    if (!state.run.done) for (const slot of slots) slot.last.hidden = true;
  }

  function updateReadouts(m, S) {
    READOUTS[S.scale].forEach(({ key }, i) => {
      const { num, unit } = valueParts(key, m, N, S.scale);
      setText(slots[i].num, num);
      setText(slots[i].unit, unit);
    });
    const stars = S.scale === 'stars' && m.mean !== null;
    avgStars.style.display = stars ? '' : 'none';
    if (stars) setStarRow(avgStars, m.mean);
  }

  function updateSummary(m, S) {
    let text = ' ';
    if (m.hits !== null && S.scale === 'stars') text = `Average ${m.mean.toFixed(2)} · top 10 finds ${m.hits} of 10`;
    if (m.hits !== null && S.scale === 'yes' && m.yesRate !== null) text = `Yes ${percent(m.yesRate)} · top 10 finds ${m.hits} of 10`;
    setText(summary, text);
  }

  // Pixel geometry of the field for a width and height, on the current scale.
  function geometry(width, height) {
    const wide = width >= WIDE_FIELD;
    const r = wide ? 5.5 : 4.5;
    const step = 2 * r + 1; // center to center, dots side by side or stacked
    const plotTop = 20; // top of the band and the lane rule; labels sit above
    const base = height - 28; // the axis line; tick labels sit below
    const laneLeft = 1;
    const laneRight = laneLeft + LANE_COLUMNS * step + 3;
    const x1 = laneRight + r + 10;
    const x5 = width - r - 6;
    const span = x5 - x1;
    const perStar = span / 4;
    const scale = state.settings.scale;
    const axisMax = state.axisMax;
    return {
      width, height, r, step, plotTop, base, laneLeft, laneRight, x1, x5, span, scale, axisMax,
      columns: COLUMNS_PER_STAR.find((n) => perStar / n >= 0.6 * step) ?? COLUMNS_PER_STAR[COLUMNS_PER_STAR.length - 1],
      bins: Math.max(1, Math.floor(span / step)), // yes scale: columns as wide as a dot
      bottom: base - r - 1.5, // center of the lowest dot in a stack
      highest: plotTop + r + 3, // center of the highest dot a stack may reach
      starSize: Math.round(r * 2.8),
      x: scale === 'yes' ? (v) => x1 + (v / axisMax) * span : (s) => x1 + (s - 1) * perStar,
    };
  }

  function drawStatic(G, fadeLabels = false) {
    svg.setAttribute('width', G.width);
    svg.setAttribute('height', G.height);
    svg.setAttribute('viewBox', `0 0 ${G.width} ${G.height}`);
    // An exact height, not one scaled from the width, so the lab's height is exact too.
    svg.style.height = `${G.height}px`;
    const labelY = G.plotTop - 7;
    // A label centered on the last tick would run past the right edge once it has a few
    // digits, so that one ends at the edge instead.
    const tick = (x, text, last = false) =>
      `<line class="lab-tick" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${G.base}" y2="${G.base + 5}"/>` +
      `<text class="lab-tick-label" x="${(last ? G.width - 1 : x).toFixed(1)}" y="${G.base + 19}" text-anchor="${last ? 'end' : 'middle'}">${text}</text>`;
    let body = '';
    if (G.scale === 'stars') {
      const bandX = G.x(HIGH_BAR);
      body +=
        `<rect class="lab-band" x="${bandX.toFixed(1)}" y="${G.plotTop}" width="${(G.width - bandX).toFixed(1)}" height="${G.base - G.plotTop}"/>` +
        `<text class="lab-label" x="${G.width - 1}" y="${labelY}" text-anchor="end">${HIGH_BAR}+</text>`;
      for (let v = 1; v <= 5; v++) body += tick(G.x(v), v);
    } else {
      const title = weightedYeses(state.settings) ? 'Weighted yeses' : 'Yeses received';
      body += `<text class="lab-label" x="${G.width - 1}" y="${labelY}" text-anchor="end">${title}</text>`;
      for (let k = 0; k <= 4; k++) body += tick(G.x1 + (G.span * k) / 4, (G.axisMax * k) / 4, k === 4 && String(G.axisMax).length > 1);
    }
    body +=
      `<line class="lab-lane-rule" x1="${G.laneRight + 0.5}" x2="${G.laneRight + 0.5}" y1="${G.plotTop}" y2="${G.base}"/>` +
      `<text class="lab-label" x="0" y="${labelY}">${G.scale === 'yes' ? 'No yeses' : 'No vouches'}</text>` +
      `<line class="lab-axis" x1="0" x2="${G.width}" y1="${G.base + 0.5}" y2="${G.base + 0.5}"/>`;
    staticLayer.innerHTML = body;
    // When the yes axis grows, its tick marks stay put and only the numbers change, so
    // nothing jitters; with motion the new numbers fade in while the dots ease over.
    if (fadeLabels && !reduced && staticLayer.animate) {
      for (const label of staticLayer.querySelectorAll('.lab-tick-label')) {
        label.animate([{ opacity: 0 }, { opacity: 1 }], { duration: TWEEN_MS, easing: 'ease-out' });
      }
    }
    const half = G.starSize / 2;
    const scale = G.starSize / 24;
    for (const n of nodes) {
      n.circle.setAttribute('r', G.r);
      n.star.setAttribute('transform', `translate(${-half} ${-half}) scale(${scale})`);
    }
    drawTrendStatic();
  }

  // Where each person belongs: a column by score or standing, or the lane if they have none.
  function targets(snap, G) {
    const out = new Float64Array(N * 2);
    const columns = new Map();
    const lane = [];
    const binWidth = G.span / G.bins;
    for (const i of bySkill) {
      const s = snap.scores[i];
      if (s === null) {
        lane.push(i);
        continue;
      }
      const c =
        G.scale === 'yes'
          ? Math.min(G.bins - 1, Math.floor((G.x(s) - G.x1) / binWidth))
          : Math.min(Math.floor(s * G.columns + 1e-6), 5 * G.columns - 1);
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
      const x = G.scale === 'yes' ? G.x1 + (c + 0.5) * binWidth : G.x((c + 0.5) / G.columns);
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

  // The line of the average: rules and end labels, redrawn when the size or scale changes.
  function trendBox() {
    const width = geo ? geo.width : 300;
    return { width, left: 34, right: width - 40, top: 7, bottom: TREND_H - 7 };
  }

  function drawTrendStatic() {
    const T = TREND[state.settings.scale];
    const B = trendBox();
    trendSvg.setAttribute('width', B.width);
    trendSvg.setAttribute('height', TREND_H);
    trendSvg.setAttribute('viewBox', `0 0 ${B.width} ${TREND_H}`);
    trendSvg.style.height = `${TREND_H}px`;
    trendStatic.innerHTML =
      `<line class="lab-trend-rule" x1="${B.left}" x2="${B.right}" y1="${B.top}" y2="${B.top}"/>` +
      `<line class="lab-trend-rule" x1="${B.left}" x2="${B.right}" y1="${B.bottom}" y2="${B.bottom}"/>` +
      `<text class="lab-label" x="${B.left - 6}" y="${B.top + 4}" text-anchor="end">${T.top}</text>` +
      `<text class="lab-label" x="${B.left - 6}" y="${B.bottom + 4}" text-anchor="end">${T.bottom}</text>`;
    drawTrend();
  }

  function drawTrend() {
    if (!state.run) return;
    const S = state.run.settings;
    const T = TREND[S.scale];
    const B = trendBox();
    const rounds = state.run.rounds;
    const x = (round) => B.left + ((round - 1) / (rounds - 1)) * (B.right - B.left);
    const y = (v) => B.bottom - Math.min(1, Math.max(0, (v - T.min) / (T.max - T.min))) * (B.bottom - B.top);
    const points = (history) => history.map((h) => `${x(h.round).toFixed(1)},${y(T.value(h)).toFixed(1)}`).join(' ');
    const history = state.snap ? state.snap.history : [];
    const ghost = sameScaleReference() ? state.reference.history : [];
    ghostLine.setAttribute('points', points(ghost));
    trendLine.setAttribute('points', points(history));
    const last = history[history.length - 1];
    trendDot.style.display = last ? '' : 'none';
    trendValue.style.display = last ? '' : 'none';
    let label = `${T.title}: no rounds yet.`;
    if (last) {
      const lx = x(last.round);
      const ly = y(T.value(last));
      trendDot.setAttribute('cx', lx.toFixed(1));
      trendDot.setAttribute('cy', ly.toFixed(1));
      trendValue.setAttribute('x', (lx + 6).toFixed(1));
      trendValue.setAttribute('y', Math.min(B.bottom + 4, Math.max(B.top + 4, ly + 4)).toFixed(1));
      setText(trendValue, T.text(T.value(last)));
      label = `${T.title}: ${T.text(T.value(history[0]))} in round 1, ${T.text(T.value(last))} in round ${last.round}.`;
    }
    if (ghost.length) label += ` The last run went from ${T.text(T.value(ghost[0]))} to ${T.text(T.value(ghost[ghost.length - 1]))}.`;
    trendSvg.setAttribute('aria-label', label);
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
    // Cubic ease-out. The dots leave on the round's tick and stay visibly in motion long enough
    // to follow. The page's --ease-out would cut that travel short, and --ease-in-out starts so
    // slowly (15% of the way after 100ms) that the dots would trail the round counter.
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

  /* ---------- Size and the pinned block ---------- */

  // How tall the field is. Pinned above the controls, the whole block must leave
  // at least 45% of the screen for the controls; beside the controls on a short landscape
  // screen, it must fit below the header. The small viewport height is used, so the field
  // does not change size when a phone's toolbars slide in and out.
  function fieldHeight(width) {
    const base = width >= WIDE_FIELD ? 300 : 240;
    if (!phonePin.matches && !sidePin.matches) return base;
    const small = probe.getBoundingClientRect().height || window.innerHeight;
    const headerH = header ? header.getBoundingClientRect().height : 48;
    const chrome = stage.getBoundingClientRect().height - fieldWrap.getBoundingClientRect().height;
    const room = phonePin.matches ? 0.55 * small - headerH - chrome : small - headerH - chrome - 8;
    return Math.max(MIN_FIELD_H, Math.min(base, room));
  }

  function resize(width, force = false, moveDots = true) {
    width = Math.floor(width);
    if (!width) return;
    const height = fieldHeight(width);
    if (!force && geo && geo.width === width && Math.abs(geo.height - height) < 0.5) return;
    geo = geometry(width, height);
    drawStatic(geo);
    if (state.snap && moveDots) moveTo(targets(state.snap, geo), false);
    pinMargin();
  }

  // Controls scrolled to by keyboard stop below the pinned block, not under it.
  function pinMargin() {
    const pinned = phonePin.matches;
    root.style.setProperty('--lab-stuck', pinned ? `${Math.ceil(stage.getBoundingClientRect().height) + 8}px` : '0px');
  }

  /* ---------- Controls ---------- */

  function syncControls() {
    for (const input of root.querySelectorAll('.lab-seg input')) input.checked = state.settings[input.name.slice(4)] === input.value;
    for (const button of root.querySelectorAll('[data-preset]')) {
      const preset = PRESETS.find((p) => p.id === button.dataset.preset).settings;
      button.setAttribute('aria-pressed', String(Object.keys(preset).every((k) => preset[k] === state.settings[k])));
    }
  }

  // Everything that differs between the stars and yes scales.
  let shownScale = '';
  function applyScale() {
    const scale = state.settings.scale;
    if (scale === shownScale) return;
    shownScale = scale;
    READOUTS[scale].forEach(({ label }, i) => setText(slots[i].label, label));
    setText(trendTitle, TREND[scale].title);
    legend.innerHTML = legendHtml(scale);
    for (const a of SLIDERS) {
      const box = $(`[data-slider="${a.id}"]`);
      if (box) box.hidden = Boolean(a.scale) && a.scale !== scale;
    }
  }

  // A new setting of the switches. A change of scale or feed changes the axis too, and on the
  // yes scale so does saying how the giver knows you (it decides whether yeses are weighted),
  // so the field is redrawn first; the dots then travel from where they are to the new run.
  function changeSettings(next) {
    const redraw =
      next.scale !== state.settings.scale ||
      next.feed !== state.settings.feed ||
      (next.scale === 'yes' && weightedYeses(next) !== weightedYeses(state.settings));
    state.settings = next;
    syncControls();
    applyScale();
    state.playing = false;
    startRun();
    if (redraw && geo) resize(fieldWrap.getBoundingClientRect().width, true, false);
    if (reduced) finishNow();
    else play();
  }

  root.querySelectorAll('.lab-seg input').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) changeSettings({ ...state.settings, [input.name.slice(4)]: input.value });
    });
  });

  root.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = PRESETS.find((p) => p.id === button.dataset.preset).settings;
      changeSettings({ ...preset });
    });
  });

  playButton.addEventListener('click', () => (state.playing ? pause() : play()));
  $('[data-action="skip"]').addEventListener('click', skip);
  $('[data-action="restart"]').addEventListener('click', restart);
  $('[data-action="again"]').addEventListener('click', () => {
    state.runSeed += 1;
    rerun();
  });

  const sliders = SLIDERS.map((a) => {
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

  // Autoplay once when the field is well inside the reading area: below the sticky
  // header and above the bottom fifth of the screen. Pause as soon as none of it can
  // be seen (behind the header counts) or the tab is hidden, and pick up again once
  // it is back in the reading area.
  if ('IntersectionObserver' in window) {
    const headerHeight = header?.offsetHeight ?? 0;
    new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        const tall = entry.rootBounds && entry.intersectionRect.height >= entry.rootBounds.height * 0.9;
        state.inReadingArea = entry.isIntersecting && (entry.intersectionRatio >= 0.9 || tall);
        if (!state.inReadingArea || document.hidden) return;
        if (!state.autoplayed && !reduced) play();
        else if (state.resumeOnShow) play();
      },
      { rootMargin: `-${headerHeight}px 0px -20% 0px`, threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
    ).observe(fieldWrap);
    new IntersectionObserver(
      (entries) => {
        if (!entries[entries.length - 1].isIntersecting) pause(true);
      },
      { rootMargin: `-${headerHeight}px 0px 0px 0px` },
    ).observe(fieldWrap);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(true);
    else if (state.resumeOnShow && state.inReadingArea) play();
  });

  let resizeTimer = 0;
  const later = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => resize(fieldWrap.getBoundingClientRect().width), 120);
  };
  if ('ResizeObserver' in window) {
    new ResizeObserver((entries) => {
      if (!geo) return resize(entries[entries.length - 1].contentRect.width);
      later();
    }).observe(fieldWrap);
  }
  // The pinned field also depends on the screen's height and on the rest of its block.
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      pinMargin();
      if (geo && (phonePin.matches || sidePin.matches)) later();
    }).observe(stage);
  }
  window.addEventListener('resize', later);
  phonePin.addEventListener('change', later);
  sidePin.addEventListener('change', later);

  applyScale();
  resize(fieldWrap.getBoundingClientRect().width);
  startRun();
  idle();
  root.classList.add('is-built');
}

/* ---------- Text ---------- */

// The big number and the words after it, for one readout.
function valueParts(key, m, N, scale) {
  switch (key) {
    case 'mean':
      return m.mean === null ? { num: '', unit: 'no scores yet' } : { num: m.mean.toFixed(2), unit: '' };
    case 'top48':
      return { num: String(m.top48), unit: ` of ${N}` };
    case 'yesCount':
      return { num: m.yesCount.toFixed(1), unit: '' };
    case 'yesRate':
      return m.yesRate === null ? { num: '', unit: 'no rounds yet' } : { num: percent(m.yesRate), unit: ' of judgments' };
    case 'hits':
      return m.hits === null
        ? { num: '', unit: scale === 'yes' ? 'no yeses yet' : 'no scores yet' }
        : { num: String(m.hits), unit: ` of the ${TOP_N} most skilled` };
    default:
      return { num: String(m.unrated), unit: '' };
  }
}

function valueText(key, m, N, scale) {
  const { num, unit } = valueParts(key, m, N, scale);
  return `${num}${unit}`.trim();
}

function numberText(key, m) {
  if (key === 'mean') return m.mean.toFixed(2);
  if (key === 'yesCount') return m.yesCount.toFixed(1);
  if (key === 'yesRate') return percent(m.yesRate);
  return String(m[key]);
}

// On the yes scale, standing is a plain count of yeses unless a stranger's yes counts less
// (vouches say how the giver knows you) or the feed weights each yes by track record.
function weightedYeses(S) {
  return S.who === 'said' || S.feed === 'reputation';
}

// The one-line reading of a finished run.
function verdict(m, S) {
  if (S.scale === 'yes') {
    const by = S.feed === 'reputation' ? 'yeses weighted by track record' : weightedYeses(S) ? 'weighted yeses' : 'yeses';
    let text = `People said yes to ${percent(m.yesRate)} of those they judged, and a top 10 by ${by} finds ${m.hits} of the 10 most skilled.`;
    if (m.unrated >= 5) text += ` ${m.unrated} people got no yes at all.`;
    return text;
  }
  const finds = `a top 10 by score finds ${m.hits} of the 10 most skilled.`;
  let text;
  if (m.top48 >= 20) text = `The scores have piled up near 5, and ${finds}`;
  else if (m.top48 <= 10) text = `The scores stay spread out, and ${finds}`;
  else text = `Some scores bunch near the top, and ${finds}`;
  if (m.unrated >= 5) text += ` ${m.unrated} people never got a single vouch.`;
  return text;
}

function finishedLabel(m, S, rounds) {
  if (S.scale === 'yes') {
    return `After ${rounds} rounds, people said yes to ${percent(m.yesRate)} of those they judged, the average person has ${m.yesCount.toFixed(1)} yeses, and the top ${TOP_N} by standing includes ${m.hits} of the ${TOP_N} most skilled.`;
  }
  return `After ${rounds} rounds, the average score is ${m.mean.toFixed(2)}, ${m.top48} of 80 people are at ${HIGH_BAR} or above, and the top ${TOP_N} by score includes ${m.hits} of the ${TOP_N} most skilled.`;
}

function keyGlyph(cls) {
  return `<svg class="lab-key ${cls}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${
    cls.includes('star') ? `<path d="${STAR_PATH}" transform="translate(-0.4 -0.1) scale(0.7)"/>` : '<circle cx="8" cy="8" r="5"/>'
  }</svg>`;
}

function legendHtml(scale) {
  const dot = keyGlyph('is-dot');
  const filled = keyGlyph('is-dot is-filled');
  const star = keyGlyph('is-star');
  const edge = keyGlyph('is-star is-edge');
  if (scale === 'yes') {
    return `Each dot ${dot}is a person, placed by their yeses. When vouches say how the giver knows you, a stranger’s yes counts a quarter, and in a feed ranked by who vouched, each yes also counts by the giver’s track record. Filled dots ${filled}are the 10 most skilled. A gold star ${star}marks the top 10 by standing, with a dark edge ${edge}when that person is also one of the 10 most skilled. People with no yeses sit in the lane at the left. Under the field, a dashed line shows the last finished run.`;
  }
  return `Each dot ${dot}is a person, placed by score. Filled dots ${filled}are the 10 most skilled. A gold star ${star}marks the top 10 by score, with a dark edge ${edge}when that person is also one of the 10 most skilled. People nobody has vouched for sit in the lane at the left. Under the field, a dashed line shows the last finished run.`;
}

function sliderHtml(a, extra = '') {
  return (
    `<div class="lab-slider${a === ANCHOR ? ' lab-anchor' : ''}" data-slider="${a.id}"><label for="lab-a-${a.id}">${a.label}</label><div class="lab-slider-row">` +
    `<input type="range" id="lab-a-${a.id}" min="${a.min}" max="${a.max}" step="${a.step}" value="${a.initial}" aria-valuetext="${a.format(a.initial)}">` +
    `<span class="lab-slider-value" data-value="${a.id}" aria-hidden="true">${a.format(a.initial)}</span></div>${extra}</div>`
  );
}

function template(N) {
  const fieldset = (s) =>
    `<fieldset class="lab-switch"><legend>${s.legend}</legend><div class="lab-seg">` +
    s.options
      .map(
        ([value, text]) =>
          `<label><input type="radio" name="lab-${s.key}" value="${value}"${WORST[s.key] === value ? ' checked' : ''}><span>${text}</span></label>`,
      )
      .join('') +
    `</div></fieldset>`;
  const [scale, type, ...rest] = SWITCHES;
  const switches =
    fieldset(scale) +
    `<div class="lab-switch-group">${fieldset(type)}${sliderHtml(ANCHOR, '<p class="lab-anchor-note">Our assumption. With the other switches at their worst, lowering it brings the drift back.</p>')}</div>` +
    rest.map(fieldset).join('');

  const presets = PRESETS.map(
    (p) => `<button class="btn btn-quiet lab-preset" type="button" data-preset="${p.id}" aria-pressed="${p.id === 'worst'}">${p.label}</button>`,
  ).join('');

  const readouts = READOUTS.stars.map(({ key, label }) => {
    const stars = key === 'mean' ? starRow(0, { size: 15, gap: 3, className: 'stars lab-avg-stars' }) : '';
    const chance = key === 'hits' ? '<span class="lab-chance">Chance alone: about 1</span>' : '';
    return (
      `<div class="lab-readout" data-readout="${key}"><dt>${label}</dt><dd>` +
      `<span class="lab-value"><span class="lab-num"></span>${stars}<span class="lab-unit"></span></span>` +
      `<span class="lab-last" hidden></span>${chance}</dd></div>`
    );
  }).join('');

  return `
    <div class="lab-grid">
      <div class="lab-top">
        <div class="lab-stage">
          <p class="lab-round">Round 0 of 30</p>
          <div class="lab-field-wrap"><svg class="lab-field" role="img" aria-label="A dot plot of ${N} people by score."></svg></div>
          <div class="lab-trend">
            <p class="lab-trend-title"></p>
            <svg class="lab-trend-svg" role="img" aria-label=""></svg>
          </div>
          <p class="lab-summary"> </p>
        </div>
        <div class="lab-controls">
          <fieldset class="lab-switch lab-presets"><legend>Start from</legend><div class="lab-preset-row">${presets}</div></fieldset>
          <div class="lab-switches">${switches}</div>
        </div>
        <div class="lab-playback">
          <button class="btn lab-play" type="button" data-action="play">Play</button>
          <button class="btn btn-quiet" type="button" data-action="skip">Skip to the end</button>
          <button class="btn btn-quiet" type="button" data-action="restart">Restart</button>
          <button class="btn btn-quiet" type="button" data-action="again">Run again</button>
        </div>
      </div>
      <dl class="lab-readouts">${readouts}</dl>
      <p class="lab-status"></p>
      <p class="lab-legend"></p>
      <details class="lab-drawer">
        <summary>Change the assumptions</summary>
        <div class="lab-drawer-body">
          ${ASSUMPTIONS.map((a) => sliderHtml(a)).join('')}
          <p class="lab-note">These change the size of each effect, and at the extremes some effects reverse. The directions at the defaults come from the research; the sizes are ours.</p>
          <button class="btn btn-quiet" type="button" data-action="reset">Reset assumptions</button>
        </div>
      </details>
      <div class="lab-live visually-hidden" aria-live="polite"></div>
      <div class="lab-probe" aria-hidden="true"></div>
    </div>`;
}

/* ---------- Helpers ---------- */

// The axis end for the yes scale: the first round number at least 10% above the top
// standing, and never below the current end, so the axis only grows during a run.
function axisEnd(snap, current) {
  let top = 0;
  for (const s of snap.scores) if (s !== null && s > top) top = s;
  const need = top * 1.1;
  const nice = YES_AXIS.find((v) => v >= need) ?? Math.ceil(need / 1000) * 1000;
  return Math.max(current, nice);
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}
