// Y2's values (PLAN.md section 4), from the dev span only: for a block, y = - sum(s T0) / sum(s^2) over its dev windows' primary samples at L = 24, 48, 72 h against ESA, with T0 the base's along-track error and
// s = T(Yt) - T0, FFM's own response to +1 nm/s^2. Rounded to 0.001 nm/s^2. No test-span row is read, and no Y1, Y2 or Yx row exists when this runs. Statistics only.
//   node experiments/ffm-galileo-y-bias/dev.mjs     experiments/ffm-galileo-y-bias/dev-values.json, committed on the wip branch before the next phase
import fs from 'node:fs';
import path from 'node:path';
import { config, store, dir, registered, baseRows, spanOf, Opened, readJsonl } from './common.mjs';
import { openPrimary } from './lib/primary.mjs';

const errT = (r, L) => r.leads?.find((l) => l.L === L && l.errRtnM)?.errRtnM[1] ?? null;
export function computeDevValues(opened) {
  const dirRows = path.join(store, 'rows'), P = openPrimary(opened), base = baseRows(opened);
  const Yt = fs.readdirSync(dirRows).filter((f) => /^dev\.s\d+\.jsonl$/.test(f)).sort().flatMap((f) => readJsonl(path.join(dirRows, f))).filter((r) => r.arm === 'Yt');
  const out = { rule: config.devValue.rule, valuesNmS2: {}, detail: {} };
  for (const block of Object.keys(config.blocks)) {
    let ss = 0, st = 0, n = 0, windows = 0;
    for (const r of Yt.filter((x) => x.block === block && x.span === 'dev' && x.fit?.ok)) {
      const b = base.get(`${r.norad}|${r.E}`);
      if (!b?.fit?.ok || spanOf(Date.parse(b.E)) !== 'dev') continue;
      let used = false;
      for (const L of config.devValue.leads_h) {
        const t0 = errT(b, L), t = errT(r, L);
        if (t0 === null || t === null || !P.primary(b, L)) continue;
        const s = t - t0; // per +1 nm/s^2
        ss += s * s; st += s * t0; n += 1; used = true;
      }
      if (used) windows += 1;
    }
    const y = -st / ss;
    out.valuesNmS2[block] = Number(y.toFixed(3));
    out.detail[block] = { windows, samples: n, unrounded: Number(y.toPrecision(6)) };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  registered();
  const v = computeDevValues(new Opened());
  fs.writeFileSync(path.join(dir, 'dev-values.json'), `${JSON.stringify(v, null, 1)}\n`);
  console.log(JSON.stringify(v));
}
