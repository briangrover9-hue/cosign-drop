// The trust lab model: 80 coworkers vouching for each other, round by round.
//
// Pure logic with no DOM, so the page and Node run exactly the same code.
// It is a toy model written for this page, not an estimate. Its rules follow
// the research the page cites, and every number in DEFAULTS is our own
// assumption. The methods section of the page describes the same rules.
//
// Two scales: stars (a 1 to 5 rating) and yes (a named yes, with no way to
// say no, only silence, as on Cosign). A vouch can say how the voucher knows
// you, and the feed can rank people by how many vouches they have, by the
// track record of the people who vouched for them, or not at all.
//
// The same world seed, settings, run seed and overrides always give the same
// scores, round for round.

// Skill and visibility use a bell-curve scale where 0 is average and 1 is one
// standard deviation above it.
export const DEFAULTS = deepFreeze({
  // The world
  N: 80, // people in the lab
  teamSize: 8, // people per team, so ten teams
  crossLinks: 2, // each person also picks two people at random on other teams as people they worked with (rarely the same one twice); links go both ways, so most people have more
  rounds: 30, // rounds in one run
  window: 12, // on the stars scale, a score is the average of the last 12 vouches a person received
  skillVisCorr: 0.2, // how closely visibility (presence) tracks skill: only loosely

  // Giving
  volume: { tap: 3, written: 1, work: 1 }, // vouches each person gives per round
  knownShare: 0.5, // share of each person's vouches that go to people they worked with; the rest go to whoever the feed shows them
  autoFive: { tap: 0.12, written: 0.04, work: 0 }, // stars scale: share of vouches that are reflexive fives, given without judging
  autoYes: { tap: 0.25, written: 0.03, work: 0 }, // yes scale: share of judgments that are a reflexive yes, given without judging

  // Judging someone's skill
  noiseKnown: 0.6, // noise when judging someone you worked with
  strangerSkill: 0.35, // judging someone you never worked with: weight on their real skill
  strangerVis: 0.65, // and weight on their visibility, which is what a stranger mostly sees
  noiseStranger: 0.8, // plus this much noise
  noiseMult: { tap: 1, written: 0.8, work: 1 }, // writing a vouch cuts the noise a little; vouches tied to work use the settings below instead
  workNoise: 0.35, // how noisily a piece of work reflects the skill behind it
  readNoise: 0.3, // noise in reading the work of someone you worked with
  readNoiseStranger: 0.8, // noise in reading the work of someone you never worked with
  workVis: 0, // how much a stranger judging a piece of work still goes by the person's visibility; at 0 only the work counts
  halo: 0.5, // in a ranked feed, how much a person's place in the feed sways judgment, whatever kind of vouch it is
  expo: 1.3, // a ranked feed shows each person in proportion to (1 + their rank value) raised to this power

  // The stars scale
  center: 3.2, // stars an average person earns against the fixed standard
  slope: 1, // stars added for each standard deviation of perceived skill
  anchor: { tap: 0, written: 0.3, work: 0.75 }, // share of a rating judged against the fixed standard; the rest is judged against last round's average vouch
  push: { visible: 0.12, blind: 0.05 }, // stars a rater adds to the part judged against the average, so as not to rate anyone below it; more when the other person will see it
  recip: { visible: 0.4, blind: 0 }, // how far a visible vouch is pulled toward the stars the other person last gave the rater

  // The yes scale
  yesBar: { tap: 0, written: 0.5, work: 0.5 }, // how far above average, in standard deviations of perceived skill, someone must seem before the giver says yes
  recipYes: { visible: 0.5, blind: 0 }, // when vouches are visible and the other person's last vouch for the giver was a yes, the bar drops by this much

  // Saying how the voucher knows you
  strangerWeight: 0.25, // a vouch from someone who never worked with you counts this much, in scores and in the reputation feed

  // Track records, for the feed ranked by the reputation of the people who vouched
  outcomeNoise: 1.5, // each round shows one noisy look at each person's real performance: skill plus this much noise
  repStrength: 1, // a vouch weighs exp(repStrength times the voucher's standardized track record)
  repShrink: 3, // a track record built on n positive vouches is multiplied by n / (n + 3), so thin records count less
});

// The five switches and their options.
export const CHOICES = deepFreeze({
  scale: ['stars', 'yes'], // a 1 to 5 rating, or a named yes with no way to say no
  type: ['tap', 'written', 'work'], // one tap, written, or tied to a piece of work
  vis: ['visible', 'blind'], // seen right away, or hidden until both sides have written
  who: ['anyone', 'said'], // a vouch carries no context, or says how the voucher knows you
  feed: ['count', 'reputation', 'plain'], // the feed ranks people by vouches received, by the track record of their vouchers, or not at all
});

export const WORST = Object.freeze({ scale: 'stars', type: 'tap', vis: 'visible', who: 'anyone', feed: 'count' });
export const BEST = Object.freeze({ scale: 'stars', type: 'work', vis: 'blind', who: 'said', feed: 'plain' });
// The settings closest to Cosign's design: named cosigns with a reason,
// public, saying how you know the person, lists ranked partly by the
// reputation behind them.
export const COSIGN = Object.freeze({ scale: 'yes', type: 'written', vis: 'visible', who: 'said', feed: 'reputation' });

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
    people.push({ id: i, skill, vis, team: Math.floor(i / teamSize) });
  }

  // worked[i] is the set of people i worked with: their whole team, plus the
  // cross-team links, which go both ways. Insertion order matters, because a
  // giver picks among coworkers in this order.
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

// One run of the simulation under a setting of the five switches.
// `overrides` is deep-merged into DEFAULTS, for example { push: { visible: 0.2 } }.
export function createRun(world, settings, seed = 1, overrides = {}) {
  const P = mergeParams(DEFAULTS, overrides);
  const S = checkSettings(settings);
  const { people, worked } = world;
  const N = people.length;
  const yesScale = S.scale === 'yes';
  const ranked = S.feed !== 'plain';
  const byReputation = S.feed === 'reputation';
  const everyone = people.map((p) => p.id);
  const topSkillSet = new Set(world.topSkill);

  // The simulation's own random stream, and a separate one for breaking ties
  // in the top 10 by score, so tie-breaking never shifts the simulation.
  const random = mulberry32(world.seed * 7919 + seed);
  const tieRandom = mulberry32(tieSeed(world.seed, seed));
  const tieOrder = people.map(() => tieRandom());

  const received = people.map(() => []); // received[j]: { from, value, known } for every vouch j got, oldest first
  const lastGiven = people.map(() => new Map()); // lastGiven[g].get(j): the last vouch g gave j (stars, or 1 for yes and 0 for silence)
  const countReceived = new Array(N).fill(0); // vouches received so far (stars scale) or yeses received (yes scale)
  const positiveTo = people.map(() => []); // positiveTo[g]: everyone g gave a positive vouch, once per vouch (reputation feed only)
  const outcomeSum = new Array(N).fill(0); // the sum of each person's observed performance so far
  let voucherWeight = new Array(N).fill(1); // each giver's weight from their track record (reputation feed only)
  let norm = P.center; // last round's average vouch on the stars scale, the moving standard raters judge against
  let scores = new Array(N).fill(null); // the scores after the last completed round
  let round = 0;
  const history = [];
  let cached = null;

  // How much a vouch from `from` counts: less from a stranger when vouches say
  // how the voucher knows you, and by the voucher's track record in the reputation feed.
  const weightOf = (from, known) =>
    (S.who === 'said' && !known ? P.strangerWeight : 1) * (byReputation ? voucherWeight[from] : 1);

  const positive = (value) => (yesScale ? value === 1 : value >= 4);

  // What the feed ranks people by, from everything received so far.
  function rankValues() {
    if (S.feed === 'count') return countReceived.slice();
    // Reputation: the summed weight of the positive vouches each person has received.
    if (yesScale) return scores.map((s) => (s === null ? 0 : s)); // on the yes scale, that is the standing itself
    return received.map((list) => {
      let sum = 0;
      for (const v of list) if (v.value >= 4) sum += weightOf(v.from, v.known);
      return sum;
    });
  }

  // How good g thinks j is, before turning it into a vouch.
  function judge(j, known, logRank, mu, sd) {
    const p = people[j];
    let perceived;
    if (S.type === 'work') {
      const shown = known ? p.skill : (1 - P.workVis) * p.skill + P.workVis * p.vis;
      perceived = shown + gauss(random) * P.workNoise + gauss(random) * (known ? P.readNoise : P.readNoiseStranger);
    } else if (known) {
      perceived = p.skill + gauss(random) * P.noiseKnown * P.noiseMult[S.type];
    } else {
      perceived = P.strangerSkill * p.skill + P.strangerVis * p.vis + gauss(random) * P.noiseStranger * P.noiseMult[S.type];
    }
    if (ranked) perceived += (P.halo * (logRank[j] - mu)) / sd;
    return perceived;
  }

  // Stars g gives j.
  function stars(g, j, perceived) {
    if (random() < P.autoFive[S.type]) return 5;
    const relative = norm + P.slope * perceived + P.push[S.vis]; // judged against what everyone else gets
    const absolute = P.center + P.slope * perceived; // judged against the work itself
    const a = P.anchor[S.type];
    let value = (1 - a) * relative + a * absolute;
    const theirs = lastGiven[j].get(g);
    if (theirs !== undefined) value = (1 - P.recip[S.vis]) * value + P.recip[S.vis] * theirs;
    return Math.max(1, Math.min(5, Math.round(value)));
  }

  // Whether g says yes to j: 1 for yes, 0 for silence.
  function yes(g, j, perceived) {
    if (random() < P.autoYes[S.type]) return 1;
    const bonus = lastGiven[j].get(g) === 1 ? P.recipYes[S.vis] : 0;
    return perceived + bonus >= P.yesBar[S.type] ? 1 : 0;
  }

  // Stars: the weighted average of the last `window` vouches. Yes: the summed
  // weight of every yes received. Null for anyone with nothing to count yet.
  function computeScores() {
    return received.map((list) => {
      if (yesScale) {
        let standing = 0;
        let any = false;
        for (const v of list) {
          if (v.value) {
            standing += weightOf(v.from, v.known);
            any = true;
          }
        }
        return any ? standing : null;
      }
      const recent = list.slice(-P.window);
      if (!recent.length) return null;
      let num = 0;
      let den = 0;
      for (const v of recent) {
        const w = weightOf(v.from, v.known);
        num += w * v.value;
        den += w;
      }
      return den > 0 ? num / den : null;
    });
  }

  // A giver's track record: how the people they vouched for have turned out
  // so far, shrunk toward average when it rests on few vouches.
  function updateTrackRecords(roundsSeen) {
    const observed = outcomeSum.map((x) => x / roundsSeen);
    const raw = people.map((_, g) => {
      const list = positiveTo[g];
      if (!list.length) return 0;
      let m = 0;
      for (const j of list) m += observed[j];
      m /= list.length;
      return (m * list.length) / (list.length + P.repShrink);
    });
    const mu = raw.reduce((a, b) => a + b) / N;
    const sd = Math.sqrt(raw.reduce((a, b) => a + (b - mu) ** 2, 0) / N) || 1;
    voucherWeight = raw.map((x) => Math.exp((P.repStrength * (x - mu)) / sd));
  }

  function step() {
    if (round >= P.rounds) return snapshot();

    // Where the feed puts each person, and the halo that comes with it.
    let logRank = null;
    let exposure = null;
    let mu = 0;
    let sd = 1;
    if (ranked) {
      const rank = rankValues();
      logRank = rank.map((v) => Math.log(1 + v));
      mu = logRank.reduce((a, b) => a + b) / N;
      sd = Math.sqrt(logRank.reduce((a, b) => a + (b - mu) ** 2, 0) / N) || 1;
      exposure = rank.map((v) => Math.pow(1 + v, P.expo));
    }

    // Everyone gives this round's vouches before anyone sees them. Each vouch
    // goes to a coworker (with chance knownShare) or to whoever the feed shows.
    const given = [];
    for (let g = 0; g < N; g++) {
      const coworkers = [...worked[g]];
      const others = everyone.filter((j) => j !== g);
      const picked = new Set();
      for (let n = 0; n < P.volume[S.type]; n++) {
        const fromKnown = random() < P.knownShare;
        const pool = (fromKnown ? coworkers : others).filter((j) => !picked.has(j));
        if (!pool.length) continue;
        const weights = pool.map((j) => (!fromKnown && ranked ? exposure[j] : 1));
        const j = pickWeighted(pool, weights, random);
        picked.add(j);
        const known = worked[g].has(j);
        const perceived = judge(j, known, logRank, mu, sd);
        given.push([g, j, yesScale ? yes(g, j, perceived) : stars(g, j, perceived), known]);
      }
    }

    let yeses = 0;
    for (const [g, j, value, known] of given) {
      received[j].push({ from: g, value, known });
      lastGiven[g].set(j, value);
      if (!yesScale || value === 1) countReceived[j] += 1;
      if (yesScale && value === 1) yeses += 1;
      if (byReputation && positive(value)) positiveTo[g].push(j);
    }
    if (!yesScale) norm = given.reduce((sum, v) => sum + v[2], 0) / given.length;

    // Each round shows a little more about how each person really performs.
    for (let i = 0; i < N; i++) outcomeSum[i] += people[i].skill + gauss(random) * P.outcomeNoise;
    if (byReputation) updateTrackRecords(round + 1);

    round += 1;
    scores = computeScores();
    cached = buildSnapshot(yesScale ? yeses / given.length : null);
    return cached;
  }

  // The state after the current round, plus one history entry per completed
  // round (the average score, or the yes rate) for drawing a line of the drift.
  function buildSnapshot(yesRate) {
    const frozen = Object.freeze(scores.slice());
    const topScore = Object.freeze(rankByScore(frozen, tieOrder).slice(0, TOP_N));
    const yesTotal = yesScale ? countReceived.reduce((a, b) => a + b, 0) : null;
    const metrics = Object.freeze(measure(people, frozen, topScore, topSkillSet, yesScale, yesRate, yesTotal));
    if (round > 0) history.push(Object.freeze(yesScale ? { round, yesRate } : { round, mean: metrics.mean }));
    return Object.freeze({
      round,
      scores: frozen,
      metrics,
      topSkill: world.topSkill,
      topScore,
      history: Object.freeze(history.slice()),
    });
  }

  // The state after the current round. Read-only; the same object comes back
  // until the next step.
  function snapshot() {
    if (!cached) cached = buildSnapshot(null);
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

// The measures shown under the lab. Scores of null mean nothing to count yet.
//   mean       stars: average score of everyone with at least one vouch (null before round 1)
//   top48      stars: people whose score is 4.8 or higher (null on the yes scale)
//   meanYeses  yes: average standing (weighted yeses) across everyone, counting people with no yeses as 0
//   yesCount   yes: average number of yeses received across everyone, unweighted
//   yesRate    yes: share of this round's vouches that were yes (null before round 1)
//   unrated    people with nothing to count: no vouches (stars) or no yeses (yes)
//   hits       how many of the top 10 by score are among the 10 most skilled (null before round 1)
//   rho        rank correlation between score and skill, with unrated people tied at the bottom
function measure(people, scores, topScore, topSkillSet, yesScale, yesRate, yesTotal) {
  const N = people.length;
  const rated = scores.filter((s) => s !== null);
  const any = rated.length > 0;
  const rho = any ? spearman(scores.map((s) => s ?? -1), people.map((p) => p.skill)) : null;
  const common = {
    unrated: N - rated.length,
    hits: any ? topScore.filter((i) => topSkillSet.has(i)).length : null,
    rho: Number.isFinite(rho) ? rho : null,
  };
  if (yesScale) {
    return { mean: null, top48: null, meanYeses: rated.reduce((a, b) => a + b, 0) / N, yesCount: yesTotal / N, yesRate, ...common };
  }
  return {
    mean: any ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
    top48: rated.filter((s) => s >= HIGH_BAR).length,
    meanYeses: null,
    yesCount: null,
    yesRate: null,
    ...common,
  };
}

// Everyone by score, highest first. People with no score rank last, and ties
// go by a random order drawn for the run.
function rankByScore(scores, tieOrder) {
  return scores
    .map((_, i) => i)
    .sort((a, b) => (scores[b] ?? -1) - (scores[a] ?? -1) || tieOrder[b] - tieOrder[a]);
}

// Draw one element of `pool` with probability proportional to `weights`.
function pickWeighted(pool, weights, random) {
  let total = 0;
  for (let m = 0; m < pool.length; m++) total += weights[m];
  let x = random() * total;
  let m = 0;
  while (m < pool.length - 1 && (x -= weights[m]) > 0) m++;
  return pool[m];
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
