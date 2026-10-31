// Condition O for R2-O: C3's copy of C2's lib/weather-o.mjs (C2's code is not edited; coordinator ruling 3). XM's libraries come from `git archive 8f2926174
// experiments/xp-atmosphere-merit` in the C3 store, SHA-256 checked against results/ffm-covariance-calibration/xm-libraries.json, instead of C2's read-only worktree, and PRW is the experiments'
// binding. The rows are C2's: at cutoff E (UTC day D0) XM's rowsO gives daily F10.7, its 81-day mean and Ap from the most recent RSGA issued at or before D0 00:00 (GFZ observed before it);
// FFM's space-weather table keeps the observed rows (condition M, B1's) through D0 - 3 and takes rows built from rowsO from D0 - 2 on, in the form B1 gives its own forecast days, the last row
// held through the arc's end. Data preparation only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { root, store, build, sha256, c2Results, DAY } from '../common.mjs';

const dateOf = (t) => new Date(t).toISOString().slice(0, 10);

/** The snapshot directory, made once from git and checked file by file. */
export function xmSnapshot() {
  const out = path.join(store, `xm-${build.xm.commit.slice(0, 9)}`);
  const receipt = JSON.parse(fs.readFileSync(path.join(c2Results, 'xm-libraries.json')));
  if (!fs.existsSync(path.join(out, build.xm.path, 'lib/weather.mjs'))) {
    fs.mkdirSync(out, { recursive: true });
    const tar = execFileSync('git', ['-C', root, 'archive', build.xm.commit, build.xm.path], { maxBuffer: 1 << 28 });
    execFileSync('tar', ['-x', '-C', out], { input: tar });
  }
  for (const f of receipt.files.filter((x) => !x.missing)) {
    const got = sha256(fs.readFileSync(path.join(out, f.path)));
    if (got !== f.sha256) throw new Error(`XM ${f.path} differs from the receipt (${got})`);
  }
  return out;
}

/** { inputsO(inputs, cutoffMs, toMs) -> { inputs, rsga } or { excluded } }. */
export async function openWeatherO() {
  const out = xmSnapshot();
  const X = await import(pathToFileURL(path.join(out, build.xm.path, 'lib/weather.mjs')));
  return {
    provenance: { xmCommit: build.xm.commit, receipt: build.xm.receipt },
    inputsO(inputs, cutoffMs, toMs) {
      const D0 = Date.parse(`${dateOf(cutoffMs)}T00:00:00Z`);
      const frame = inputs.find((i) => i.portId === 'space_weather');
      const prw = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(frame.payload))).unpack();
      const rows = prw.SPACE_WEATHER.ROWS;
      const Row = rows[0].constructor;
      const o = X.rowsO(Date.parse(`${rows[0].DATE}T00:00:00Z`), cutoffMs);
      if (o.excluded) return { excluded: o.excluded };
      const byDate = new Map(o.rows.map((r) => [r.date, r]));
      const last = o.rows.at(-1);
      const next = [];
      for (const r of rows) {
        const t = Date.parse(`${r.DATE}T00:00:00Z`);
        if (t <= D0 - 3 * DAY) { next.push(r); continue; }
        const q = byDate.get(r.DATE) ?? last;
        next.push(Object.assign(new Row(), { ...r, F107_OBS: q.f107, F107_ADJ: -1, F107_DATA_TYPE: 2, F107_OBS_CENTER81: q.c81, F107_OBS_LAST81: q.c81, F107_ADJ_CENTER81: -1, F107_ADJ_LAST81: -1,
          AP_AVG: q.ap, AP1: -1, AP2: -1, AP3: -1, AP4: -1, AP5: -1, AP6: -1, AP7: -1, AP8: -1 }));
      }
      for (let t = Date.parse(`${rows.at(-1).DATE}T00:00:00Z`) + DAY; t <= toMs + 2 * DAY; t += DAY) next.push(Object.assign(new Row(), { ...next.at(-1), DATE: dateOf(t) }));
      const b = new flatbuffers.Builder(1 << 16);
      b.finishSizePrefixed(Object.assign(new P.PRWT(), { SPACE_WEATHER: Object.assign(new P.PRWSpaceWeatherTableT(), { ROWS: next }) }).pack(b), '$PRW');
      return { inputs: inputs.map((i) => (i === frame ? { ...frame, payload: b.asUint8Array().slice() } : i)), rsga: o.rsga };
    },
  };
}
