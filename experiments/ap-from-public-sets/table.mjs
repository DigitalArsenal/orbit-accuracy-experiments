#!/usr/bin/env node
// The table of experiments/ap-from-public-sets (PLAN.md): per-set rows in the store become aggregates under results/.
// No per-set or per-satellite row leaves the store.
//   node experiments/ap-from-public-sets/table.mjs --part 1            writes results/ap-from-public-sets/part1/{table.json,README.md}
//   node experiments/ap-from-public-sets/table.mjs --part 1 --check    rebuilds from the store and compares with the committed table
//   --label as-registered                                              reads <store>/part1-as-registered, writes results/.../part1-as-registered (amendment A1)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONFIG, REPO, median, ratioWithInterval, verdict } from './lib.mjs';

const argv = process.argv.slice(2);
const partId = argv.includes('--part') ? argv[argv.indexOf('--part') + 1] : null;
if (!CONFIG.parts[partId]) throw new Error('usage: table.mjs --part 1|2 [--check]');
const CHECK = argv.includes('--check');
const label = argv.includes('--label') ? `-${argv[argv.indexOf('--label') + 1]}` : '';
if (label && !/^-[a-z0-9-]+$/.test(label)) throw new Error('--label takes lower-case letters, digits and hyphens');
const store = path.join(CONFIG.store, `part${partId}${label}`);
const outDir = path.join(REPO, 'results/ap-from-public-sets', `part${partId}${label}`);
const files = fs.existsSync(store) ? fs.readdirSync(store).filter((f) => /^rows-s\d+of\d+\.jsonl$/.test(f)).sort() : [];
if (!files.length) { console.log(`SKIPPED, not a pass: no rows in ${store}`); process.exit(1); }
const shards = Number(/of(\d+)/.exec(files[0])[1]);
if (files.length !== shards) throw new Error(`${files.length} of ${shards} shard files in ${store}`);
const rows = files.flatMap((f) => fs.readFileSync(path.join(store, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const manifests = files.map((f) => JSON.parse(fs.readFileSync(path.join(store, f.replace('rows-', 'manifest-').replace('.jsonl', '.json')), 'utf8')));
const same = (key) => { const v = new Set(manifests.map((m) => m[key])); if (v.size !== 1) throw new Error(`shards disagree on ${key}`); return [...v][0]; };

const ARMS = ['B3', 'C5', 'D5', 'S'];
const DAYS = CONFIG.scoring.days;
/** The served record of a row: D5 when it exists, else B3, else the set itself. Decided without truth. */
const served = (row) => (row.arms?.D5 ? 'D5' : row.arms?.B3 ? 'B3' : 'A');
const armOf = (row, arm) => (arm === 'S' ? row.arms?.[served(row)] : row.arms?.[arm]);
const km = (x) => (x == null ? null : Number(x.toFixed(4)));
const num = (x) => (x == null ? null : Number(x.toFixed(3)));

function block(list) {
  const sats = new Set(list.map((r) => r.norad));
  const out = { sets: list.length, satellites: sats.size, errors: list.filter((r) => r.error).length, withHistory: list.filter((r) => r.history).length, arms: {} };
  for (const arm of ARMS) {
    const a = { missing: 0, fitResidualMedianM: null, primary: null, days: [] };
    if (arm === 'S') a.servedAs = { D5: 0, B3: 0, A: 0 };
    const pairs = [], eA = [], eArm = [], resid = [];
    for (const r of list) {
      if (r.error || !r.arms?.A) continue;
      if (arm === 'S') a.servedAs[served(r)] += 1;
      const x = armOf(r, arm);
      if (!x) { a.missing += 1; continue; }
      if (arm !== 'S' && r.fit?.[arm]?.rmsM != null) resid.push(r.fit[arm].rmsM);
      if (r.arms.A.primary == null || x.primary == null || !(r.arms.A.primary > 0)) continue;
      pairs.push({ sat: r.norad, x: Math.log(x.primary / r.arms.A.primary) }); eA.push(r.arms.A.primary); eArm.push(x.primary);
    }
    const stat = ratioWithInterval(pairs);
    a.fitResidualMedianM = resid.length ? Math.round(median(resid)) : null;
    a.primary = { sets: stat.sets, satellites: stat.satellites, setKm: km(median(eA)), armKm: km(median(eArm)), ratio: num(stat.ratio), lo: num(stat.lo), hi: num(stat.hi),
      shareCloser: num(stat.shareCloser), satellitesCloser: stat.satellitesCloser, verdict: verdict(stat) };
    for (let d = 0; d < DAYS; d += 1) {
      const p = [], da = [], db = [];
      for (const r of list) {
        const x = armOf(r, arm), y = r.arms?.A;
        if (r.error || !x || !y || x.days[d] == null || y.days[d] == null || !(y.days[d] > 0)) continue;
        p.push({ sat: r.norad, x: Math.log(x.days[d] / y.days[d]) }); da.push(y.days[d]); db.push(x.days[d]);
      }
      const s = ratioWithInterval(p);
      a.days.push({ day: d + 1, sets: s.sets, setKm: km(median(da)), armKm: km(median(db)), ratio: num(s.ratio), lo: num(s.lo), hi: num(s.hi), shareCloser: num(s.shareCloser) });
    }
    out.arms[arm] = a;
  }
  return out;
}

const table = {
  experiment: CONFIG.experiment, part: Number(partId), span: CONFIG.parts[partId],
  build: CONFIG.build, weatherForecasterSha256: same('weatherForecasterSha256'),
  configSha256: same('configSha256'), runnerSha256: same('runnerSha256'), libSha256: same('libSha256'),
  repositoryCommit: same('repositoryCommit'), modulesCommit: same('modulesCommit'), wasmSha256: same('wasmSha256'),
  truthFiles: manifests.reduce((s, m) => s + m.truthFiles, 0),
  truthFilesSha256: crypto.createHash('sha256').update(manifests.map((m) => m.truthFilesSha256).join('\n')).digest('hex'),
  counts: { sets: rows.length, satellites: new Set(rows.map((r) => r.norad)).size, withoutScoredFirstDay: manifests.reduce((s, m) => s + m.counts.noTruth, 0), truthStatesScreenedOut: manifests.reduce((s, m) => s + m.counts.screenedStates, 0), errors: rows.filter((r) => r.error).length },
  classes: Object.fromEntries(CONFIG.classes.map((c) => [c, block(rows.filter((r) => r.cls === c))])),
  families: Object.fromEntries([...new Set(rows.map((r) => r.family))].sort().map((f) => [f, block(rows.filter((r) => r.family === f))])),
  all: block(rows),
};
// The catalog rule of the plan: a class is served on AP when the served record's verdict is BEATS.
table.catalog = Object.fromEntries(CONFIG.classes.map((c) => { const v = table.classes[c].arms.S.primary.verdict; return [c, { verdict: v, serve: v === 'BEATS' ? 'AP' : 'SGP4' }]; }));

const cell = (p) => (p.ratio == null ? 'no pairs' : `${p.ratio.toFixed(2)}${p.lo == null ? '' : ` (${p.lo.toFixed(2)} to ${p.hi.toFixed(2)})`}`);
const md = [];
md.push(`# AP records made from public sets against the sets themselves: part ${partId}${label ? ` (${label.slice(1).replace(/-/g, ' ')})` : ''}`, '');
md.push(`Generated by \`experiments/ap-from-public-sets/table.mjs\` from the run's rows; nothing here is typed. Plan: \`experiments/ap-from-public-sets/PLAN.md\`.`, '');
md.push(`Sets with epochs from ${CONFIG.parts[partId].from.slice(0, 10)} to ${CONFIG.parts[partId].to.slice(0, 10)}: ${table.counts.sets} sets of ${table.counts.satellites} satellites with truth; ${table.counts.withoutScoredFirstDay} more sets had no scored first day; ${table.counts.errors} errors; ${table.counts.truthStatesScreenedOut} truth states dropped by the truth gate's jump screen. Module ${CONFIG.build.module} ${CONFIG.build.version} (\`${table.wasmSha256.slice(0, 12)}\`).`, '');
md.push('Each figure is the error of the AP record over the error of the set on SGP4, paired by set, median, with the 95 % interval from resampling satellites. Below 1 the AP record is closer to truth. The error is the root mean square of 3D position over the 72 hours after the set\'s epoch.', '');
md.push('## By orbit class: the served record', '', '| Class | Satellites | Sets | Set on SGP4 (km) | AP record (km) | Ratio | AP closer | Verdict | Catalog serves |', '| --- | --: | --: | --: | --: | --- | --: | --- | --- |');
for (const c of CONFIG.classes) {
  const b = table.classes[c], p = b.arms.S.primary;
  md.push(`| ${c} | ${p.satellites} | ${p.sets} | ${p.setKm ?? ''} | ${p.armKm ?? ''} | ${cell(p)} | ${p.shareCloser == null ? '' : `${Math.round(100 * p.shareCloser)} %`} | ${p.verdict} | ${table.catalog[c].serve} |`);
}
md.push('', 'Served record: the history-and-forecast fit (D5) when the set has a history, else the forecast-only fit (B3), else the set itself.', '');
md.push('## By orbit class: each construction', '', '| Class | B3: current set only | C5: history only | D5: history and current set | Served as D5 / B3 / set |', '| --- | --- | --- | --- | --- |');
for (const c of CONFIG.classes) {
  const b = table.classes[c], s = b.arms.S.servedAs;
  md.push(`| ${c} | ${['B3', 'C5', 'D5'].map((a) => `${cell(b.arms[a].primary)} ${b.arms[a].primary.verdict}`).join(' | ')} | ${s.D5} / ${s.B3} / ${s.A} |`);
}
md.push('', '## By day from the set\'s epoch: the served record', '', `| Class | ${Array.from({ length: DAYS }, (_, d) => `Day ${d + 1}`).join(' | ')} |`, `| --- | ${Array.from({ length: DAYS }, () => '---').join(' | ')} |`);
for (const c of CONFIG.classes) md.push(`| ${c} | ${table.classes[c].arms.S.days.map((d) => cell(d)).join(' | ')} |`);
md.push('', '## By truth source: the served record', '', '| Truth | Satellites | Sets | Set on SGP4 (km) | AP record (km) | Ratio | Verdict |', '| --- | --: | --: | --: | --: | --- | --- |');
for (const [f, b] of Object.entries(table.families)) { const p = b.arms.S.primary; md.push(`| ${f} | ${p.satellites} | ${p.sets} | ${p.setKm ?? ''} | ${p.armKm ?? ''} | ${cell(p)} | ${p.verdict} |`); }
md.push('', 'Verdict: BEATS when the whole interval is below 1, LOSES when it is above 1, TIE when it spans 1, FEW under 5 satellites or 30 sets.', '');
const text = `${md.join('\n')}\n`, json = `${JSON.stringify(table, null, 1)}\n`;

if (CHECK) {
  const committed = fs.existsSync(path.join(outDir, 'table.json')) ? fs.readFileSync(path.join(outDir, 'table.json'), 'utf8') : null;
  const ok = committed === json && fs.readFileSync(path.join(outDir, 'README.md'), 'utf8') === text;
  console.log(ok ? `CHECK PASSED: part ${partId} table rebuilt from ${rows.length} rows equals the committed table` : 'CHECK FAILED: the committed table differs from the table rebuilt from the store');
  process.exit(ok ? 0 : 1);
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'table.json'), json);
fs.writeFileSync(path.join(outDir, 'README.md'), text);
console.log(text);
