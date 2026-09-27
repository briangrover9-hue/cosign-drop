// The trust lab model: 80 coworkers vouching for each other, round by round.
//
// Pure logic with no DOM, so the page and Node run exactly the same code.
// It is a toy model written for this page, not an estimate. Its rules follow
// the research the page cites, and every number in DEFAULTS is our own
// assumption. The methods section of the page describes the same rules.
//
// The same world seed, settings, run seed and overrides always give the same
// scores, round for round.

// Skill and visibility use a bell-curve scale where 0 is average and 1 is one
// standard deviation above it. Stars run from 1 to 5.
export const DEFAULTS = deepFreeze({
  // The world
  N: 80, // people in the lab
  teamSize: 8, // people per team, so ten teams
  crossLinks: 2, // each person also picks two people on other teams they worked with; links go both ways, so some people have more
  rounds: 30, // rounds in one run
  window: 12, // a score is the average of the last 12 vouches a person received
  skillVisCorr: 0.2, // how closely visibility (presence, followers) tracks skill: only loosely

  // Giving
  volume: { tap: 3, written: 1, work: 1 }, // vouches each person gives per round
  autoFive: { tap: 0.4, written: 0.1, work: 0 }, // share of vouches that are reflexive fives, given without judging

  // Judging someone's skill
  noiseKnown: 0.6, // noise when judging someone you worked with
  strangerSkill: 0.35, // judging someone you never worked with: weight on their real skill
  strangerVis: 0.65, // and weight on their visibility, which is what a stranger mostly sees
  noiseStranger: 0.8, // plus this much noise
  noiseMult: { tap: 1, written: 0.8, work: 1 }, // writing a vouch cuts the noise a little; vouches tied to work use the three settings below instead
  workNoise: 0.35, // how noisily a piece of work reflects the skill behind it
  readNoise: 0.3, // noise in reading the work of someone you worked with
  readNoiseStranger: 0.8, // noise in reading the work of someone you never worked with
  halo: 0.5, // in a feed ranked by followers, how much follower counts sway judgment
  haloWork: 0.3, // the same sway when the vouch is tied to a piece of work
  expo: 1.3, // a ranked feed shows each person in proportion to their followers raised to this power

  // Turning a judgment into stars
  center: 3.2, // stars an average person earns against the fixed standard
  slope: 1, // stars added for each standard deviation of perceived skill
  anchor: { tap: 0, written: 0.3, work: 0.75 }, // share of a rating judged against the fixed standard; the rest is judged against last round's average vouch
  push: { visible: 0.12, blind: 0.05 }, // stars a rater adds to the part judged against the average, so as not to rate anyone below it; more when the other person will see it
  recip: { visible: 0.4, blind: 0 }, // how far a visible vouch is pulled toward the stars the other person last gave the rater
  followGain: 4, // in a ranked feed, followers gained for each vouch received
});

// The four switches and their options.
export const CHOICES = deepFreeze({
  type: ['tap', 'written', 'work'], // one tap, written, or tied to a piece of work
  vis: ['visible', 'blind'], // seen right away, or hidden until both sides have written
  who: ['anyone', 'worked'], // anyone can vouch, or only people who worked with you
  feed: ['ranked', 'plain'], // the feed ranks people by followers, or ranks no one
});

export const WORST = Object.freeze({ type: 'tap', vis: 'visible', who: 'anyone', feed: 'ranked' });
export const BEST = Object.freeze({ type: 'work', vis: 'blind', who: 'worked', feed: 'plain' });

// The measures: a "top 10" has 10 people, and the high bar is 4.8 stars.
export const TOP_N = 10;
export const HIGH_BAR = 4.8;

// People, teams and who worked with whom. Deterministic by seed.
export function createWorld(seed) {
  const random = mulberry32(seed);
  const { N, teamSize, crossLinks, skillVisCorr: c } = DEFAULTS;

  const people = [];
  for (let i = 0; i < N; i++) {
    const skill = gauss(random);
    const vis = c * skill + Math.sqrt(1 - c * c) * gauss(random);
    people.push({ id: i, skill, vis, followers0: Math.exp(vis) * 10, team: Math.floor(i / teamSize) });
  }

  // worked[i] is the set of people i worked with: their whole team, plus the
  // cross-team links, which go both ways. Insertion order matters, because a
  // rater's pool of candidates is drawn in this order.
  const worked = people.map(() => new Set());
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i !== j && people[i].team === people[j].team) worked[i].add(j);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < crossLinks; k++) {
      let j;
      do j = Math.floor(random() * N);
      while (j === i || people[j].team === people[i].team);
      worked[i].add(j);
      worked[j].add(i);
    }
  }

  const topSkill = people
    .map((p) => p.id)
    .sort((a, b) => people[b].skill - people[a].skill)
    .slice(0, TOP_N);

  return { seed, people, worked, topSkill: Object.freeze(topSkill) };
}

// One run of the simulation under a setting of the four switches.
//
// `overrides` is deep-merged into DEFAULTS, for example { push: { visible: 0.2 } }.
// `options.prototypeTieBreak` exists only to check this port against the
// prototype it came from, which drew its tie-breaks from the simulation's own
// random stream at the end of every round. The page never sets it.
export function createRun(world, settings, seed = 1, overrides = {}, options = {}) {
  const P = mergeParams(DEFAULTS, overrides);
  const S = checkSettings(settings);
  const { people, worked } = world;
  const N = people.length;
  const ranked = S.feed === 'ranked';
  const everyone = people.map((p) => p.id);
  const topSkillSet = new Set(world.topSkill);

  // The simulation's own random stream, and a separate one for breaking ties
  // in the top 10 by score, so tie-breaking never shifts the simulation.
  const random = mulberry32(world.seed * 7919 + seed);
  const tieRandom = mulberry32(tieSeed(world.seed, seed));
  let tieOrder = people.map(() => tieRandom());

  const received = people.map(() => []); // received[j]: the stars j has received, oldest first
  const lastGiven = people.map(() => new Map()); // lastGiven[g].get(j): the stars g last gave j
  const followers = people.map((p) => p.followers0);
  let norm = P.center; // last round's average vouch, the moving standard raters judge against
  let round = 0;
  let cached = null;

  // How many stars g gives j this round.
  function rate(g, j, logFollowers, mu, sd) {
    if (random() < P.autoFive[S.type]) return 5;

    const known = worked[g].has(j);
    const p = people[j];
    let perceived;
    if (S.type === 'work') {
      perceived = p.skill + gauss(random) * P.workNoise + gauss(random) * (known ? P.readNoise : P.readNoiseStranger);
    } else if (known) {
      perceived = p.skill + gauss(random) * P.noiseKnown * P.noiseMult[S.type];
    } else {
      perceived = P.strangerSkill * p.skill + P.strangerVis * p.vis + gauss(random) * P.noiseStranger * P.noiseMult[S.type];
    }
    if (ranked) perceived += (S.type === 'work' ? P.haloWork : P.halo) * (logFollowers[j] - mu) / sd;

    const relative = norm + P.slope * perceived + P.push[S.vis]; // judged against what everyone else gets
    const absolute = P.center + P.slope * perceived; // judged against the work itself
    const a = P.anchor[S.type];
    let stars = (1 - a) * relative + a * absolute;

    const theirs = lastGiven[j].get(g);
    if (theirs !== undefined) stars = (1 - P.recip[S.vis]) * stars + P.recip[S.vis] * theirs;
    return Math.max(1, Math.min(5, Math.round(stars)));
  }

  function step() {
    if (round >= P.rounds) return snapshot();

    // Follower counts on a log scale, standardized, for the halo.
    const logFollowers = followers.map((f) => Math.log(f));
    const mu = logFollowers.reduce((a, b) => a + b) / N;
    const sd = Math.sqrt(logFollowers.reduce((a, b) => a + (b - mu) ** 2, 0) / N) || 1;

    // How strongly a ranked feed shows each person this round.
    const exposure = ranked ? followers.map((f) => Math.pow(f, P.expo)) : null;

    // Everyone gives this round's vouches before anyone sees them.
    const given = [];
    for (let g = 0; g < N; g++) {
      const pool = S.who === 'worked' ? [...worked[g]] : everyone.filter((j) => j !== g);
      const weights = pool.map((j) => (ranked ? exposure[j] : 1));
      const count = Math.min(P.volume[S.type], pool.length);
      for (let n = 0; n < count; n++) {
        const j = drawWeighted(pool, weights, random);
        given.push([g, j, rate(g, j, logFollowers, mu, sd)]);
      }
    }

    for (const [g, j, stars] of given) {
      received[j].push(stars);
      lastGiven[g].set(j, stars);
      if (ranked) followers[j] += P.followGain;
    }
    norm = given.reduce((sum, v) => sum + v[2], 0) / given.length;
    round += 1;
    if (options.prototypeTieBreak) tieOrder = people.map(() => random());
    cached = null;
    return snapshot();
  }

  // The state after the current round. Read-only; the same object comes back
  // until the next step.
  function snapshot() {
    if (cached) return cached;
    const scores = received.map((list) => {
      if (!list.length) return null;
      const recent = list.slice(-P.window);
      return recent.reduce((a, b) => a + b) / recent.length;
    });
    const topScore = rankByScore(scores, tieOrder).slice(0, TOP_N);
    cached = Object.freeze({
      round,
      scores: Object.freeze(scores),
      metrics: Object.freeze(measure(people, scores, topScore, topSkillSet)),
      topSkill: world.topSkill,
      topScore: Object.freeze(topScore),
    });
    return cached;
  }

  return {
    world,
    settings: S,
    seed,
    params: P,
    get round() {
      return round;
    },
    get rounds() {
      return P.rounds;
    },
    get done() {
      return round >= P.rounds;
    },
    step,
    snapshot,
  };
}

// The measures shown under the lab. Scores of null mean no vouches yet.
//   mean     average score of everyone with at least one vouch (null before round 1)
//   top48    people whose score is 4.8 or higher
//   unrated  people with no vouches at all
//   hits     how many of the top 10 by score are among the 10 most skilled (null before round 1)
//   rho      rank correlation between score and skill, with unrated people tied at the bottom
function measure(people, scores, topScore, topSkillSet) {
  const N = people.length;
  const rated = scores.filter((s) => s !== null);
  if (!rated.length) return { mean: null, top48: 0, unrated: N, hits: null, rho: null };
  return {
    mean: rated.reduce((a, b) => a + b, 0) / rated.length,
    top48: rated.filter((s) => s >= HIGH_BAR).length,
    unrated: N - rated.length,
    hits: topScore.filter((i) => topSkillSet.has(i)).length,
    rho: spearman(scores.map((s) => s ?? -1), people.map((p) => p.skill)),
  };
}

// Everyone by score, highest first. People with no score rank last, and ties
// go by a random order drawn for the run.
function rankByScore(scores, tieOrder) {
  return scores
    .map((_, i) => i)
    .sort((a, b) => (scores[b] ?? -1) - (scores[a] ?? -1) || tieOrder[b] - tieOrder[a]);
}

// Draw one index from `pool` with probability proportional to `weights`, and
// remove it from both arrays (drawing without replacement).
function drawWeighted(pool, weights, random) {
  let total = 0;
  for (let m = 0; m < pool.length; m++) total += weights[m];
  let x = random() * total;
  let m = 0;
  while (m < pool.length - 1 && (x -= weights[m]) > 0) m++;
  const picked = pool[m];
  pool.splice(m, 1);
  weights.splice(m, 1);
  return picked;
}

// Spearman's rank correlation, with tied values sharing their average rank.
function spearman(a, b) {
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x) / n;
  const mb = rb.reduce((s, x) => s + x) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

function ranks(values) {
  const order = values.map((_, i) => i).sort((x, y) => values[x] - values[y]);
  const rank = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && values[order[j + 1]] === values[order[i]]) j++;
    for (let m = i; m <= j; m++) rank[order[m]] = (i + j) / 2;
    i = j + 1;
  }
  return rank;
}

// mulberry32: a small, fast seeded random number generator returning numbers in [0, 1).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A standard normal draw (Box-Muller), from two uniform draws.
function gauss(random) {
  let u = 0;
  while (u === 0) u = random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// A seed for the tie-break stream that differs from the simulation's own.
function tieSeed(worldSeed, runSeed) {
  return (Math.imul(worldSeed * 7919 + runSeed, 0x9e3779b1) ^ 0x7f4a7c15) >>> 0;
}

function checkSettings(settings) {
  const out = {};
  for (const key of Object.keys(CHOICES)) {
    const value = settings?.[key];
    if (!CHOICES[key].includes(value)) throw new Error(`lab-model: ${key} must be one of ${CHOICES[key].join(', ')}`);
    out[key] = value;
  }
  return Object.freeze(out);
}

// Deep-merge `overrides` into a copy of `base`. Unknown keys are an error, so
// a typo cannot silently leave a default in place.
function mergeParams(base, overrides, path = '') {
  const out = {};
  for (const key of Object.keys(base)) {
    out[key] = isPlainObject(base[key]) ? mergeParams(base[key], {}, path + key + '.') : base[key];
  }
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (!(key in base)) throw new Error(`lab-model: unknown parameter ${path + key}`);
    if (value === undefined) continue;
    if (isPlainObject(base[key])) {
      if (!isPlainObject(value)) throw new Error(`lab-model: ${path + key} must be an object`);
      out[key] = mergeParams(base[key], value, path + key + '.');
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`lab-model: ${path + key} must be a number`);
      out[key] = value;
    }
  }
  return Object.freeze(out);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(object) {
  for (const value of Object.values(object)) if (isPlainObject(value) || Array.isArray(value)) deepFreeze(value);
  return Object.freeze(object);
}
