// The trust lab: 80 coworkers vouching for each other, drawn as a dot plot that moves round by
// round. The model lives in lab-model.js; this file draws it and wires up its controls.
//
// Scenes 4 and 5 share this one lab. Scene 4 plays the worst rules from round 0. Scene 5 asks
// which rules find the best people: a bar for each set of rules, with its average over a dozen
// simulated companies, and a tap on a bar runs those rules on this company, with one plain line
// on what they find and what they cost. "Try other rules" opens a frosted panel over the scene's
// text, beside the chart on desktop and above it on a phone, so the chart stays in full view
// while its switches change.
import { createWorld, createRun, DEFAULTS, WORST, COSIGN, TOP_N, HIGH_BAR } from './lab-model.js';
import { STAR_PATH } from './stars.js';
import { MOVE_MS, ease, animate, reduceMotion, setLine } from './motion.js';

const NS = 'http://www.w3.org/2000/svg';
const ROUND_MS = 280; // time between rounds while playing
const QUICK_ROUND_MS = 110; // a run started from scene 5's bars, so comparing rules stays quick
// On the stars scale dots stack in score columns 0.05 wide, or 0.1 wide when the field is
// too narrow for 0.05 columns to sit side by side without piling into each other. Both
// widths put column edges on 4.8 and 5, so the 4.8+ band stays exact.
const COLUMNS_PER_STAR = [20, 10, 5];
const LANE_COLUMNS = 4; // the lane for people with nothing to count stacks them four across
const WIDE_FIELD = 520; // field width in pixels from which dots get bigger
const MIN_FIELD_H = 96;
// Yes-scale axis ends. On a plain count of yeses each divides by 4, so the quarter ticks are
// whole numbers. Weighted yeses sit on a square-root axis, whose even ticks fall at 1, 4 and 9
// sixteenths of the end, so each of those ends divides by 16.
const YES_AXIS = [4, 8, 12, 16, 20, 24, 32, 40, 60, 80, 100, 120, 160, 200, 240, 300, 400, 600, 800, 1000, 1200, 1600, 2000, 2400, 3000, 4000];
const ROOT_AXIS = [16, 32, 48, 64, 80, 96, 128, 160, 192, 240, 320, 400, 480, 640, 800, 960, 1280, 1600, 1920, 2400, 3200, 4000];
// Scene 5 opens on the rules its headline names: praise tied to real work.
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
    reputation: () => 'Now a vouch counts by who gave it: a yes from someone with a good record weighs more.',
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
  const openButton = document.getElementById('rules-open');
  const labBody = document.getElementById('lab-body');
  const bodyIntro = labBody ? labBody.textContent.trim() : '';
  const rulesBox = document.getElementById('rules');

  const world = createWorld(Number(root.dataset.seed) || 374);
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
  const resultLine = $('.lab-result');

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
    scene: null, // the stage's current scene, by id
    resumeOnShow: false,
    pace: ROUND_MS,
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
    state.axisMax = rootAxis(state.settings) ? ROOT_AXIS[0] : YES_AXIS[0];
  }

  function play(pace = ROUND_MS) {
    clearTimeout(startTimer);
    state.resumeOnShow = false;
    if (reduced) {
      finishNow();
      return;
    }
    if (state.run.done) startRun();
    state.playing = true;
    state.pace = pace;
    svg.setAttribute('aria-label', `A dot plot of 80 people ${placedBy()}, changing round by round.`);
    const now = performance.now();
    advance(now);
    nextRoundAt = now + pace;
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
    if (state.scene === 'lab') foldHowSoon();
    narrate(m);
    describeRules(m);
    const second = S.scale === 'stars' ? ` The average score is ${m.mean.toFixed(2)}.` : ` People said yes ${percent(m.yesRate)} of the time.`;
    announce(`After ${state.run.rounds} rounds, the gold stars found ${m.hits} of the 10 best.${second}`);
  }

  // Scene 4's line once the worst rules have played out.
  function narrate(m) {
    const plain = assumptionsUntouched();
    if (plain && sameAs(state.settings, WORST) && m.hits !== null) {
      setLine(
        labBody,
        m.top48 >= 20
          ? `Everyone drifted toward 5, and the stars found only ${m.hits} of the 10 best.`
          : `The stars found ${m.hits} of the 10 best.`,
      );
    }
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

    // The yes axis grows to a round number at the 95th percentile of standings, and never
    // shrinks mid-run.
    if (S.scale === 'yes') {
      state.axisMax = axisEnd(snap, state.axisMax, rootAxis(S) ? ROOT_AXIS : YES_AXIS);
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
    const scale = state.settings.scale;
    const laneLeft = 1;
    const laneRight = laneLeft + LANE_COLUMNS * step + 3;
    // On the yes scale the lane for people with no yes sits well clear of the axis's 0, so the
    // lane never reads as a pile at 0.
    const x1 = laneRight + r + (scale === 'yes' ? 24 : 10);
    const x5 = width - r - 6;
    const span = x5 - x1;
    const perStar = span / 4;
    const axisMax = state.axisMax;
    // Weighted yeses compound, so a few people run far ahead while most sit near 0. Spacing
    // their axis by square root spreads out the crowd near 0 and keeps everyone's order. Anyone
    // past the end waits at the end.
    const root = rootAxis(state.settings);
    const share = (v) => Math.min(1, Math.max(0, v / axisMax));
    const yesX = root ? (v) => x1 + Math.sqrt(share(v)) * span : (v) => x1 + share(v) * span;
    return {
      width, height, r, step, plotTop, base, laneLeft, laneRight, x1, x5, span, scale, axisMax, root,
      columns: COLUMNS_PER_STAR.find((n) => perStar / n >= 0.6 * step) ?? COLUMNS_PER_STAR[COLUMNS_PER_STAR.length - 1],
      bins: Math.max(1, Math.floor(span / step)), // yes scale: columns as wide as a dot
      bottom: base - r - 1.5, // center of the lowest dot in a stack
      highest: plotTop + r + 3, // center of the highest dot a stack may reach
      starSize: Math.round(r * 2.8),
      x: scale === 'yes' ? yesX : (s) => x1 + (s - 1) * perStar,
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
      // Even ticks: on the square-root axis they read 0, 1, 4, 9 and 16 sixteenths of the end.
      // The end reads "or more", since anyone past it waits there.
      for (let k = 0; k <= 4; k++) {
        const value = G.axisMax * (G.root ? (k / 4) ** 2 : k / 4);
        body += tick(G.x1 + (G.span * k) / 4, k === 4 ? `${value}+` : value, k === 4);
      }
    }
    // The lane and the axis each stand on their own stretch of baseline, with a gap between.
    const baseY = G.base + 0.5;
    body +=
      `<line class="lab-lane-rule" x1="${G.laneRight + 0.5}" x2="${G.laneRight + 0.5}" y1="${G.plotTop}" y2="${G.base}"/>` +
      `<text class="lab-label" x="0" y="${labelY}">${G.scale === 'yes' ? 'No yeses' : 'No vouches'}</text>` +
      `<line class="lab-axis" x1="0" x2="${G.laneRight - 3}" y1="${baseY}" y2="${baseY}"/>` +
      `<line class="lab-axis" x1="${(G.x1 - G.r - 3).toFixed(1)}" x2="${G.width}" y1="${baseY}" y2="${baseY}"/>`;
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
    if (!Number.isFinite(cur[2 * i]) || !Number.isFinite(cur[2 * i + 1])) {
      cur[2 * i] = to[2 * i];
      cur[2 * i + 1] = to[2 * i + 1];
    }
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
      nextRoundAt = now + state.pace;
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

  // A set of rules with our assumptions, as a new run at round 0: the worst rules for scene 4,
  // a bar's rules in scene 5. The bars are our assumptions' averages, so a bar runs with them.
  function useRules(settings) {
    for (const { a, input, sync } of sliders) {
      state.values[a.id] = a.initial;
      input.value = String(a.initial);
      sync();
    }
    const next = { ...settings };
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
    redrawSoon();
  }
  // The whole field again, axis, lane and every person, once the panel has settled: a browser
  // that skipped a repaint beside the panel's frosted glass gets a fresh one.
  let redrawTimer = 0;
  function redrawSoon() {
    clearTimeout(redrawTimer);
    requestAnimationFrame(() => requestAnimationFrame(() => redrawAll()));
    redrawTimer = setTimeout(redrawAll, MOVE_MS + 60);
  }
  function redrawAll() {
    resize(true, false);
    for (let i = 0; i < N; i++) place(i);
  }
  // The panel opens from the scene's links and from the line under the bars; focus goes back
  // to whichever button opened it.
  const openers = () => [openButton, ...(rulesBox ? rulesBox.querySelectorAll('[data-action="open-rules"]') : [])].filter(Boolean);
  let opener = openButton;
  function openRules(from = openButton) {
    if (tuning()) return;
    opener = from || openButton;
    document.dispatchEvent(new CustomEvent('stage:close-why'));
    clearTimeout(hideTimer);
    panel.hidden = false;
    toggleTuning(true);
    for (const button of openers()) button.setAttribute('aria-expanded', 'true');
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
    for (const button of openers()) button.setAttribute('aria-expanded', 'false');
    hideTimer = setTimeout(() => {
      if (!tuning()) panel.hidden = true;
    }, MOVE_MS);
    if (returnFocus) (opener && opener.isConnected ? opener : openButton)?.focus({ preventScroll: true });
  }
  openButton?.addEventListener('click', () => openRules(openButton));
  panel.querySelector('[data-action="close"]').addEventListener('click', () => closeRules());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && tuning()) {
      event.preventDefault();
      closeRules();
    }
  });
  document.addEventListener('lab:close-rules', () => closeRules(false));

  /* ---------- Which rules find the best people? ---------- */

  // One bar for each set of rules, with its average over the dozen simulated companies from
  // data/figures.json (tools/lab-check.mjs keeps those equal to the model's). "Stars" or "A named
  // yes" picks which bars show. A tap on a bar runs its rules on this company at a quick pace, and
  // the line under the chart says what they find and what they cost. Once the run has finished,
  // the line adds this run's own number when it differs from the average, so the line never
  // gets ahead of the counter.
  const rules = { list: [], scale: 'stars', selected: null, chance: 1.25 };
  const figuresData =
    (window.chartData && window.chartData.figures) ||
    fetch(new URL('../data/figures.json', import.meta.url)).then((res) => {
      if (!res.ok) throw new Error(`data/figures.json returned HTTP ${res.status}`);
      return res.json();
    });

  const ruleFor = (id) => rules.list.find((r) => r.id === id);
  // The rules on screen, when they are one of the bars with our assumptions.
  const matchingRule = () => (assumptionsUntouched() ? rules.list.find((r) => sameAs(state.settings, r.settings)) : null);

  // m: the finished run's measures, or null while it is still running.
  function ruleLine(r, m) {
    const about = Math.round(r.hits);
    const here = m && m.hits !== null ? m.hits : about;
    const cost = r.cost.replace('{n}', String(Math.round(r.costValue ?? 0)));
    return `In the simulation, ${r.finds} about ${about} of the 10 best${here !== about ? `, ${here} in this run` : ''}. The cost: ${cost}.`;
  }

  // The line under the chart and the pressed bar, for whatever rules the lab is running.
  function describeRules(m = state.run && state.run.done ? state.snap.metrics : null) {
    if (!rules.list.length || !resultLine) return;
    const r = matchingRule();
    rules.selected = r ? r.id : null;
    if (r && r.scale !== rules.scale) {
      rules.scale = r.scale;
      renderBars();
    }
    markRules();
    if (r) setLine(resultLine, ruleLine(r, m));
    else if (m) setLine(resultLine, `In the simulation, your rules find ${m.hits} of the 10 best in this run.`);
  }

  function markRules() {
    for (const bar of rulesBox.querySelectorAll('[data-rule]')) bar.setAttribute('aria-pressed', String(bar.dataset.rule === rules.selected));
    for (const pill of rulesBox.querySelectorAll('[data-scale]')) pill.setAttribute('aria-pressed', String(pill.dataset.scale === rules.scale));
  }

  function renderBars(grow = false) {
    const list = rulesBox.querySelector('.rules-bars');
    const shownRules = rules.list.filter((r) => r.scale === rules.scale).sort((a, b) => b.hits - a.hits);
    list.innerHTML = shownRules
      .map(
        (r) =>
          `<li><button type="button" class="rules-bar" data-rule="${r.id}" aria-pressed="false">` +
          `<span class="rules-name">${r.label}</span>` +
          `<span class="rules-track" aria-hidden="true"><span class="rules-fill" style="--v:${(r.hits / 10).toFixed(3)}"></span></span>` +
          `<span class="rules-value">${r.hits.toFixed(1)}<span class="visually-hidden"> of the 10 best on average</span></span>` +
          `</button></li>`,
      )
      .join('');
    if (grow && !reduced) {
      list.classList.add('is-pending');
      requestAnimationFrame(() => requestAnimationFrame(() => list.classList.remove('is-pending')));
    }
    markRules();
  }

  function runRule(id) {
    const r = ruleFor(id);
    if (!r) return;
    useRules(r.settings);
    describeRules();
    if (reduced) finishNow();
    else play(QUICK_ROUND_MS);
  }

  function buildRules(data) {
    if (!rulesBox || !data || !data.rules) return;
    rules.list = data.rules.settings;
    rules.chance = data.rules.chance;
    rulesBox.querySelector('.fallback')?.remove();
    rulesBox.insertAdjacentHTML(
      'beforeend',
      `<div class="rules-head">` +
        `<p class="label rules-title" id="rules-title">Which rules find the best people? In our simulation.</p>` +
        `<div class="rules-pills" role="group" aria-label="Show the rules for">` +
        `<button type="button" class="rules-pill" data-scale="stars" aria-pressed="true">Stars</button>` +
        `<button type="button" class="rules-pill" data-scale="yes" aria-pressed="false">A named yes</button>` +
        `</div></div>` +
        `<div class="rules-chart" style="--guess:${(rules.chance / 10).toFixed(4)}">` +
        `<p class="rules-guess label" aria-hidden="true"><span>Guessing</span></p>` +
        `<ol class="rules-bars" role="list"></ol>` +
        `</div>` +
        // The bars are the model's output, not a measurement of any real product.
        `<p class="rules-caveat">These are simulated, not measured. The direction of each effect comes from research; the sizes are our guesses. Change them under <button type="button" class="text-button" data-action="open-rules" aria-controls="lab-panel" aria-expanded="false">Try other rules</button>.</p>` +
        `<p class="label rules-note">Of the 10 most skilled, how many the top 10 finds, on average across 12 simulated companies. Guessing finds about 1.</p>`,
    );
    rulesBox.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const bar = target && target.closest('[data-rule]');
      const pill = target && target.closest('[data-scale]');
      const open = target && target.closest('[data-action="open-rules"]');
      if (open) openRules(open);
      else if (bar) runRule(bar.dataset.rule);
      else if (pill && pill.dataset.scale !== rules.scale) {
        rules.scale = pill.dataset.scale;
        renderBars(true);
      }
    });
    renderBars();
    describeRules();
    placeRules();
  }
  figuresData.then(buildRules).catch((err) => console.warn('Scene 5 kept its fallback because the rules chart could not be built.', err));

  // Beside the lab on desktop, in the text column; on a phone, under the lab, which stays pinned
  // at the top of its scene while the bars scroll, so a tapped bar and its result are in view.
  const wide = window.matchMedia('(min-width: 960px)');
  const fixBeat = document.querySelector('.beat[data-beat="fix"]');
  const visual = scene.querySelector('.scene-visual');
  function placeRules() {
    if (!rulesBox || !fixBeat || !visual) return;
    const beside = wide.matches || !html.classList.contains('stage-on');
    if (beside && rulesBox.parentElement !== fixBeat) fixBeat.insertBefore(rulesBox, fixBeat.querySelector('.beat-links'));
    if (!beside && rulesBox.parentElement !== visual) visual.append(rulesBox);
  }
  wide.addEventListener('change', placeRules);

  /* ---------- How this works ---------- */

  // Three plain steps above the lab. Beside the text they stay open. On a phone, while they are
  // open they stand in for scene 4's intro and the key (lab.css), and they fold to one line once
  // scene 4's first run has played, never before the reader has had about six seconds with them.
  // The intro line then carries the run's result. A phone too short for the steps and a readable
  // chart starts with them folded. The title opens and closes them, and a reader who has used it
  // keeps their choice.
  const how = document.getElementById('lab-how');
  const howTitle = how && how.querySelector('.lab-how-title');
  const howBody = how && how.querySelector('.lab-how-body');
  let howToggle = null;
  let howTouched = false;
  let howFolded = false;
  let howShownAt = 0;
  let howTimer = 0;
  function setHow(open) {
    if (!how) return;
    clearTimeout(howTimer);
    howTimer = 0;
    how.classList.toggle('is-closed', !open);
    scene.classList.toggle('is-how-open', open);
    if (howToggle) howToggle.setAttribute('aria-expanded', String(open));
    if (howBody) howBody.inert = !open;
  }
  if (howTitle) {
    howTitle.innerHTML = '<button type="button" class="lab-how-toggle" aria-expanded="true" aria-controls="lab-how-body">How this works</button>';
    howToggle = howTitle.firstElementChild;
    howToggle.addEventListener('click', () => {
      howTouched = true;
      setHow(how.classList.contains('is-closed'));
    });
  }
  if (how && !wide.matches && window.innerHeight < 600) {
    howFolded = true;
    setHow(false);
  } else setHow(true);
  function foldHowSoon() {
    if (!how || howFolded || howTouched || wide.matches) return;
    howFolded = true;
    const wait = Math.max(1200, 6000 - (performance.now() - howShownAt));
    howTimer = setTimeout(() => setHow(false), wait);
  }

  /* ---------- The stage ---------- */

  // Scene 4 plays the worst rules from round 0, each time it arrives. Scene 5 opens on the rules
  // its headline names, praise tied to real work: the dots travel from wherever they were to
  // that run's end as the scene lands, and its bar is the one pressed. Leaving the lab pauses it.
  function onScene({ id, previousId }) {
    state.scene = id;
    if (id === 'lab' && !howShownAt) howShownAt = performance.now();
    // A fold still waiting when the reader moves on happens at once, out of view.
    if (id !== 'lab' && howTimer) setHow(false);
    if (id === 'lab' && previousId !== 'lab') {
      closeRules(false);
      useRules(WORST);
      setLine(labBody, bodyIntro);
      idle();
      if (reduced) finishNow();
      else startTimer = setTimeout(() => state.scene === 'lab' && play(), previousId ? 650 : 450);
    } else if (id === 'fix' && previousId !== 'fix') {
      closeRules(false);
      useRules(WORK);
      settle();
    } else if (id !== 'lab' && id !== 'fix') {
      closeRules(false);
      pause();
    }
  }
  document.addEventListener('stage:scene', (event) => {
    onScene(event.detail);
    placeRules();
  });

  reduceMotion.addEventListener('change', (event) => {
    reduced = event.matches;
    if (!reduced) return;
    if (state.playing) finishNow();
    else if (tweenStart >= 0) moveTo(to.slice(), false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause(true);
    else if (state.resumeOnShow && (state.scene === 'lab' || state.scene === 'fix')) play();
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
    onScene({ id: ['start', 'everywhere', 'guess', 'lab', 'fix', 'cosign'][Number(html.dataset.scene)], previousId: null });
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
    <p class="lab-result line"></p>
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

// Weighted yeses get the square-root axis; a plain count of yeses a straight one.
function rootAxis(S) {
  return S.scale === 'yes' && weightedYeses(S);
}

// The axis end for the yes scale: the first round number at or above the 95th percentile of
// standings, so the crowd fills the field and the few past it wait at its end. It never drops
// below the current end, so the axis only grows during a run.
function axisEnd(snap, current, ends) {
  const standings = snap.scores.filter((s) => s !== null).sort((a, b) => a - b);
  if (!standings.length) return current;
  const p95 = standings[Math.ceil(standings.length * 0.95) - 1];
  const last = ends[ends.length - 1];
  const nice = ends.find((v) => v >= p95) ?? Math.ceil(p95 / last) * last;
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
