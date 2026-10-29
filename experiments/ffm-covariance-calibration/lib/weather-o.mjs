// Weather condition O for R1/R2 (PLAN.md 3.3; P4: part 1a's own rule O' is not reproducible at C2's cutoffs, so XM's RSGA condition O
// applies; C2-A4 point 7: XM's libraries imported read-only at 8f2926174, results/ffm-covariance-calibration/xm-libraries.json).
// At cutoff E (UTC day D0): XM rowsO gives daily F10.7, its 81-day mean and Ap from the most recent RSGA issued at or before D0 00:00
// (GFZ observed before it); FFM's space-weather table keeps the observed rows (condition M, B1's) through D0 - 3 and takes rows built
// from rowsO from D0 - 2 on, in the form B1 gives its own forecast days (F10.7 data type 2, 3-hourly ap and Kp -1, daily Ap), the last
// row held through the arc's end. Data preparation only.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { sha256 } from '../common.mjs';

const XM_ROOT = '/Users/tj/software/worktrees/orbit-accuracy-experiments--c2-xm-readonly-8f2926174';
const XM_SHA = '8f2926174b68e5bc1559cfce6f9ed6256680fbe8';
const DAY = 86400e3;
const dateOf = (t) => new Date(t).toISOString().slice(0, 10);

/** { inputsO(inputs, cutoffMs, toMs) -> inputs with the space_weather frame replaced, or { excluded } ; provenance }. */
export async function openWeatherO(links) {
  const receipt = JSON.parse(fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../results/ffm-covariance-calibration/xm-libraries.json')));
  for (const f of receipt.files.filter((x) => !x.missing)) {
    const got = sha256(fs.readFileSync(path.join(XM_ROOT, f.path)));
    if (got !== f.sha256) throw new Error(`XM ${f.path} differs from the receipt (${got})`);
  }
  const X = await import(pathToFileURL(path.join(XM_ROOT, 'experiments/xp-atmosphere-merit/lib/weather.mjs')));
  const req = createRequire(path.join(fs.realpathSync(path.join(links, 'analysis/od')), 'package.json'));
  const P = await import(pathToFileURL(path.join(path.dirname(req.resolve('spacedatastandards.org/package.json')), 'lib/js/PRW/main.js')));
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')));
  return {
    provenance: { xmSha: XM_SHA, receipt: 'xm-libraries.json' },
    inputsO(inputs, cutoffMs, toMs) {
      const D0 = Date.parse(`${dateOf(cutoffMs)}T00:00:00Z`);
      const frame = inputs.find((i) => i.portId === 'space_weather');
      const root = P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(frame.payload))).unpack();
      const rows = root.SPACE_WEATHER.ROWS;
      const Row = rows[0].constructor; // the table's row type (SPW)
      const o = X.rowsO(Date.parse(`${rows[0].DATE}T00:00:00Z`), cutoffMs);
      if (o.excluded) return { excluded: o.excluded };
      const byDate = new Map(o.rows.map((r) => [r.date, r]));
      const last = o.rows.at(-1);
      const out = [];
      for (const r of rows) {
        const t = Date.parse(`${r.DATE}T00:00:00Z`);
        if (t <= D0 - 3 * DAY) { out.push(r); continue; }
        const q = byDate.get(r.DATE) ?? last;
        out.push(Object.assign(new Row(), { ...r, F107_OBS: q.f107, F107_ADJ: -1, F107_DATA_TYPE: 2, F107_OBS_CENTER81: q.c81, F107_OBS_LAST81: q.c81, F107_ADJ_CENTER81: -1, F107_ADJ_LAST81: -1,
          AP_AVG: q.ap, AP1: -1, AP2: -1, AP3: -1, AP4: -1, AP5: -1, AP6: -1, AP7: -1, AP8: -1 }));
      }
      for (let t = Date.parse(`${rows.at(-1).DATE}T00:00:00Z`) + DAY; t <= toMs + 2 * DAY; t += DAY) out.push(Object.assign(new Row(), { ...out.at(-1), DATE: dateOf(t) }));
      const b = new fb.Builder(1 << 16);
      b.finishSizePrefixed(Object.assign(new P.PRWT(), { SPACE_WEATHER: Object.assign(new P.PRWSpaceWeatherTableT(), { ROWS: out }) }).pack(b), '$PRW');
      return { inputs: inputs.map((i) => (i === frame ? { ...frame, payload: b.asUint8Array().slice() } : i)), rsga: o.rsga };
    },
  };
}
