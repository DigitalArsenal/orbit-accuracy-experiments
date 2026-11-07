#!/usr/bin/env node
// Step 60: S3 (honest limit, LEO-L and LEO-M at s_lo) and S5 (nothing shrank, Loewner order).
//   node steps/60-s3-s5.mjs <candidates.json> <out json> <pin dir> <rows dir>...
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { regimeTables } from '../lib/tab.mjs';
import { fit, evalRow } from '../lib/fit.mjs';
import { BINS } from '../lib/bins.mjs';
import { CHI2_95, clippedMoment, quantileSorted } from '../lib/stats.mjs';
import { lamMax, eigvals, frob, full } from '../lib/linalg.mjs';
import { openPc } from '../lib/capc.mjs';

const [candFile, out, pin, ...dirs] = process.argv.slice(2);
const cand = JSON.parse(fs.readFileSync(candFile, 'utf8'));
const tabs = await regimeTables(dirs);
const CA_WASM = '0cc09d7b1399b5037392004327b40c70f76d3150ddfcd303636039a77d936a6a';
const res = { s3: {}, s5: {} };
// ---- S3 ----
const pc = await openPc(pin, CA_WASM);
for (const regime of ['LEO-L', 'LEO-M']) {
  const tab = tabs[regime], rc = cand[regime];
  const kind = rc.pick === 'R2' ? 'R2' : 'R0';
  const heldD2 = [];
  for (const c of tab.byCluster.keys()) {
    const f = fit(kind, tab, BINS.map((_, b) => tab.byBin[b].filter((i) => tab.cluster[i] !== c)));
    if (rc.pick === 'R0xc') f.cells.forEach((x) => { if (x) x.P = x.P.map((v) => v * rc.c); });
    if (!f.cells[5]) continue;
    for (const i of tab.byBin[5]) if (tab.cluster[i] === c) heldD2.push(evalRow(tab, i, f).d2);
  }
  heldD2.sort((a, b) => a - b);
  const sLo = quantileSorted(Float64Array.from(heldD2), 0.93) / CHI2_95;
  const P = rc.cells[5].P.map((v) => v * 1e6 * sLo);   // m^2 at s_lo
  const core = clippedMoment(tab.byBin[5].slice(0, 60000).map((i) => [tab.e[3 * i], tab.e[3 * i + 1], tab.e[3 * i + 2]]), 1).P;
  const pcAt = async (hbr) => {
    let best = 0, atAngle = null;
    for (let th = 10; th <= 170; th += 5) {
      const a = th * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const Rot = [[1, 0, 0], [0, c, -s], [0, s, c]], F = full(P);
      const RP = Rot.map((r) => [0, 1, 2].map((j) => r[0] * F[0][j] + r[1] * F[1][j] + r[2] * F[2][j]));
      const C = F.map((r, i) => [0, 1, 2].map((j) => r[j] + RP[i][0] * Rot[j][0] + RP[i][1] * Rot[j][1] + RP[i][2] * Rot[j][2]));
      const nrm = Math.hypot(c - 1, s), e2 = [0, s / nrm, (1 - c) / nrm];
      const Ce2 = C.map((r) => r[0] * e2[0] + r[1] * e2[1] + r[2] * e2[2]);
      const cov = [C[0][0], C[0][0] * 0 + (C[0][0] * 0 + (C[0][1] * e2[1] + C[0][2] * e2[2])), e2[0] * Ce2[0] + e2[1] * Ce2[1] + e2[2] * Ce2[2]];
      const p = await pc.pc(cov, hbr);
      if (p > best) { best = p; atAngle = th; }
    }
    return { pc: best, angleDeg: atAngle };
  };
  const r20 = await pcAt(20);
  res.s3[regime] = { pick: rc.pick, sLo, heldOutRows: heldD2.length, coreSigmaM: { R: Math.sqrt(core[0]) * 1000, T: Math.sqrt(core[3]) * 1000, N: Math.sqrt(core[5]) * 1000 },
    pc20: r20, pc10: await pcAt(10), pc30: await pcAt(30), pass: r20.pc < 1e-4, wording: 'for payload-class error; debris holds only if debris error >= payload error (V10)' };
  console.log(regime, JSON.stringify(res.s3[regime]));
}
pc.close();
// ---- S5 ----
const show = (blob) => JSON.parse(execFileSync('git', ['-C', '/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules', 'show', blob], { maxBuffer: 1 << 28 }).toString());
const e14 = show('origin/main:analysis/gp-error-model/data/e14-s3-kc.json');
const aug = JSON.parse(fs.readFileSync('/opt/data/sdn-archive/gp-error-model/2026-08/model-scaled.json', 'utf8'));
const pk = (l21) => [l21[0], l21[1], l21[3], l21[2], l21[4], l21[5]];   // lower-triangle rows (xx; yx yy; zx zy zz) -> packed
const ovl = (a, b) => a[0] < b[1] && b[0] < a[1];
const reg = Object.fromEntries(e14.regimes.map((r) => [r.id, r]));
for (const regime of Object.keys(reg)) for (let b = 0; b < BINS.length; b++) {
  const rc = cand[regime], key = `${regime}|${b}`;
  const models = [];
  const c14 = e14.strata.find((s) => s.regime === regime && s.ageIndex === b);
  if (c14) models.push({ model: 'e14-s3-kc', P: pk(c14.covariance) });
  aug.strata.forEach((s) => {
    const r8 = aug.regimes[s.regimeIndex];
    const cov = (s.clipped?.covariance?.length === 21 ? s.clipped.covariance : s.covariance);
    if (!cov || !(cov[0] > 0 && cov[2] > 0 && cov[5] > 0)) return;
    if (ovl(r8.altitudeKm, reg[regime].altitudeKm) && ovl(r8.eccentricity, reg[regime].eccentricity) && ovl(s.ageDays, BINS[b])) models.push({ model: `2026-08/${s.regimeIndex}.${s.ageIndex}`, P: pk(cov) });
  });
  if (!rc || !rc.cells?.[b]) { res.s5[key] = { c: null, note: 'no P_new for this stratum; the replaced models stay as shipped', models: models.length }; continue; }
  const Pn = rc.cells[b].P;
  const ratios = models.map((m) => lamMax(Pn, m.P));
  const c = Math.max(1, ...ratios);
  const audit = models.map((m) => { const D = Pn.map((v, i) => c * v - m.P[i]); return eigvals(D)[0] / frob(m.P); });
  res.s5[key] = { c, models: models.length, modelCells: models.map((m) => ({ model: m.model, P: m.P })), binding: models[ratios.indexOf(Math.max(...ratios))]?.model ?? null, minEigRel: Math.min(...audit, 0) === 0 && audit.length === 0 ? 0 : Math.min(...audit), pass: audit.every((x) => x >= -1e-12) && c >= 1 };
}
fs.writeFileSync(out, `${JSON.stringify(res, null, 1)}\n`);
console.log('S5 strata', Object.keys(res.s5).length, 'fail', Object.values(res.s5).filter((x) => x.pass === false).length);
