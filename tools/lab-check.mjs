// Checks the trust lab model in js/lab-model.js.
// Run from the repo root: node tools/lab-check.mjs
//
// 1. The table: final measures averaged over 12 worlds (run seed 1) for the
//    worst setting, each single switch flipped, and the best setting, next to
//    the prototype the model was ported from.
// 2. The same table with the prototype's tie-breaking, which drew from the
//    simulation's own random stream. It must match the prototype exactly,
//    which shows the port keeps the same rules and numbers.
// 3. Run-to-run noise: the same averages over run seeds 1 to 10, to show how
//    far a single run seed can move a 12-world average.
// 4. Determinism and parameter checks.
import { createWorld, createRun, DEFAULTS, WORST, BEST } from '../js/lab-model.js';

const WORLDS = [11, 22, 33, 44, 55, 66, 77, 88, 99, 111, 122, 133];
const ROWS = [
  ['Worst: one tap, visible, anyone, ranked feed', WORST],
  ['Only switch flipped: tied to work', { ...WORST, type: 'work' }],
  ['Only switch flipped: written', { ...WORST, type: 'written' }],
  ['Only switch flipped: blind', { ...WORST, vis: 'blind' }],
  ['Only switch flipped: worked with you', { ...WORST, who: 'worked' }],
  ['Only switch flipped: plain feed', { ...WORST, feed: 'plain' }],
  ['Best: tied to work, blind, worked with you, plain', BEST],
];
// The prototype's output for the same rows: mean, top48, unrated, hits.
const PROTOTYPE = [
  [4.74, 48, 10.5, 2.2],
  [3.54, 5, 16.4, 6.7],
  [4.4, 29, 15.8, 2.3],
  [4.71, 45, 10.5, 2.6],
  [4.78, 51, 5.9, 2.8],
  [4.75, 45, 0, 2.8],
  [3.18, 4, 0, 8.3],
];
const TOLERANCE = [0.05, 2, 1, 1];
const KEYS = ['mean', 'top48', 'unrated', 'hits'];
const DIGITS = [2, 0, 1, 1];

let failures = 0;
const fail = (message) => {
  failures++;
  console.log('FAIL ' + message);
};

function finalMetrics(worldSeed, settings, runSeed, overrides = {}, options = {}) {
  const run = createRun(createWorld(worldSeed), settings, runSeed, overrides, options);
  while (!run.done) run.step();
  return run.snapshot().metrics;
}

// Averages over the 12 worlds, summed the way the prototype summed them (each
// run's mean rounded to two decimals, each value divided by 12 as it is
// added), so that averages sitting on a rounding boundary print the same.
function average(settings, runSeed, options) {
  const sum = [0, 0, 0, 0];
  for (const w of WORLDS) {
    const m = finalMetrics(w, settings, runSeed, {}, options);
    KEYS.forEach((k, i) => (sum[i] += (k === 'mean' ? +m.mean.toFixed(2) : m[k]) / WORLDS.length));
  }
  return sum;
}

const fmt = (values) => values.map((v, i) => v.toFixed(DIGITS[i]).padStart(i === 0 ? 5 : 5)).join(' ');
const header = 'setting'.padEnd(50) + '  mean top48 unrtd  hits';

console.log('1. Final measures, 12 worlds, run seed 1 (the model as the page runs it)\n');
console.log(header + '   | prototype               | outside tolerance');
ROWS.forEach(([label, settings], r) => {
  const got = average(settings, 1);
  const off = KEYS.filter((_, i) => Math.abs(got[i] - PROTOTYPE[r][i]) > TOLERANCE[i] + 1e-9);
  console.log(label.padEnd(50) + '  ' + fmt(got) + '   | ' + fmt(PROTOTYPE[r]) + '   | ' + (off.join(', ') || 'none'));
});

console.log('\n2. Same table with the prototype\'s tie-breaking (must match the prototype exactly)\n');
console.log(header);
ROWS.forEach(([label, settings], r) => {
  const got = average(settings, 1, { prototypeTieBreak: true });
  const shown = fmt(got);
  console.log(label.padEnd(50) + '  ' + shown + (shown === fmt(PROTOTYPE[r]) ? '   matches' : '   DIFFERS'));
  if (shown !== fmt(PROTOTYPE[r])) fail(`prototype tie-break row "${label}" differs from the prototype`);
});

console.log('\n3. Run-to-run noise: 12-world averages for run seeds 1 to 10, as mean [lowest to highest]\n');
console.log('setting'.padEnd(50) + '  ' + ['mean', 'top48', 'unrated', 'hits'].map((h) => h.padEnd(22)).join(''));
for (const [label, settings] of ROWS) {
  const runs = Array.from({ length: 10 }, (_, i) => average(settings, i + 1));
  const cells = KEYS.map((_, k) => {
    const v = runs.map((row) => row[k]);
    const d = DIGITS[k] === 0 ? 1 : DIGITS[k];
    return `${(v.reduce((a, b) => a + b) / v.length).toFixed(d)} [${Math.min(...v).toFixed(d)} to ${Math.max(...v).toFixed(d)}]`.padEnd(22);
  });
  console.log(label.padEnd(50) + '  ' + cells.join(''));
}

console.log('\n4. Determinism and parameters\n');
{
  const a = JSON.stringify(stepAll(createRun(createWorld(11), WORST, 1)));
  const b = JSON.stringify(stepAll(createRun(createWorld(11), WORST, 1)));
  const c = JSON.stringify(stepAll(createRun(createWorld(11), WORST, 2)));
  if (a !== b) fail('the same seeds and settings gave different runs');
  else console.log('ok   same world seed, settings and run seed give identical snapshots for all 30 rounds');
  if (a === c) fail('a different run seed gave an identical run');
  else console.log('ok   a different run seed gives a different run');

  // Taking snapshots, or not, must not change the simulation.
  const quiet = createRun(createWorld(11), WORST, 1);
  while (!quiet.done) quiet.step();
  const noisy = createRun(createWorld(11), WORST, 1);
  while (!noisy.done) {
    noisy.snapshot();
    noisy.step();
    noisy.snapshot();
  }
  if (JSON.stringify(quiet.snapshot()) !== JSON.stringify(noisy.snapshot())) fail('snapshot calls changed the run');
  else console.log('ok   reading snapshots never changes the run');

  const base = finalMetrics(11, WORST, 1);
  const flat = finalMetrics(11, WORST, 1, { push: { visible: 0 }, autoFive: { tap: 0 } });
  if (!(flat.mean < base.mean)) fail('removing the push and the reflexive fives did not lower the average');
  else console.log(`ok   overrides apply: no push and no reflexive fives lowers the worst setting's average from ${base.mean.toFixed(2)} to ${flat.mean.toFixed(2)}`);
  const merged = createRun(createWorld(11), WORST, 1, { push: { visible: 0.2 } }).params;
  if (merged.push.visible !== 0.2 || merged.push.blind !== DEFAULTS.push.blind) fail('overrides did not deep-merge');
  else console.log('ok   overrides deep-merge: push.visible changes and push.blind keeps its default');
  let threw = false;
  try {
    createRun(createWorld(11), WORST, 1, { pushh: 1 });
  } catch {
    threw = true;
  }
  if (!threw) fail('an unknown parameter was accepted');
  else console.log('ok   an unknown parameter name is rejected');

  const zero = createRun(createWorld(11), WORST, 1).snapshot();
  if (zero.round !== 0 || zero.metrics.unrated !== 80 || zero.metrics.mean !== null) fail('round 0 is not empty');
  else console.log('ok   round 0 has no scores: 80 unrated, no average');
}

console.log('\n5. The world the page shows (seed 11, run seed 1)\n');
for (const [label, settings] of ROWS) {
  const m = finalMetrics(11, settings, 1);
  console.log(label.padEnd(50) + `  average ${m.mean.toFixed(2)}, ${String(m.top48).padStart(2)} at 4.8+, ${String(m.unrated).padStart(2)} unrated, top 10 holds ${m.hits} of the 10 most skilled`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;

function stepAll(run) {
  const out = [run.snapshot()];
  while (!run.done) out.push(run.step());
  return out;
}
