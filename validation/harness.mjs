// Parameterized mirror of lib/model.ts fitModel, used by validate.mjs to run the
// robustness gate suite (split-half, perturbations, segments, outlier removal) and the
// model-selection experiments recorded in OPTIMIZATION-V2.md. Fidelity: at the shipped
// parameters it reproduces the production fit exactly (median |log error| 1.0257 against
// the flat model's 1.6317, growth weight 0.85, size slope -0.3562); validate.mjs checks
// this on every run before trusting any other number it prints.
import { readFileSync } from 'node:fs';
import { chainTier } from '../lib/chains.ts';

export const SNAP_PATH = process.env.SNAPSHOT_PATH ?? '';
if (SNAP_PATH === '') throw new Error('set SNAPSHOT_PATH to the sealed snapshot.json (validate.mjs does this from its argument)');
export const snapshot = JSON.parse(readFileSync(SNAP_PATH, 'utf8'));

const DAY_MS = 86_400_000;
export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function ageDays(asOf, listedAt) {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}
const finite = (v, fb) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
export const calibOf = (snap) => snap.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
export const isPreToken = (p) => p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
export const isRankable = (p) => isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);

/** The flat radar-1 baseline, exactly as lib/model.ts scores it. */
export function flatPred(p, asOf) {
  const age = ageDays(asOf, p.listed_at) ?? 365;
  const g = Math.min(120, Math.max(-60, finite(p.change_7d, 0)));
  return p.tvl_usd * 0.25 * (1 + (g / 100) * 0.5) * (0.6 + (Math.min(age, 1095) / 1095) * 0.4);
}
export const logErr = (p, pred) => Math.abs(Math.log(p.mcap_usd / pred));
export const medErr = (ps, predFn) => median(ps.map((p) => logErr(p, predFn(p))));

export const BASE_PARAMS = {
  k: 4,
  growthFloor: -60, growthCap: 120, gridStep: 0.05,
  maturityFloor: 0.6, maturityRange: 0.4, maturityDays: 1095, maturityFit: false,
  maturityShape: 'linear', // 'linear' | 'log'
  sizeRef: 100_000_000, sizeSlopeMin: -0.75, sizeSlopeMax: 0.25, sizeMultMin: 0.15, sizeMultMax: 6,
  sizeFit: 'ls', // 'ls' | 'huber' | 'l1' | 'none'
  sizeGrowthTerm: false, // add clamped growth (fraction) as a second regressor in the size fit
  growthMode: 'global', // 'global' | 'percat'
  growthAsym: false, // grid-search separate weights for positive vs negative growth
  percatMinPeers: 8, percatShrink: 8,
  chainFeature: 'none', // 'none' | 'tier'
  chainShrink: 10,
};

/** Solve a small dense linear system by Gaussian elimination (for WLS normal equations). */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Fit the parameterized model on a snapshot (only its calibration members teach it).
 * Returns { predict(p), info } where predict is the unrounded implied value.
 */
export function fitMirror(snap, params = {}) {
  const P = { ...BASE_PARAMS, ...params };
  const calib = calibOf(snap);
  const asOf = snap.as_of;
  const globalMedian = median(calib.map((p) => p.mcap_usd / p.tvl_usd));
  const knownAges = calib.map((p) => ageDays(asOf, p.listed_at)).filter((a) => a !== null);
  const globalMedianAge = knownAges.length > 0 ? Math.round(median(knownAges)) : 365;

  const byCategory = new Map();
  for (const p of calib) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  const catFit = new Map();
  for (const [category, members] of byCategory) {
    const raw = median(members.map((p) => p.mcap_usd / p.tvl_usd));
    const ages = members.map((p) => ageDays(asOf, p.listed_at)).filter((a) => a !== null);
    catFit.set(category, {
      peers: members.length,
      raw,
      fitted: Math.exp((members.length * Math.log(raw) + P.k * Math.log(globalMedian)) / (members.length + P.k)),
      medianAge: ages.length > 0 ? Math.round(median(ages)) : null,
    });
  }
  const multipleOf = (p) => catFit.get(p.category)?.fitted ?? globalMedian;
  const ageFor = (p) => {
    const own = ageDays(asOf, p.listed_at);
    if (own !== null) return own;
    return catFit.get(p.category)?.medianAge ?? globalMedianAge;
  };
  const growthPct = (p) => Math.min(P.growthCap, Math.max(P.growthFloor, finite(p.change_7d, 0)));
  const matMult = (age, fl, rg, days) => P.maturityShape === 'log'
    ? fl + rg * (Math.log1p(Math.min(Math.max(age, 0), days)) / Math.log1p(days))
    : fl + (Math.min(Math.max(age, 0), days) / days) * rg;
  const preSize = (p, w, fl, rg) => p.tvl_usd * multipleOf(p) * (1 + (growthPct(p) / 100) * w) * matMult(ageFor(p), fl, rg, P.maturityDays);
  const preSizeAsym = (p, wPos, wNeg, fl, rg) => p.tvl_usd * multipleOf(p) * (1 + (growthPct(p) / 100) * (growthPct(p) >= 0 ? wPos : wNeg)) * matMult(ageFor(p), fl, rg, P.maturityDays);

  // Growth weight (+ optionally maturity shape) by grid search on pre-size error.
  let weight = 0, weightPos = 0, weightNeg = 0, matFloor = P.maturityFloor, matRange = P.maturityRange, best = Infinity;
  const floors = P.maturityFit ? [0.4, 0.5, 0.6, 0.7] : [P.maturityFloor];
  const ranges = P.maturityFit ? [0.2, 0.3, 0.4, 0.5, 0.6] : [P.maturityRange];
  for (const fl of floors) for (const rg of ranges) {
    for (let w = 0; w <= 1.0001; w += P.gridStep) {
      const err = median(calib.map((p) => Math.abs(Math.log(p.mcap_usd / preSize(p, w, fl, rg)))));
      if (err < best - 1e-12) { best = err; weight = Math.round(w * 100) / 100; matFloor = fl; matRange = rg; }
    }
  }
  if (P.growthAsym) {
    let be = Infinity;
    for (let wp = 0; wp <= 1.0001; wp += P.gridStep) for (let wn = 0; wn <= 1.0001; wn += P.gridStep) {
      const err = median(calib.map((p) => Math.abs(Math.log(p.mcap_usd / preSizeAsym(p, wp, wn, matFloor, matRange)))));
      if (err < be - 1e-12) { be = err; weightPos = Math.round(wp * 100) / 100; weightNeg = Math.round(wn * 100) / 100; }
    }
  }

  // Optional per-category growth weights, shrunk toward the global weight.
  const wOf = new Map();
  if (P.growthMode === 'percat') {
    for (const [category, members] of byCategory) {
      if (members.length < P.percatMinPeers) continue;
      let bw = weight, be = Infinity;
      for (let w = 0; w <= 1.0001; w += P.gridStep) {
        const err = median(members.map((p) => Math.abs(Math.log(p.mcap_usd / preSize(p, w, matFloor, matRange)))));
        if (err < be - 1e-12) { be = err; bw = Math.round(w * 100) / 100; }
      }
      wOf.set(category, (members.length * bw + P.percatShrink * weight) / (members.length + P.percatShrink));
    }
  }
  const pre = (p) => P.growthAsym
    ? preSizeAsym(p, weightPos, weightNeg, matFloor, matRange)
    : preSize(p, wOf.get(p.category) ?? weight, matFloor, matRange);

  // Size term on log residuals: r ~ intercept + slope*x (+ gamma*growthFraction).
  const logRef = Math.log(P.sizeRef);
  const xs = calib.map((p) => Math.log(p.tvl_usd) - logRef);
  const gs = calib.map((p) => growthPct(p) / 100);
  const rs = calib.map((p) => Math.log(p.mcap_usd / pre(p)));
  let slope = 0, intercept = 0, gamma = 0;
  if (P.sizeFit !== 'none') {
    const design = (i) => (P.sizeGrowthTerm ? [1, xs[i], gs[i]] : [1, xs[i]]);
    const wls = (ws) => {
      const d = P.sizeGrowthTerm ? 3 : 2;
      const A = Array.from({ length: d }, () => Array(d).fill(0));
      const b = Array(d).fill(0);
      for (let i = 0; i < xs.length; i++) {
        const row = design(i);
        for (let a = 0; a < d; a++) {
          b[a] += ws[i] * row[a] * rs[i];
          for (let c = 0; c < d; c++) A[a][c] += ws[i] * row[a] * row[c];
        }
      }
      return solve(A, b);
    };
    let beta = wls(xs.map(() => 1)) ?? [0, 0, 0];
    if (P.sizeFit === 'huber' || P.sizeFit === 'l1') {
      for (let it = 0; it < 50; it++) {
        const res = calib.map((_, i) => rs[i] - design(i).reduce((s, v, j) => s + v * (beta[j] ?? 0), 0));
        let ws;
        if (P.sizeFit === 'huber') {
          const med = median(res);
          const s = 1.4826 * median(res.map((r) => Math.abs(r - med)));
          if (!(s > 1e-9)) break;
          const dd = 1.345 * s;
          ws = res.map((r) => Math.min(1, dd / Math.max(Math.abs(r), 1e-12)));
        } else {
          ws = res.map((r) => 1 / Math.max(Math.abs(r), 0.02));
        }
        const next = wls(ws);
        if (next === null) break;
        const delta = Math.max(...next.map((v, j) => Math.abs(v - (beta[j] ?? 0))));
        beta = next;
        if (delta < 1e-10) break;
      }
    }
    if (P.sizeGrowthTerm) {
      intercept = beta[0] ?? 0;
      slope = Math.min(P.sizeSlopeMax, Math.max(P.sizeSlopeMin, beta[1] ?? 0));
      gamma = beta[2] ?? 0;
    } else if (P.sizeFit === 'ls') {
      // Production parity: slope from LS clamped, intercept from plain means with clamped slope.
      slope = Math.min(P.sizeSlopeMax, Math.max(P.sizeSlopeMin, beta[1] ?? 0));
      const xm = xs.reduce((a, b) => a + b, 0) / xs.length;
      const rm = rs.reduce((a, b) => a + b, 0) / rs.length;
      intercept = rm - slope * xm;
    } else {
      intercept = beta[0] ?? 0;
      slope = Math.min(P.sizeSlopeMax, Math.max(P.sizeSlopeMin, beta[1] ?? 0));
    }
  }
  const sizeMult = (p) => {
    if (P.sizeFit === 'none') return 1;
    const x = Math.log(Math.max(1, p.tvl_usd)) - logRef;
    const g = P.sizeGrowthTerm ? gamma * (growthPct(p) / 100) : 0;
    return Math.min(P.sizeMultMax, Math.max(P.sizeMultMin, Math.exp(intercept + slope * x + g)));
  };

  // Optional chain-tier effect on post-size residuals, shrunk toward zero.
  const tierEffect = new Map();
  if (P.chainFeature === 'tier') {
    const groups = new Map();
    for (const p of calib) {
      const label = p.chains.length > 0 ? chainTier(p.chains[0]).label : 'mid-fee chain';
      const r = Math.log(p.mcap_usd / (pre(p) * sizeMult(p)));
      const g = groups.get(label) ?? [];
      g.push(r);
      groups.set(label, g);
    }
    for (const [label, rs2] of groups) {
      const eff = rs2.reduce((a, b) => a + b, 0) / (rs2.length + P.chainShrink);
      tierEffect.set(label, Math.min(Math.log(2), Math.max(Math.log(0.5), eff)));
    }
  }
  const tierMult = (p) => {
    if (P.chainFeature !== 'tier') return 1;
    const label = p.chains.length > 0 ? chainTier(p.chains[0]).label : 'mid-fee chain';
    return Math.exp(tierEffect.get(label) ?? 0);
  };

  const predict = (p) => pre(p) * sizeMult(p) * tierMult(p);
  return {
    predict,
    info: { globalMedian, globalMedianAge, weight, weightPos, weightNeg, matFloor, matRange, slope, intercept, gamma, calibSize: calib.length, catFit, wOf, tierEffect },
  };
}

/** Ensemble: fit several param sets, combine log predictions by median or mean. */
export function fitEnsemble(snap, paramSets, mode = 'median') {
  const members = paramSets.map((ps) => fitMirror(snap, ps));
  const predict = (p) => {
    const logs = members.map((m) => Math.log(m.predict(p)));
    return Math.exp(mode === 'median' ? median(logs) : logs.reduce((a, b) => a + b, 0) / logs.length);
  };
  return { predict, info: { members: members.map((m) => m.info) } };
}

/** Board top-n slugs under a predict function (watchlist union rankable, value desc, slug tiebreak). */
export function boardTop(snap, predict, n = 10) {
  const index = new Map(snap.protocols.map((p) => [p.slug, p]));
  const chosen = new Map();
  for (const slug of snap.watchlist) { const p = index.get(slug); if (p) chosen.set(slug, p); }
  for (const p of snap.protocols) if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  const scored = [...chosen.values()].map((p) => ({ slug: p.slug, v: Math.max(1, Math.round(predict(p))) }));
  scored.sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1));
  return scored.slice(0, n).map((s) => s.slug);
}
export const overlap = (a, b) => a.filter((x) => b.includes(x)).length;
