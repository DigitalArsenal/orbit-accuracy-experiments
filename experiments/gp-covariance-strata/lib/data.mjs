// Dev rows as columns (Float64), cached next to the rows in the scratch directory. Never written to the repository.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { REGIMES } from './bins.mjs';
import { FIXED, gnssClusters } from './clusters.mjs';
import { auditRetained, HoldAudit } from './holds.mjs';

export const COLS = ['norad', 'setMs', 't', 'b', 'k', 'age', 'eR', 'eT', 'eN', 'vR', 'vT', 'vN', 'regime', 'cluster', 'gnss'];
export async function loadRows(scratch) {
  const cache = path.join(scratch, 'cols.json.gz');
  if (fs.existsSync(cache)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(cache)));
  const rows = [];
  const sp3Of = new Map();
  for (const f of fs.readdirSync(scratch).filter((n) => /^rows-w\d+\.jsonl\.gz$/.test(n)).sort()) {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(scratch, f)).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    for await (const line of rl) { if (!line) continue; const r = JSON.parse(line); rows.push(r); if (r.sp3 && r.gnss) sp3Of.set(r.norad, r.sp3[0]); }
  }
  // GNSS plane clusters from the ascending node and inclination of one set per object (the first, in time order)
  const planeInput = JSON.parse(fs.readFileSync(path.join(scratch, 'plane-input.json'), 'utf8'));
  const gc = gnssClusters(planeInput.map((p) => ({ ...p, sys: sp3Of.get(p.norad) })).filter((p) => p.sys));
  const clusterNames = []; const cid = (n) => { let i = clusterNames.indexOf(n); if (i < 0) { clusterNames.push(n); i = clusterNames.length - 1; } return i; };
  const out = Object.fromEntries(COLS.map((c) => [c, new Array(rows.length)]));
  rows.forEach((r, i) => {
    out.norad[i] = r.norad; out.setMs[i] = r.setMs; out.t[i] = r.t; out.b[i] = r.b; out.k[i] = r.k; out.age[i] = r.age;
    [out.eR[i], out.eT[i], out.eN[i], out.vR[i], out.vT[i], out.vN[i]] = r.rtn;
    out.regime[i] = r.regime ? REGIMES.indexOf(r.regime) : -1;
    out.cluster[i] = cid(FIXED[r.norad] ?? gc.get(r.norad) ?? `solo-${r.norad}`);
    out.gnss[i] = r.gnss;
  });
  out.clusterNames = clusterNames;
  fs.writeFileSync(cache, zlib.gzipSync(JSON.stringify(out)));
  return out;
}
