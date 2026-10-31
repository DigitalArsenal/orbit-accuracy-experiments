// The E2E (PLAN.md section 6, C3-A8): one stored cal/val window per class through the arc-disjoint chain, its reference fits and axes-mle-ref, compared bit for bit: the stored row (fit, terms, errors, references) replayed by
// the pin, and d2, g and u of the frozen constants against results/ffm-covariance-adaptive/e2e-expected.json. FFM: RK78, relative tolerance 1e-10, steps up to 120 s; fit track 600 s; outputs at the six leads and the 600 s noise grid.
//   node experiments/ffm-covariance-adaptive/run.mjs --check [--write]
import fs from 'node:fs';
import path from 'node:path';
import { config, store, args, results, Opened, readJsonl, iso } from './common.mjs';
import { loadClass, samplesOf } from './lib/windows.mjs';
import { compose, d2Of } from './lib/compose.mjs';

const strip = (r) => { const { seconds, secondsTotal, ...rest } = r; return rest; };
export async function check() {
  const opened = new Opened();
  const { openSession, runWindow } = await import('./run.mjs');
  const rowsDir = path.join(store, 'rows');
  const rows = fs.readdirSync(rowsDir).filter((f) => f.startsWith('validation.')).sort().flatMap((f) => readJsonl(path.join(rowsDir, f)));
  const pick = (cls) => rows.filter((r) => r.cls === cls && r.fit?.ok && r.leads?.filter((l) => l.errRtnM && l.ref).length >= 3).sort((a, b) => (a.E < b.E ? -1 : a.E > b.E ? 1 : a.norad - b.norad))[0];
  const S = await openSession(opened, { fromMs: Date.parse('2026-03-20T00:00:00Z'), toMs: Date.parse('2026-06-15T00:00:00Z'), allowedToMs: Date.parse('2026-06-15T00:00:00Z') });
  const failures = [];
  const seen = new Set();
  for (const cls of ['R3', 'R2-M']) {
    const r = pick(cls), got = await runWindow(S, r.norad, Date.parse(r.E), 'validation');
    for (const g of got) {
      const stored = rows.find((x) => x.cls === g.cls && x.norad === g.norad && x.E === g.E);
      seen.add(g.cls);
      if (JSON.stringify(strip(g)) !== JSON.stringify(strip(stored))) failures.push(`${g.cls} ${g.norad} ${g.E}: the replayed row differs from the stored row`);
    }
  }
  const frozen = JSON.parse(fs.readFileSync(path.join(results, 'frozen-constants.json')));
  const expectedFile = path.join(results, 'e2e-expected.json');
  const out = {};
  for (const cls of ['R3', 'R2-M', 'R2-O']) {
    const K = frozen.classes[cls], D = loadClass(cls), r = pick(cls);
    const all = samplesOf(D).filter((s) => s.w.norad === r.norad && iso(s.w.E) === r.E);
    const c = compose(all, { a0: K.a0, a1: K.a1, n0: K.n0, kappa: K.kappa, useG: true, useU: true, history: K.history }), d2 = await d2Of(c);
    const A = K.referenceArm, cr = compose(all, { a0: A.a0, a1: A.a1, n0: A.n0, kappa: A.kappa, useG: true, useU: true, kRef: A.kRef, history: 'reference' }), d2r = await d2Of(cr);
    out[cls] = { norad: r.norad, E: r.E, leads: c.map((s, i) => ({ L: s.l.L, d2: d2[i], g: s.g, u: s.u, reference: { d2: d2r[i], g: cr[i].g, u: cr[i].u } })) };
  }
  if (args.write) { fs.writeFileSync(expectedFile, `${JSON.stringify(out, null, 1)}\n`); console.log(`wrote ${expectedFile}`); }
  else if (JSON.stringify(out) !== JSON.stringify(JSON.parse(fs.readFileSync(expectedFile)))) failures.push('d2, g or u differ from e2e-expected.json');
  if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
  console.log(`C3 --check: ${[...seen].join(', ')} windows replayed bit for bit (fit, terms, errors, references); d2, g and u of ${Object.keys(out).join(', ')} equal, in the model and in the reference arm`);
}
