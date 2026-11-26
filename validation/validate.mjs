// The radar-2 robustness gate suite, runnable against the sealed snapshot:
//
//   node validation/validate.mjs <path-to-snapshot.json>
//
// It first proves the parameterized mirror in harness.mjs reproduces the production
// fit in lib/model.ts exactly at the shipped parameters; only then does it trust the
// mirror for the checks the production constants cannot express (perturbations and
// refits). Every number the README and the dashboard quote comes from this script.
// Exit code 0 only if fidelity holds and every gate passes.
import { fileURLToPath } from 'node:url';

const snapArg = process.argv[2];
if (snapArg === undefined) {
  process.stderr.write('usage: node validation/validate.mjs <path-to-snapshot.json>\n');
  process.exit(2);
}
process.env.SNAPSHOT_PATH = fileURLToPath(new URL(snapArg, `file://${process.cwd()}/`));

const { fitModel, impliedValue } = await import('../lib/model.ts');
const H = await import('./harness.mjs');
const G = await import('./gates.mjs');

const { snapshot, calibOf, fitMirror, flatPred, medErr } = H;
const r4 = G.r4;
const calib = calibOf(snapshot);
let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!ok) failures++;
};

// --- fidelity: mirror vs production at the shipped parameters ---
const prodFit = fitModel(snapshot);
const prodErr = medErr(calib, (p) => impliedValue(p, snapshot.as_of, prodFit).implied);
const mir = fitMirror(snapshot, {});
const mirErr = medErr(calib, mir.predict);
check('fidelity: mirror == production fit',
  r4(prodErr) === r4(mirErr) && r4(prodFit.growth_weight) === r4(mir.info.weight) && r4(prodFit.size_slope) === r4(mir.info.slope),
  `model err ${r4(mirErr)}, growth weight ${mir.info.weight}, size slope ${r4(mir.info.slope)}`);

// --- the gate suite on the shipped configuration ---
const gates = G.runGates({ kind: 'single', params: {} });
console.log(`in-sample: model ${gates.inSample} vs flat ${gates.flatInSample}`);
check('split-half out-of-sample beats flat, both directions', gates.oos.pass,
  `${gates.oos.fitA_scoreB} / ${gates.oos.fitB_scoreA} vs flat ${gates.oos.flatOnB} / ${gates.oos.flatOnA}`);
for (const [name, v] of Object.entries(gates.segments)) {
  if (typeof v !== 'object') continue;
  check(`segment ${name}`, v.pass, `n=${v.n} model ${v.model} vs flat ${v.flat}`);
}
check('outlier removal (rain) keeps #1 and top-10', gates.outlier.pass,
  `err ${gates.outlier.err} vs flat ${gates.outlier.flatErr}, top1 ${gates.outlier.top1}, overlap ${gates.outlier.overlap}/10`);
for (const [name, v] of Object.entries(gates.perturbations)) {
  if (typeof v !== 'object') continue;
  check(`perturbation ${name}`, v.err < gates.flatInSample && v.overlap >= 9, `err ${v.err}, top-10 overlap ${v.overlap}/10`);
}

// --- repeated random half-splits (model selection evidence) ---
const rs = G.repeatedSplits({ kind: 'single', params: {} }, 40);
let s = 20261127 >>> 0;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
const flatErrs = [];
for (let r = 0; r < 40; r++) {
  const shuffled = [...calib];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  flatErrs.push(medErr(shuffled.slice(Math.floor(shuffled.length / 2)), (p) => flatPred(p, snapshot.as_of)));
}
const flatMean = r4(flatErrs.reduce((a, b) => a + b, 0) / flatErrs.length);
console.log(`repeated splits (40): model mean ${rs.mean} median ${rs.median} range ${rs.min}-${rs.max}; flat mean ${flatMean}`);
check('repeated splits beat flat on average', rs.mean < flatMean, `${rs.mean} < ${flatMean}`);

console.log(failures === 0 ? 'ALL GATES PASS' : `${failures} GATE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
