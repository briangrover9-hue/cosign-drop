// The trust lab: 80 coworkers vouching for each other, drawn as a dot plot that moves round by
// round. The model lives in lab-model.js; this file draws it and wires up its controls.
//
// Scenes 3 and 4 share this one lab. Scene 3 plays the worst rules from round 0. Scene 4's big
// switch ties every rating to real work, and the dots move to the new run's end at once, so the
// gold stars can be seen finding the black dots. "Try other rules" opens a frosted panel over
// the scene's text, beside the chart on desktop and above it on a phone, so the chart stays in
// full view while its switches change.
import { createWorld, createRun, DEFAULTS, WORST, COSIGN, TOP_N, HIGH_BAR } from './lab-model.js';
import { STAR_PATH } from './stars.js';
import { MOVE_MS, ease, animate, reduceMotion, setLine } from './motion.js';

const NS = 'http://www.w3.org/2000/svg';
const ROUND_MS = 280; // time between rounds while playing
// On the stars scale dots stack in score columns 0.05 wide, or 0.1 wide when the field is
// too narrow for 0.05 columns to sit side by side without piling into each other. Both
// widths put column edges on 4.8 and 5, so the 4.8+ band stays exact.
const COLUMNS_PER_STAR = [20, 10, 5];
const LANE_COLUMNS = 4; // the lane for people with nothing to count stacks them four across
const WIDE_FIELD = 520; // field width in pixels from which dots get bigger
const MIN_FIELD_H = 96;
// Yes-scale axis ends. Each divides by 4, so the quarter ticks are whole numbers.
const YES_AXIS = [4, 8, 12, 16, 20, 24, 40, 60, 80, 100, 120, 160, 200, 240, 300, 400, 600, 800, 1000, 1200, 1600, 2000, 2400, 3000, 4000];
const WORK = Object.freeze({ ...WORST, type: 'work' });
const html = document.documentElement;

// One or two plain sentences under the field for the switch just flipped: what it means and
// what to watch for. Where a switch works differently on the two scales, each has its own.
const EXPLAIN = {
  scale: () => 'Stars give a score from 1 to 5. A named yes is just “I vouch for this person,” like a cosign.',
  type: {
    tap: (scale) =>
      scale === 'yes'
        ? 'Anyone can say yes with one click. It’s free, so people say yes to most of those they see.'
        : 'One click is free, so people hand out lots of ratings. Watch the dots pile up at 5.',
    written: (scale) =>
      scale === 'yes'
        ? 'Now people write a few words. That takes effort, so they only say yes when they mean it.'
        : 'Now people write a few words. That takes effort, so they give fewer ratings and think more.',
    work: () => 'Praise now has to point at real work. That’s hard to fake, so watch the stars find the dots.',
  },
  vis: {
    visible: () => 'People see what you said about them, so it’s awkward to be honest.',
    blind: () => 'Nobody sees the other’s words until both are done, so there’s no reason to trade nice ones.',
  },
  who: {
    anyone: () => 'Vouches don’t say how people know each other, so a stranger’s counts as much as a coworker’s.',
    said: () => 'Now each vouch says how they know you. A stranger’s vouch counts for less.',
  },
  feed: {
    count: () => 'The people with the most vouches get shown the most, so they get even more.',
    reputation: () => 'Vouches from people with a good track record count more.',
    plain: () => 'Everyone gets shown the same, so no one runs away with it.',
  },
  preset: {
    worst: () => 'The worst rules: one-click stars, seen right away, in a feed that shows off the most rated.',
    cosign: () => 'Cosign-style rules: a written, named yes that says how you know them, weighted by who gave it.',
  },
  assumption: () => 'You changed one of our guesses. The chart shows the same rules under it.',
};
const explainFor = (why, scale) => {
  if (why.preset) return EXPLAIN.preset[why.preset](scale);
  if (why.assumption) return EXPLAIN.assumption();
  if (why.key === 'scale') return EXPLAIN.scale(scale);
  return EXPLAIN[why.key][why.value](scale);
};

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
// The anchor slider sits under "A vouch is"; the others live under "Our assumptions". A slider with a
// scale shows only on that scale.
const ANCHOR = {
  id: 'anchor', path: ['anchor', 'work'], min: 0, max: 1, step: 0.05, format: percent, scale: 'stars',
  label: 'How strictly a vouch about real work sticks to a fixed bar',
};
const ASSUMPTIONS = [
  { id: 'push', path: ['push', 'visible'], min: 0, max: 0.3, step: 0.01, format: (v) => `${v.toFixed(2)} stars a round`, scale: 'stars',
    label: 'How much people round up when the other person will see it' },
  { id: 'autofive', path: ['autoFive', 'tap'], min: 0, max: 0.5, step: 0.01, format: percent, scale: 'stars',
    label: 'One-tap ratings that are an automatic five' },
  { id: 'autoyes', path: ['autoYes', 'tap'], min: 0, max: 0.6, step: 0.01, format: percent, scale: 'yes',
    label: 'One-tap judgments that are an automatic yes' },
  { id: 'repstrength', path: ['repStrength'], min: 0, max: 2, step: 0.1, format: (v) => v.toFixed(1), scale: 'yes',
    label: 'How much a good track record boosts a vouch' },
  { id: 'known', path: ['knownShare'], min: 0, max: 1, step: 0.05, format: percent,
    label: 'Vouches that go to people they worked with' },
  { id: 'stranger', path: ['strangerWeight'], min: 0, max: 1, step: 0.05, format: percent,
    label: 'How much a stranger’s vouch counts, once vouches say how they know you' },
  { id: 'workvis', path: ['workVis'], min: 0, max: 1, step: 0.05, format: percent,
    label: 'How much strangers judge real work by how well known its maker is' },
  { id: 'halo', path: ['halo'], min: 0, max: 1, step: 0.05, format: (v) => v.toFixed(2),
    label: 'How much a ranked feed sways people’s judgment' },
];
const SLIDERS = [ANCHOR, ...ASSUMPTIONS];
for (const a of SLIDERS) a.initial = a.path.reduce((o, k) => o[k], DEFAULTS);

// The second big number: the average score on the stars scale, the share of yeses on the other.
const SECOND = {
  stars: { label: 'Average score', value: (m) => m.mean, text: (v) => v.toFixed(2) },
  yes: { label: 'Said yes', value: (m) => m.yesRate, text: percent },
};
// The small line of that number, round by round. Every setting and assumption keeps the
// average between 3 and 5 (2.99 to 4.89 when measured), so its axis starts at 3.
const TREND = {
  stars: { min: 3, max: 5, value: (h) => h.mean, title: 'Average score, round by round', text: (v) => v.toFixed(2) },
  yes: { min: 0, max: 1, value: (h) => h.yesRate, title: 'Share of judgments that were a yes, round by round', text: percent },
};

const root = document.getElementById('lab-root');
const panel = document.getElementById('lab-panel');
if (root && panel) mount(root, panel);

function mount(root, panel) {
  const scene = root.closest('.scene');
  const bigSwitch = document.getElementById('work-switch');
  const openButton = document.getElementById('rules-open');
  const labBody = document.getElementById('lab-body');
  const fixNote = document.getElementById('fix-note');
  const bodyIntro = labBody ? labBody.textContent.trim() : '';
  const noteIntro = fixNote ? fixNote.textContent.trim() : '';

  const world = createWorld(Number(root.dataset.seed) || 256);
  const N = world.people.length;
  const skilled = new Set(world.topSkill);
  // Within a column the most skilled sit lowest, so the order never shuffles.
  const bySkill = world.people.map((p) => p.id).sort((a, b) => world.people[b].skill - world.people[a].skill);
  let reduced = reduceMotion.matches;

  root.querySelector('.fallback')?.remove();
  root.insertAdjacentHTML('beforeend', labTemplate(N));
  panel.innerHTML = panelTemplate(WORST);
  panel.setAttribute('tabindex', '-1');
  const $ = (selector) => root.querySelector(selector) || panel.querySelector(selector);
  const fieldWrap = $('.lab-field-wrap');
  const svg = $('.lab-field');
  const roundLabel = $('.lab-round');
  const explain = $('.lab-explain');
  const live = $('.lab-live');
  const legendStar = $('.lab-legend-star');
  const hitsNum = $('[data-num="hits"]');
  const secondNum = $('[data-num="second"]');
  const secondLabel = $('[data-readout="second"] .lab-readout-label');
  const spark = $('.lab-spark');
  const anchorBox = $('[data-slider="anchor"]');

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

  // The small line: the last run's line dashed behind this run's.
  const ghostLine = svgEl('polyline', { class: 'lab-spark-ghost' });
  const sparkLine = svgEl('polyline', { class: 'lab-spark-line' });
  const sparkDot = svgEl('circle', { class: 'lab-spark-dot', r: 2.25 });
  spark.append(ghostLine, sparkLine, sparkDot);

  const state = {
    settings: { ...WORST },
    values: Object.fromEntries(SLIDERS.map((a) => [a.id, a.initial])),
    runSeed: 1,
    run: null,
    key: '',
    snap: null,
    playing: false,
    axisMax: YES_AXIS[0], // yes scale: the axis end, which only grows during a run
    lastFinished: null, // { key, scale, metrics, history } of the most recent finished run
    reference: null, // the finished run before the current one, for the dashed line
    scene: -1, // the stage's current scene
    flipped: false, // the big switch has been used since the reader arrived
    resumeOnShow: false,
  };

  // Positions: where each dot is drawn now, where a tween started, where it ends.
  const cur = new Float64Array(N * 2);
  const from = new Float64Array(N * 2);
  const to = new Float64Array(N * 2);
  let geo = null;
  let tweenStart = -1;
  let frameId = 0;
  let nextRoundAt = 0;
  let startTimer = 0;
  let stopNumbers = null;

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
  const assumptionsUntouched = () => SLIDERS.every((a) => state.values[a.id] === a.initial);
  const sameAs = (a, b) => Object.keys(b).every((k) => a[k] === b[k]);

  function startRun() {
    state.run = createRun(world, state.settings, state.runSeed, overrides());
    state.snap = state.run.snapshot(); // anything drawn from here on belongs to the new run
    state.key = [...Object.values(state.settings), ...SLIDERS.map((a) => state.values[a.id])].join('|');
    state.reference = state.lastFinished;
    state.axisMax = YES_AXIS[0];
  }

  function play() {
    clearTimeout(startTimer);
    state.resumeOnShow = false;
    if (reduced) {
      finishNow();
      return;
    }
    if (state.run.done) startRun();
    state.playing = true;
    svg.setAttribute('aria-label', `A dot plot of 80 people ${placedBy()}, changing round by round.`);
    const now = performance.now();
    advance(now);
    nextRoundAt = now + ROUND_MS;
    loop();
  }

  function pause(auto = false) {
    clearTimeout(startTimer);
    if (!state.playing) return;
    state.playing = false;
    state.resumeOnShow = auto;
  }

  // Round 0: nobody has been vouched for yet.
  function idle() {
    state.playing = false;
    show(state.run.snapshot(), false);
    svg.setAttribute('aria-label', `A dot plot of 80 people ${placedBy()}, before anyone has ${state.settings.scale === 'yes' ? 'said yes' : 'been vouched for'}.`);
  }

  function advance(now) {
    show(state.run.step(), !reduced, now);
    if (state.run.done) finish();
  }

  // The current run's end, at once. With motion the dots travel there and the big numbers
  // count to their new values; with reduced motion the dots jump and fade in.
  function settle(animateIt = true) {
    clearTimeout(startTimer);
    state.playing = false;
    state.resumeOnShow = false;
    const before = { ...shown };
    while (!state.run.done) state.run.step();
    const moving = animateIt && !reduced;
    if (moving && !stopNumbers) stopNumbers = () => {}; // show() leaves the numbers to countNumbers
    show(state.run.snapshot(), moving);
    if (moving) countNumbers(before);
    else fadeIn();
    finish();
  }
  const finishNow = () => settle(false);

  // With reduced motion the dots jump straight to their new places, and a short fade marks
  // the jump so it is not missed. A jump within 300ms of the last one, as when clicking or
  // arrowing quickly through a switch, starts no new fade, so a burst of changes fades once.
  let lastJump = -Infinity;
  function fadeIn() {
    const now = performance.now();
    const quick = now - lastJump < 300;
    lastJump = now;
    if (!reduced || quick || !svg.animate) return;
    for (const layer of peopleLayers) layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOVE_MS, easing: 'cubic-bezier(.16, 1, .3, 1)' });
  }

  function finish() {
    state.playing = false;
    const snap = state.run.snapshot();
    const m = snap.metrics;
    const S = state.run.settings;
    svg.setAttribute('aria-label', finishedLabel(m, S, state.run.rounds));
    state.lastFinished = { key: state.key, scale: S.scale, metrics: m, history: snap.history };
    narrate(m);
    const second = S.scale === 'stars' ? ` The average score is ${m.mean.toFixed(2)}.` : ` People said yes ${percent(m.yesRate)} of the time.`;
    announce(`After ${state.run.rounds} rounds, the gold stars found ${m.hits} of the 10 best.${second}`);
  }

  // The scene text that follows the runs: scene 3's line once the worst rules have played, and
  // the note under scene 4's switch.
  function narrate(m) {
    const plain = assumptionsUntouched();
    if (plain && sameAs(state.settings, WORST) && m.hits !== null) {
      setLine(
        labBody,
        m.top48 >= 20
          ? `The scores drifted up toward 5, so the gold stars found only ${m.hits} of the 10 best.`
          : `The gold stars found ${m.hits} of the 10 best.`,
      );
    }
    updateNote(m);
  }

  function updateNote(m = state.snap && state.run.done ? state.snap.metrics : null) {
    const plain = assumptionsUntouched();
    const worst = plain && sameAs(state.settings, WORST);
    const work = plain && sameAs(state.settings, WORK);
    let text = noteIntro;
    if (!state.flipped && worst) text = noteIntro;
    else if (!m) text = noteIntro;
    else if (work)
      text =
        m.top48 <= 10
          ? `The scores stayed spread out, so the gold stars found ${m.hits} of the 10 best.`
          : `The gold stars found ${m.hits} of the 10 best.`;
    else if (worst) text = `Back to one tap: the scores drift up, and the gold stars find only ${m.hits} of the 10 best.`;
    else text = `With your rules, the gold stars found ${m.hits} of the 10 best.`;
    setLine(fixNote, text);
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

  // The big numbers as they stand on the screen, so a change counts on from them.
  const shown = { hits: 0, second: null, scale: 'stars' };

  function show(snap, animateIt, now = performance.now()) {
    state.snap = snap;
    const S = state.run.settings;
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

    // The yes axis grows to a round number above the top standing, and never shrinks mid-run.
    if (S.scale === 'yes') {
      state.axisMax = axisEnd(snap, state.axisMax);
      if (geo && geo.axisMax !== state.axisMax) {
        geo = geometry(geo.width, geo.height);
        drawStatic(geo, animateIt && snap.round > 1);
      }
    }

    if (geo) moveTo(targets(snap, geo), animateIt, now);
    if (!stopNumbers) writeNumbers(snap.metrics, S);
    drawSpark();
  }

  function writeNumbers(m, S) {
    const second = SECOND[S.scale];
    const v = second.value(m);
    shown.hits = m.hits === null ? 0 : m.hits;
    shown.second = v;
    shown.scale = S.scale;
    setText(hitsNum, String(shown.hits));
    setText(secondNum, v === null ? ' ' : second.text(v));
  }

  // The two big numbers count from where they were to the run's end, in step with the dots.
  function countNumbers(before) {
    if (stopNumbers) stopNumbers();
    const m = state.snap.metrics;
    const S = state.run.settings;
    const second = SECOND[S.scale];
    const hitsTo = m.hits === null ? 0 : m.hits;
    const secondTo = second.value(m);
    // A new scale counts nothing across: its second number starts where it ends.
    const secondFrom = before.second === null || secondTo === null || before.scale !== S.scale ? secondTo : before.second;
    stopNumbers = animate(
      MOVE_MS,
      (e) => {
        shown.hits = Math.round(before.hits + (hitsTo - before.hits) * e);
        setText(hitsNum, String(shown.hits));
        if (secondTo !== null) {
          shown.second = secondFrom + (secondTo - secondFrom) * e;
          shown.scale = S.scale;
          setText(secondNum, second.text(shown.second));
        }
      },
      () => {
        stopNumbers = null;
        writeNumbers(m, S);
      },
    );
  }

  // Pixel geometry of the field for a width and height, on the current scale.
  function geometry(width, height) {
    const wide = width >= WIDE_FIELD;
    const r = wide ? 5.5 : 4.5;
    const step = 2 * r + 1; // center to center, dots side by side or stacked
    const plotTop = 20; // top of the band and the lane rule; labels sit above
    const base = height - 26; // the axis line; tick labels sit below
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
    svg.setAttribute('viewBox', `0 0 ${G.width} ${G.height}`);
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
        label.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOVE_MS, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      }
    }
    const half = G.starSize / 2;
    const scale = G.starSize / 24;
    for (const n of nodes) {
      n.circle.setAttribute('r', G.r);
      n.star.setAttribute('transform', `translate(${-half} ${-half}) scale(${scale})`);
    }
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

  // The small line of the second number, round by round.
  function drawSpark() {
    if (!state.run) return;
    const S = state.run.settings;
    const T = TREND[S.scale];
    const W = 96;
    const H = 30;
    spark.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const rounds = state.run.rounds;
    const x = (round) => 2 + ((round - 1) / (rounds - 1)) * (W - 4);
    const y = (v) => H - 3 - Math.min(1, Math.max(0, (v - T.min) / (T.max - T.min))) * (H - 6);
    const points = (history) => history.map((h) => `${x(h.round).toFixed(1)},${y(T.value(h)).toFixed(1)}`).join(' ');
    const history = state.snap ? state.snap.history : [];
    const ghost = state.reference && state.reference.scale === S.scale && state.reference.key !== state.key ? state.reference.history : [];
    ghostLine.setAttribute('points', points(ghost));
    sparkLine.setAttribute('points', points(history));
    const last = history[history.length - 1];
    sparkDot.style.display = last ? '' : 'none';
    if (last) {
      sparkDot.setAttribute('cx', x(last.round).toFixed(1));
      sparkDot.setAttribute('cy', y(T.value(last)).toFixed(1));
    }
  }

  function place(i) {
    nodes[i].g.setAttribute('transform', `translate(${cur[2 * i].toFixed(1)} ${cur[2 * i + 1].toFixed(1)})`);
  }

  function moveTo(next, animateIt, now = performance.now()) {
    if (!animateIt) {
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

  // The dots move on the page's one curve, over the page's 500ms.
  function tween(now) {
    const t = Math.min(1, Math.max(0, (now - tweenStart) / MOVE_MS));
    const e = ease(t);
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

  /* ---------- Size ---------- */

  // The field takes whatever height its scene leaves it.
  function resize(force = false, moveDots = false) {
    const width = Math.floor(fieldWrap.clientWidth);
    const height = Math.max(MIN_FIELD_H, Math.floor(fieldWrap.clientHeight));
    if (!width) return;
    if (!force && geo && geo.width === width && Math.abs(geo.height - height) < 1) return;
    geo = geometry(width, height);
    drawStatic(geo);
    if (state.snap) moveTo(targets(state.snap, geo), moveDots && !reduced);
  }

  /* ---------- Controls ---------- */

  function syncControls() {
    for (const input of panel.querySelectorAll('.lab-seg input')) input.checked = state.settings[input.dataset.key] === input.value;
    for (const button of panel.querySelectorAll('[data-preset]')) {
      const preset = PRESETS.find((p) => p.id === button.dataset.preset).settings;
      button.setAttribute('aria-pressed', String(sameAs(state.settings, preset)));
    }
    bigSwitch?.setAttribute('aria-checked', String(state.settings.type === 'work'));
  }

  // Everything that differs between the stars and yes scales.
  let shownScale = '';
  function applyScale() {
    const scale = state.settings.scale;
    if (scale === shownScale) return;
    shownScale = scale;
    setText(secondLabel, SECOND[scale].label);
    setText(legendStar, scale === 'yes' ? 'The top 10 by yeses' : 'The 10 you’d hire by score');
    spark.setAttribute('aria-label', TREND[scale].title);
    for (const a of ASSUMPTIONS) {
      const box = panel.querySelector(`[data-slider="${a.id}"]`);
      if (box) box.hidden = Boolean(a.scale) && a.scale !== scale;
    }
  }

  // The slider for how firmly a vouch about real work holds a fixed bar only matters when
  // vouches are tied to work on the stars scale, so it shows only then, next to that switch.
  function applyAnchor() {
    const shown = state.settings.scale === 'stars' && state.settings.type === 'work';
    anchorBox.hidden = !shown;
    panel.classList.toggle('shows-anchor', shown);
  }

  // A new setting of the switches. A change of scale or feed changes the axis too, and on the
  // yes scale so does saying how the giver knows you (it decides whether yeses are weighted),
  // so the field is redrawn first; the dots then travel from where they are to the new run's end.
  function changeSettings(next, why) {
    if (why) setLine(explain, explainFor(why, next.scale));
    const redraw =
      next.scale !== state.settings.scale ||
      next.feed !== state.settings.feed ||
      (next.scale === 'yes' && weightedYeses(next) !== weightedYeses(state.settings));
    state.settings = next;
    syncControls();
    applyScale();
    applyAnchor();
    state.playing = false;
    startRun();
    if (redraw && geo) resize(true);
    settle();
  }

  // Scene 3 always starts from the worst rules and our assumptions.
  function resetRules() {
    const redraw = state.settings.scale !== WORST.scale || state.settings.feed !== WORST.feed;
    state.settings = { ...WORST };
    for (const { a, input, sync } of sliders) {
      state.values[a.id] = a.initial;
      input.value = String(a.initial);
      sync();
    }
    state.flipped = false;
    syncControls();
    applyScale();
    applyAnchor();
    if (redraw && geo) resize(true);
  }

  panel.querySelectorAll('.lab-seg input').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) changeSettings({ ...state.settings, [input.dataset.key]: input.value }, { key: input.dataset.key, value: input.value });
    });
  });

  panel.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = PRESETS.find((p) => p.id === button.dataset.preset).settings;
      changeSettings({ ...preset }, { preset: button.dataset.preset });
    });
  });

  // The big switch: every rating points at real work, or back to one tap.
  bigSwitch?.addEventListener('click', () => {
    const on = state.settings.type !== 'work';
    state.flipped = true;
    changeSettings({ ...state.settings, type: on ? 'work' : 'tap' }, { key: 'type', value: on ? 'work' : 'tap' });
  });

  $('[data-action="replay"]').addEventListener('click', () => {
    state.playing = false;
    startRun();
    if (reduced) finishNow();
    else {
      idle();
      startTimer = setTimeout(play, 260);
    }
  });

  const sliders = SLIDERS.map((a) => {
    const input = panel.querySelector(`[data-slider="${a.id}"] input`);
    const output = panel.querySelector(`[data-value="${a.id}"]`);
    const sync = () => {
      const text = a.format(Number(input.value));
      output.textContent = text;
      input.setAttribute('aria-valuetext', text);
    };
    // Each change shows its finished run at once, so a slider's effect is in view while the
    // thumb is still under the finger; dragging updates after a short pause.
    let timer = 0;
    const apply = () => {
      clearTimeout(timer);
      if (state.values[a.id] === Number(input.value)) return;
      state.values[a.id] = Number(input.value);
      setLine(explain, explainFor({ assumption: a.id }, state.settings.scale));
      state.playing = false;
      startRun();
      settle();
    };
    input.addEventListener('input', () => {
      sync();
      clearTimeout(timer);
      timer = setTimeout(apply, 150);
    });
    input.addEventListener('change', () => {
      sync();
      apply();
    });
    return { a, input, sync };
  });
  panel.querySelector('[data-action="reset"]').addEventListener('click', () => {
    let changed = false;
    for (const { a, input, sync } of sliders) {
      if (state.values[a.id] !== a.initial) changed = true;
      state.values[a.id] = a.initial;
      input.value = String(a.initial);
      sync();
    }
    if (changed) {
      setLine(explain, 'Back to our guesses.');
      startRun();
      settle();
    }
  });

  /* ---------- "Try other rules" ---------- */

  const tuning = () => html.classList.contains('is-tuning');
  const sceneText = scene.querySelector('.scene-text');
  let hideTimer = 0;
  // On a phone the chart moves down to start under the panel. It slides there on the page's
  // curve instead of jumping: measure, change, then play back the difference.
  function toggleTuning(on) {
    const before = root.getBoundingClientRect().top;
    html.classList.toggle('is-tuning', on);
    scene.classList.toggle('is-tuning', on);
    if (sceneText) sceneText.inert = on;
    const shift = before - root.getBoundingClientRect().top;
    if (Math.abs(shift) > 1 && !reduced && root.animate) {
      root.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], { duration: MOVE_MS, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
    resize(false, true);
  }
  function openRules() {
    if (tuning()) return;
    clearTimeout(hideTimer);
    panel.hidden = false;
    toggleTuning(true);
    openButton.setAttribute('aria-expanded', 'true');
    const S = state.settings;
    const preset = PRESETS.find((p) => sameAs(S, p.settings));
    setLine(explain, preset ? explainFor({ preset: preset.id }, S.scale) : explainFor({ key: 'type', value: S.type }, S.scale));
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('is-open')));
    panel.focus({ preventScroll: true });
  }
  function closeRules(returnFocus = true) {
    if (!tuning()) return;
    panel.classList.remove('is-open');
    toggleTuning(false);
    openButton.setAttribute('aria-expanded', 'false');
    hideTimer = setTimeout(() => {
      if (!tuning()) panel.hidden = true;
    }, MOVE_MS);
    updateNote();
    if (returnFocus) openButton.focus({ preventScroll: true });
  }
  openButton?.addEventListener('click', openRules);
  panel.querySelector('[data-action="close"]').addEventListener('click', () => closeRules());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && tuning()) {
      event.preventDefault();
      closeRules();
    }
  });
  document.addEventListener('lab:close-rules', () => closeRules(false));

  /* ---------- The stage ---------- */

  // Scene 3 plays the worst rules from round 0, each time it arrives. Scene 4 keeps whatever
  // scene 3 was showing; reached straight, it shows the worst rules' finished run, so the
  // switch has a before. Leaving the lab pauses it.
  function onScene({ index, previous }) {
    state.scene = index;
    if (index === 2 && previous !== 2) {
      closeRules(false);
      resetRules();
      setLine(labBody, bodyIntro);
      startRun();
      idle();
      if (reduced) finishNow();
      else startTimer = setTimeout(() => state.scene === 2 && play(), previous < 0 ? 450 : 650);
    } else if (index === 3 && previous !== 3) {
      if (previous !== 2) {
        closeRules(false);
        resetRules();
        startRun();
        finishNow();
      }
      updateNote();
    } else if (index < 2) {
      closeRules(false);
      pause();
    }
  }
  document.addEventListener('stage:scene', (event) => onScene(event.detail));

  reduceMotion.addEventListener('change', (event) => {
    reduced = event.matches;
    if (!reduced) return;
    if (state.playing) finishNow();
    else if (tweenStart >= 0) moveTo(to.slice(), false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(true);
    else if (state.resumeOnShow && (state.scene === 2 || state.scene === 3)) play();
  });

  // The field's size follows its scene: redraw in the same frame, so it never stretches.
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => resize(false, Boolean(geo))).observe(fieldWrap);
  }
  window.addEventListener('resize', () => resize());

  applyScale();
  applyAnchor();
  syncControls();
  resize(true);
  startRun();
  idle();
  root.classList.add('is-built');
  if (html.classList.contains('stage-ready') && html.dataset.scene !== undefined) {
    onScene({ index: Number(html.dataset.scene), previous: -1 });
  }
}

/* ---------- Text ---------- */

// On the yes scale, standing is a plain count of yeses unless a stranger's yes counts less
// (vouches say how the giver knows you) or the feed weights each yes by track record.
function weightedYeses(S) {
  return S.who === 'said' || S.feed === 'reputation';
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

function sliderHtml(a, extra = '') {
  const id = `lab-a-${a.id}`;
  return (
    `<div class="lab-slider${a === ANCHOR ? ' lab-anchor' : ''}" data-slider="${a.id}"><label for="${id}">${a.label}</label><div class="lab-slider-row">` +
    `<input type="range" id="${id}" min="${a.min}" max="${a.max}" step="${a.step}" value="${a.initial}" aria-valuetext="${a.format(a.initial)}">` +
    `<span class="lab-slider-value label" data-value="${a.id}" aria-hidden="true">${a.format(a.initial)}</span></div>${extra}</div>`
  );
}

// The chart: two big numbers, a one-line key, the field with the round under it, and the line
// on the last rule changed, which shows while "Try other rules" is open.
function labTemplate(N) {
  return `
    <div class="lab-head">
      <div class="lab-readout" data-readout="hits">
        <p class="lab-readout-label label">Best people found</p>
        <p class="lab-readout-value"><span class="lab-big" data-num="hits">0</span><span class="lab-of label">of 10</span></p>
      </div>
      <div class="lab-readout" data-readout="second">
        <p class="lab-readout-label label">Average score</p>
        <p class="lab-readout-value"><span class="lab-big" data-num="second"> </span><svg class="lab-spark" role="img" aria-label=""></svg></p>
      </div>
    </div>
    <p class="lab-legend label"><span class="lab-legend-item">${keyGlyph('is-dot is-filled')}The 10 most skilled</span> <span class="lab-legend-item">${keyGlyph('is-star')}<span class="lab-legend-star">The 10 you’d hire by score</span></span></p>
    <div class="lab-field-wrap"><svg class="lab-field" role="img" aria-label="A dot plot of ${N} people by score."></svg></div>
    <div class="lab-foot">
      <p class="lab-round label">Round 0 of 30</p>
      <button type="button" class="text-button label lab-replay" data-action="replay">Replay</button>
    </div>
    <p class="lab-explain line"></p>
    <div class="lab-live visually-hidden" aria-live="polite"></div>`;
}

// "Try other rules": presets, the five switches and our assumptions. Radio names are unique on
// the page because there is one lab.
function panelTemplate(start) {
  const fieldset = (s) =>
    `<fieldset class="lab-switch"><legend class="label">${s.legend}</legend><div class="lab-seg">` +
    s.options
      .map(
        ([value, text]) =>
          `<label><input type="radio" name="lab-${s.key}" data-key="${s.key}" value="${value}"${start[s.key] === value ? ' checked' : ''}><span>${text}</span></label>`,
      )
      .join('') +
    `</div></fieldset>`;
  const [scale, type, ...rest] = SWITCHES;
  const switches =
    fieldset(scale) +
    `<div class="lab-switch-group">${fieldset(type)}${sliderHtml(ANCHOR, '<p class="lab-anchor-note">This is our assumption. Lower it, leave the other switches where they started, and the scores drift up again.</p>')}</div>` +
    rest.map(fieldset).join('');
  const presets = PRESETS.map(
    (p) => `<button class="btn btn-quiet lab-preset" type="button" data-preset="${p.id}" aria-pressed="false">${p.label}</button>`,
  ).join('');
  return `
    <div class="lab-panel-head">
      <p class="label lab-panel-title" id="lab-panel-title">Try other rules</p>
      <button type="button" class="text-button label lab-panel-close" data-action="close">Close</button>
    </div>
    <div class="lab-panel-body">
      <p class="lab-panel-lede">The result rests on our guesses about how people judge real work. Change the rules, or the guesses, and the chart answers at once.</p>
      <fieldset class="lab-switch lab-presets"><legend class="label">Start from</legend><div class="lab-preset-row">${presets}</div></fieldset>
      <div class="lab-switches">${switches}</div>
      <div class="lab-drawer-body">
        <p class="lab-drawer-title label">Our assumptions</p>
        ${ASSUMPTIONS.map((a) => sliderHtml(a)).join('')}
        <p class="lab-note">These are our guesses at how big each effect is. The research shows which way each one pushes. Push them to the ends and some results flip.</p>
        <button class="btn btn-quiet" type="button" data-action="reset">Reset assumptions</button>
      </div>
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
  if (node && node.textContent !== text) node.textContent = text;
}
