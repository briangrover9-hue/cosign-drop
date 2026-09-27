// Checks the trust lab model in js/lab-model.js.
// Run from the repo root: node tools/lab-check.mjs
//
// 1. The table: measures averaged over 12 worlds (run seed 1) for the worst
//    setting, each single switch flipped from it, the best setting, a
//    LinkedIn-like yes setting, and the Cosign-like settings, next to the
//    prototype the model was ported from.
// 2. The same rows for the world the page shows (seed 374).
// 3. Assertions, which fail loudly: determinism, snapshots that never change
//    a run, overrides, and the directions the page relies on.
import { readFileSync } from 'node:fs';
import { createWorld, createRun, DEFAULTS, WORST, BEST, COSIGN } from '../js/lab-model.js';

const WORLDS = [11, 22, 33, 44, 55, 66, 77, 88, 99, 111, 122, 133];
const PAGE_WORLD = Number(process.env.PAGE_WORLD) || 374; // the world the lab shows (#lab-root, scenes 4 and 5): of worlds 1 to 600 whose first run keeps every result the text describes, one where each of the eight settings in scene 5's bars lands within one of its average, with the jump from one-click likes to work closest to the average jump
const LINKEDIN = Object.freeze({ scale: 'yes', type: 'tap', vis: 'visible', who: 'anyone', feed: 'count' });
const COSIGN_COUNT = Object.freeze({ ...COSIGN, feed: 'count' });

// Prototype averages for the same rows: round-1 and final average, then 4.8+
// (stars) or the final yes rate (yes), unrated, hits. The prototype averaged
// yes standings over people with at least one yes, so its yes averages are
// left out. Its reputation feed on the stars scale had a bug, fixed in the
// port; that row shows the prototype with the same fix. The prototype also let
// a ranked feed sway vouches tied to work less than other vouches (0.3 against
// 0.5); the port sways every vouch the same, so its tied-to-work row finds fewer.
const ROWS = [
  ['Worst: stars, one tap, visible, anyone, count', WORST, [3.48, 4.44, 24, 0, 4.4]],
  ['Only switch flipped: tied to work', { ...WORST, type: 'work' }, [3.19, 3.24, 2, 0, 7.2]],
  ['Only switch flipped: written', { ...WORST, type: 'written' }, [3.27, 3.72, 5, 0, 4.8]],
  ['Only switch flipped: blind', { ...WORST, vis: 'blind' }, [3.42, 4.17, 16, 0, 4.8]],
  ['Only switch flipped: says how they know you', { ...WORST, who: 'said' }, [3.48, 4.46, 27, 0, 5.0]],
  ['Only switch flipped: plain feed', { ...WORST, feed: 'plain' }, [3.48, 4.42, 19, 0, 5.2]],
  ['Only switch flipped: reputation feed', { ...WORST, feed: 'reputation' }, [3.46, 4.41, 31, 0, 4.4]],
  ['Best: stars, tied to work, blind, said, plain', BEST, [3.18, 3.18, 4, 0, 8.4]],
  ['LinkedIn-like: yes, one tap, visible, anyone, count', LINKEDIN, [null, null, 0.78, 0, 2.5]],
  ['Cosign-like, feed ranked by count', COSIGN_COUNT, [null, null, 0.64, 21.4, 3.7]],
  ['Cosign-like, feed ranked by reputation', COSIGN, [null, null, 0.64, 20.2, 5.9]],
  ['Cosign-like, feed that ranks no one', { ...COSIGN, feed: 'plain' }, [null, null, null, null, null]],
];

let failures = 0;
function check(ok, message) {
  if (!ok) failures++;
  console.log((ok ? 'ok   ' : 'FAIL ') + message);
}

function runAll(worldSeed, settings, runSeed = 1, overrides = {}) {
  const run = createRun(createWorld(worldSeed), settings, runSeed, overrides);
  const snaps = [run.snapshot()];
  while (!run.done) snaps.push(run.step());
  return snaps;
}

// Round-1 average, final average, 4.8+ or final yes rate, unrated, hits,
// averaged over the given worlds.
function summarize(worlds, settings, overrides = {}) {
  const yes = settings.scale === 'yes';
  const key = yes ? 'yesCount' : 'mean';
  const sum = [0, 0, 0, 0, 0];
  for (const w of worlds) {
    const snaps = runAll(w, settings, 1, overrides);
    const first = snaps[1].metrics;
    const last = snaps[snaps.length - 1].metrics;
    [first[key], last[key], yes ? last.yesRate : last.top48, last.unrated, last.hits].forEach((v, i) => (sum[i] += v / worlds.length));
  }
  return sum;
}

function cells(values, yes) {
  const digits = [2, 2, yes ? 2 : 0, 1, 1];
  return values.map((v, i) => (v === null ? '.' : v.toFixed(digits[i])).padStart(i === 2 ? 7 : 6)).join(' ');
}

const header = 'setting'.padEnd(52) + '  r1 avg  final 4.8+/yes unrtd   hits';

console.log('1. Averages over 12 worlds, run seed 1. For yes rows the averages are yeses received per person, unweighted, and the third column is the yes rate.\n');
console.log(header + '   | prototype');
const averages = new Map();
for (const [label, settings, proto] of ROWS) {
  const yes = settings.scale === 'yes';
  const got = summarize(WORLDS, settings);
  averages.set(label, got);
  console.log(label.padEnd(52) + ' ' + cells(got, yes) + '   | ' + cells(proto, yes));
}

console.log(`\n2. The world the page shows first (seed ${PAGE_WORLD}, run seed 1)\n`);
console.log(header);
const pageRows = new Map();
for (const [label, settings] of ROWS) {
  const got = summarize([PAGE_WORLD], settings);
  pageRows.set(label, got);
  console.log(label.padEnd(52) + ' ' + cells(got, settings.scale === 'yes'));
}

console.log('\n3. Checks\n');
{
  for (const settings of [WORST, COSIGN, BEST]) {
    const name = settings === WORST ? 'WORST' : settings === COSIGN ? 'COSIGN' : 'BEST';
    const a = JSON.stringify(runAll(PAGE_WORLD, settings, 1));
    const b = JSON.stringify(runAll(PAGE_WORLD, settings, 1));
    check(a === b, `${name}: the same world seed, settings and run seed give identical snapshots for all 30 rounds`);
    check(a !== JSON.stringify(runAll(PAGE_WORLD, settings, 2)), `${name}: a different run seed gives a different run`);
  }

  for (const settings of [WORST, COSIGN]) {
    const quiet = createRun(createWorld(PAGE_WORLD), settings, 1);
    while (!quiet.done) quiet.step();
    const noisy = createRun(createWorld(PAGE_WORLD), settings, 1);
    while (!noisy.done) {
      noisy.snapshot();
      noisy.step();
      noisy.snapshot();
    }
    check(JSON.stringify(quiet.snapshot()) === JSON.stringify(noisy.snapshot()), `${settings.scale} scale: reading snapshots never changes the run`);
  }

  const merged = createRun(createWorld(PAGE_WORLD), WORST, 1, { push: { visible: 0.2 } }).params;
  check(merged.push.visible === 0.2 && merged.push.blind === DEFAULTS.push.blind, 'overrides deep-merge: push.visible changes and push.blind keeps its default');
  const throws = (fn) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  check(throws(() => createRun(createWorld(PAGE_WORLD), WORST, 1, { pushh: 1 })), 'an unknown parameter name is rejected');
  check(throws(() => createRun(createWorld(PAGE_WORLD), WORST, 1, { halo: 'high' })), 'a parameter that is not a number is rejected');
  check(throws(() => createRun(createWorld(PAGE_WORLD), { ...WORST, who: 'worked' })), 'a setting from the old model (who: worked) is rejected');
  const base = runAll(PAGE_WORLD, WORST).at(-1).metrics.mean;
  const flat = runAll(PAGE_WORLD, WORST, 1, { push: { visible: 0 }, autoFive: { tap: 0 } }).at(-1).metrics.mean;
  check(flat < base, `overrides change the run: no push and no reflexive fives lower the worst final average from ${base.toFixed(2)} to ${flat.toFixed(2)}`);

  const starsZero = createRun(createWorld(PAGE_WORLD), WORST, 1).snapshot();
  check(starsZero.round === 0 && starsZero.metrics.mean === null && starsZero.metrics.unrated === 80 && starsZero.history.length === 0, 'stars round 0: no scores, 80 unrated, empty history');
  const yesZero = createRun(createWorld(PAGE_WORLD), COSIGN, 1).snapshot();
  check(yesZero.metrics.meanYeses === 0 && yesZero.metrics.yesCount === 0 && yesZero.metrics.yesRate === null && yesZero.metrics.top48 === null, 'yes round 0: no yeses, no yes rate, no 4.8+ count');
  // "Yeses per person" counts yeses; standing weights them. With a count feed and vouches
  // that say how the giver knows you, a stranger's yes counts a quarter in standing only.
  const saidCount = runAll(PAGE_WORLD, { ...COSIGN, feed: 'count' }).at(-1).metrics;
  const total = saidCount.yesCount * 80;
  check(Math.abs(total - Math.round(total)) < 1e-9 && saidCount.meanYeses < saidCount.yesCount, `yes scale: yeses per person is a plain count (${saidCount.yesCount.toFixed(1)}), and the weighted standing is lower (${saidCount.meanYeses.toFixed(1)})`);

  const starsRun = runAll(PAGE_WORLD, WORST);
  const yesRun = runAll(PAGE_WORLD, LINKEDIN);
  check(
    starsRun.at(-1).history.length === 30 && starsRun.every((s, i) => i === 0 || (s.history.length === i && s.history[i - 1].mean === s.metrics.mean && s.history[i - 1].round === i)),
    'stars history: one entry per completed round, carrying that round\'s average',
  );
  check(
    yesRun.every((s, i) => i === 0 || (s.history.length === i && s.history[i - 1].yesRate === s.metrics.yesRate)),
    'yes history: one entry per completed round, carrying that round\'s yes rate',
  );

  // The directions the page relies on, on average and in the world it shows first.
  for (const [where, rows] of [['12-world average', averages], [`page world ${PAGE_WORLD}`, pageRows]]) {
    const worst = rows.get(ROWS[0][0]);
    const best = rows.get(ROWS[7][0]);
    const linkedin = rows.get(ROWS[8][0]);
    const count = rows.get(ROWS[9][0]);
    const reputation = rows.get(ROWS[10][0]);
    check(worst[0] < 3.7, `${where}: the worst setting starts low, round-1 average ${worst[0].toFixed(2)} (below 3.7)`);
    check(worst[1] >= worst[0] + 0.6, `${where}: and drifts up visibly, to ${worst[1].toFixed(2)} (at least 0.6 higher)`);
    check(best[4] > worst[4], `${where}: the best setting finds more of the 10 most skilled than the worst (${best[4].toFixed(1)} against ${worst[4].toFixed(1)})`);
    check(reputation[4] > count[4], `${where}: Cosign-like with the reputation feed finds more of them than with the count feed (${reputation[4].toFixed(1)} against ${count[4].toFixed(1)})`);
    check(linkedin[2] > 0.7, `${where}: the LinkedIn-like yes rate ends above 0.7 (${linkedin[2].toFixed(2)})`);
    const work = rows.get(ROWS[1][0]);
    const otherSingles = Math.max(...[2, 3, 4, 5, 6].map((i) => rows.get(ROWS[i][0])[4]));
    check(work[4] > otherSingles, `${where}: tied to work is the single switch that finds the most of the 10 most skilled (${work[4].toFixed(1)} against at most ${otherSingles.toFixed(1)})`);
    const plainYes = rows.get(ROWS[11][0]);
    check(Math.abs(plainYes[4] - reputation[4]) <= 1, `${where}: on the yes scale, ranking no one does about as well as ranking by track record (${plainYes[4].toFixed(1)} against ${reputation[4].toFixed(1)})`);
    check([count[3], reputation[3]].every((u) => u >= 15 && u <= 25), `${where}: a ranked feed on the yes scale leaves about a quarter of the 80 with no yes (${count[3].toFixed(1)} by count, ${reputation[3].toFixed(1)} by track record)`);
    check(plainYes[3] < 10, `${where}: a feed that ranks no one leaves far fewer with no yes (${plainYes[3].toFixed(1)})`);
  }

  // The four beats' own sentences. Beat 3: with one-tap stars the scores drift up toward 5
  // and the gold stars land on only half of the best people. Beat 4: with ratings tied to
  // work the scores stay spread out and the stars find most of the best people.
  for (const [where, rows] of [['12-world average', averages], [`page world ${PAGE_WORLD}`, pageRows]]) {
    const worst = rows.get(ROWS[0][0]);
    const work = rows.get(ROWS[1][0]);
    check(worst[4] >= 4 && worst[4] <= 5.5 && worst[1] >= 4.3, `${where}: scene 4, the worst setting drifts to ${worst[1].toFixed(2)} and finds about half of the best (${worst[4].toFixed(2)})`);
    check(work[4] > 5 && work[1] < 3.6, `${where}: scene 5, tied to work stays spread out (${work[1].toFixed(2)}) and finds most of the best (${work[4].toFixed(2)})`);
  }

  // The text under the lab: on the yes scale, vouches tied to work leave more
  // people with no yes than written ones, with a ranked feed (about 33 of 80)
  // and without one (about 14).
  {
    const workRanked = summarize(WORLDS, { ...COSIGN, type: 'work' });
    const workPlain = summarize(WORLDS, { ...COSIGN, type: 'work', feed: 'plain' });
    const written = averages.get(ROWS[10][0]);
    const writtenPlain = averages.get(ROWS[11][0]);
    check(workRanked[3] > written[3] && workRanked[3] >= 28 && workRanked[3] <= 38, `12-world average: tied to work on the yes scale leaves about 33 with no yes in a ranked feed (${workRanked[3].toFixed(1)}, against ${written[3].toFixed(1)} written)`);
    check(workPlain[3] > writtenPlain[3] && workPlain[3] >= 10 && workPlain[3] <= 18, `12-world average: and about 14 with no ranking (${workPlain[3].toFixed(1)}, against ${writtenPlain[3].toFixed(1)} written)`);
  }

  // The anchor slider's note: with the other switches at their worst, a vouch
  // tied to work drifts far less than the worst setting at the default anchor,
  // and nearly as much once the anchor is 0.
  const WORK_ONLY = { ...WORST, type: 'work' };
  for (const [where, worlds] of [['12-world average', WORLDS], [`page world ${PAGE_WORLD}`, [PAGE_WORLD]]]) {
    const worst = summarize(worlds, WORST);
    const held = summarize(worlds, WORK_ONLY);
    const loose = summarize(worlds, WORK_ONLY, { anchor: { work: 0 } });
    const rise = (r) => r[1] - r[0];
    check(rise(held) < 0.25 * rise(worst), `${where}: tied to work at the default anchor rises ${rise(held).toFixed(2)}, under a quarter of the worst setting's ${rise(worst).toFixed(2)}`);
    check(rise(loose) > 0.6 * rise(worst), `${where}: with the anchor at 0 it rises ${rise(loose).toFixed(2)}, most of the way back to the worst setting's drift`);
    if (worlds === WORLDS) {
      const share = rise(loose) / rise(worst);
      check(share >= 0.65 && share <= 0.9, `${where}: that is about three quarters of the worst setting's climb (${share.toFixed(2)})`);
    }
  }

  // The text's extreme: if strangers judge a piece of work entirely by how visible its
  // maker is, tying vouches to work stops helping.
  {
    const worst = averages.get(ROWS[0][0]);
    const extreme = summarize(WORLDS, WORK_ONLY, { workVis: 1 });
    check(extreme[4] <= worst[4], `12-world average: with workVis at 1, tied to work finds ${extreme[4].toFixed(2)}, no more than the worst setting's ${worst[4].toFixed(2)}`);
  }

  // The text's reason more people get no yes when yeses are tied to work: none of them is
  // reflexive. Give them written's 3 percent and the counts fall back to written's.
  {
    const written = averages.get(ROWS[10][0]);
    const writtenPlain = averages.get(ROWS[11][0]);
    const reflexive = { autoYes: { work: DEFAULTS.autoYes.written } };
    const ranked = summarize(WORLDS, { ...COSIGN, type: 'work' }, reflexive);
    const plain = summarize(WORLDS, { ...COSIGN, type: 'work', feed: 'plain' }, reflexive);
    check(Math.abs(ranked[3] - written[3]) <= 3 && Math.abs(plain[3] - writtenPlain[3]) <= 3, `12-world average: with written's reflexive yeses, tied to work leaves ${ranked[3].toFixed(1)} and ${plain[3].toFixed(1)} with no yes, close to written's ${written[3].toFixed(1)} and ${writtenPlain[3].toFixed(1)}`);
  }
}

// Scene 5's bars: every average in data/figures.json is the model's, and every cost number too.
{
  const rules = JSON.parse(readFileSync(new URL('../data/figures.json', import.meta.url), 'utf8')).rules;
  for (const r of rules.settings) {
    const runs = WORLDS.map((w) => runAll(w, r.settings).at(-1).metrics);
    const mean = (k) => runs.reduce((t, m) => t + (m[k] ?? 0), 0) / runs.length;
    check(Math.abs(mean('hits') - r.hits) < 0.005, `figures.json rules: ${r.label} finds ${mean('hits').toFixed(2)} on average, as stated (${r.hits})`);
    if (r.costMetric) {
      const got = r.costMetric === 'yesRate' ? mean('yesRate') * 100 : mean(r.costMetric);
      check(Math.abs(got - r.costValue) < 0.5, `figures.json rules: ${r.label}'s cost number is ${got.toFixed(1)}, as stated (${r.costValue})`);
    }
    const here = runAll(PAGE_WORLD, r.settings).at(-1).metrics.hits;
    check(Math.abs(here - Math.round(r.hits)) <= 1, `page world ${PAGE_WORLD}: ${r.label} finds ${here} in its run, within one of about ${Math.round(r.hits)}`);
  }
  const chance = (10 * 10) / 80;
  check(Math.abs(rules.chance - chance) < 1e-9, `figures.json rules: guessing finds ${chance} of the 10 best, as stated`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;
