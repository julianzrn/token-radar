// The Phase-3 gate suite, parameterized over a candidate config.
// Config: { kind:'single', params } | { kind:'ensemble', members:[params...], mode }
import { snapshot, calibOf, fitMirror, fitEnsemble, flatPred, medErr, boardTop, overlap } from './harness.mjs';

export const parity = (p) => [...p.slug].reduce((a, c) => a + c.charCodeAt(0), 0) % 2;
export const r4 = (n) => Math.round(n * 1e4) / 1e4;

export function factory(cfg) {
  if (cfg.kind === 'ensemble') return (snap) => fitEnsemble(snap, cfg.members, cfg.mode ?? 'median').predict;
  return (snap) => fitMirror(snap, cfg.params ?? {}).predict;
}
const perturb = (cfg, ov) => {
  if (cfg.kind === 'ensemble') return { ...cfg, members: cfg.members.map((m) => ({ ...m, ...ov })) };
  return { kind: 'single', params: { ...(cfg.params ?? {}), ...ov } };
};
export const PERTURBATIONS = [
  ['k=2', { k: 2 }], ['k=8', { k: 8 }],
  ['clamp[-40,80]', { growthFloor: -40, growthCap: 80 }],
  ['clamp[-80,200]', { growthFloor: -80, growthCap: 200 }],
  ['matFloor=0.5', { maturityFloor: 0.5 }], ['matFloor=0.7', { maturityFloor: 0.7 }],
  ['sizeRef=$50M', { sizeRef: 50_000_000 }], ['sizeRef=$200M', { sizeRef: 200_000_000 }],
  ['gridStep=0.1', { gridStep: 0.1 }],
];

export function runGates(cfg, { perturbations = true } = {}) {
  const calib = calibOf(snapshot);
  const flat = (p) => flatPred(p, snapshot.as_of);
  const fit = factory(cfg);
  const predict = fit(snapshot);
  const out = {};

  out.inSample = r4(medErr(calib, predict));
  out.flatInSample = r4(medErr(calib, flat));

  // Split-half OOS (slug char-code parity), both directions.
  const A = calib.filter((p) => parity(p) === 0);
  const B = calib.filter((p) => parity(p) === 1);
  const sub = (train) => ({ ...snapshot, protocols: train });
  out.oos = {
    fitA_scoreB: r4(medErr(B, fit(sub(A)))),
    fitB_scoreA: r4(medErr(A, fit(sub(B)))),
    flatOnB: r4(medErr(B, flat)),
    flatOnA: r4(medErr(A, flat)),
  };
  out.oos.avg = r4((out.oos.fitA_scoreB + out.oos.fitB_scoreA) / 2);
  out.oos.pass = out.oos.fitA_scoreB < out.oos.flatOnB && out.oos.fitB_scoreA < out.oos.flatOnA;

  // Segments (full fit, per-segment in-sample), model vs flat.
  const peers = new Map();
  for (const p of calib) peers.set(p.category, (peers.get(p.category) ?? 0) + 1);
  const segs = {
    'TVL<$25M': calib.filter((p) => p.tvl_usd < 25e6),
    'TVL$25-100M': calib.filter((p) => p.tvl_usd >= 25e6 && p.tvl_usd < 100e6),
    'TVL$100M-1B': calib.filter((p) => p.tvl_usd >= 100e6 && p.tvl_usd < 1e9),
    'TVL>$1B': calib.filter((p) => p.tvl_usd >= 1e9),
    'thin categories (<=3 peers)': calib.filter((p) => (peers.get(p.category) ?? 0) <= 3),
    'listed_at missing': calib.filter((p) => p.listed_at === null),
  };
  out.segments = {};
  out.segments.pass = true;
  for (const [name, ps] of Object.entries(segs)) {
    const me = r4(medErr(ps, predict));
    const fe = r4(medErr(ps, flat));
    out.segments[name] = { n: ps.length, model: me, flat: fe, pass: me < fe };
    if (!(me < fe)) out.segments.pass = false;
  }

  // Outlier removal: drop 'rain', refit, compare.
  const noRain = { ...snapshot, protocols: snapshot.protocols.filter((p) => p.slug !== 'rain') };
  const calibNR = calibOf(noRain);
  const predictNR = fit(noRain);
  const topFull = boardTop(snapshot, predict, 10);
  const topNR = boardTop(noRain, predictNR, 10);
  out.outlier = {
    err: r4(medErr(calibNR, predictNR)),
    flatErr: r4(medErr(calibNR, (p) => flatPred(p, noRain.as_of))),
    top1: topNR[0],
    overlap: overlap(topNR, topFull),
  };
  out.outlier.pass = out.outlier.top1 === 'wbtc' && out.outlier.overlap >= 9 && out.outlier.err < out.outlier.flatErr;
  out.top10 = topFull;

  // Parameter perturbations: in-sample error + board top-10 overlap vs the candidate itself.
  if (perturbations) {
    out.perturbations = {};
    out.perturbations.pass = true;
    for (const [name, ov] of PERTURBATIONS) {
      const pv = factory(perturb(cfg, ov))(snapshot);
      const e = r4(medErr(calib, pv));
      const ov10 = overlap(boardTop(snapshot, pv, 10), topFull);
      out.perturbations[name] = { err: e, overlap: ov10 };
      if (!(e < out.flatInSample && ov10 >= 9)) out.perturbations.pass = false;
    }
  }
  out.pass = out.oos.pass && out.segments.pass && out.outlier.pass && (perturbations ? out.perturbations.pass : true);
  return out;
}

/** Repeated random 50/50 splits (deterministic PRNG) for model-selection evidence. */
export function repeatedSplits(cfg, rounds = 20, seed = 20261127) {
  const calib = calibOf(snapshot);
  const fit = factory(cfg);
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const errs = [];
  for (let r = 0; r < rounds; r++) {
    const shuffled = [...calib];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const half = Math.floor(shuffled.length / 2);
    const train = shuffled.slice(0, half);
    const test = shuffled.slice(half);
    const predict = fit({ ...snapshot, protocols: train });
    errs.push(medErr(test, predict));
  }
  errs.sort((a, b) => a - b);
  return { mean: r4(errs.reduce((a, b) => a + b, 0) / errs.length), median: r4(errs[Math.floor(errs.length / 2)]), min: r4(errs[0]), max: r4(errs[errs.length - 1]) };
}
