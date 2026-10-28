// Parts 3 and 4 of B2 (A2, A4, A5, A6) for one group: the lead records of its windows (SGP4-XP and FFM with their covariances, the operator
// forecast's error, the public set's SGP4 with V1c5 frozen, uncalibrated and V1c4 best covariances) -> part 3's realism cells, then part 4's
// encounters per secondary class (GP; precise where the group has more than one object) with Pc by analysis/conjunction-assessment
// compute_pc, the rates, paired differences, Pc calls and verdict. Encounter rows under <store>/rows/ca-encounters.<group>.<class>.jsonl,
// the group's summary under <store>/rows/ca.<group>.json (read by table.mjs). Drawing, counting and resampling only.
//   node experiments/sdn-ap-mixed-screening/part4-ca.mjs --group iss|laser|starlink
import fs from 'node:fs';
import path from 'node:path';
import { store, args, frozen, readJsonl, write, sha256, g1Dir, root } from './common.mjs';

frozen();
const { LEADS, encounters, summarize, realismCell, pcClient } = await import('./lib/ca.mjs');
const SOURCES = { iss: { leads: 'iss-leads.', gp: 'iss-gp.', key: (r) => r.file, object: () => 'ISS' }, laser: { leads: 'laser-leads.', gp: 'laser-gp.', key: (r) => `${r.norad}|${r.cutoff}`, object: (r) => r.target }, starlink: { leads: 'starlink-leads.', gp: 'starlink-gp.', key: (r) => String(r.norad), object: (r) => String(r.norad) } };
const rowsOf = (prefix) => { const d = path.join(store, 'rows'); return fs.readdirSync(d).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).sort().flatMap((f) => readJsonl(path.join(d, f))); };

/** The group's windows: { object, key, leads: { L: { ffm, sgp4xp, forecast, gp, gpLabels } } } from its lead and GP rows. `ffm` names the
 *  lead field in the FFM slot: 'ffm' (A3 as registered) or, for Starlink, 'ffm3' (A12 point 12, the FFM arm of record). */
export function windowsOf(group, ffm = 'ffm') {
  const S = SOURCES[group];
  if (!S) throw new Error('--group iss|laser|starlink');
  const leadRows = rowsOf(S.leads).filter((r) => !r.excluded), gpRows = new Map(rowsOf(S.gp).filter((r) => r.gp).map((r) => [S.key(r), r.gp]));
  const inputs = sha256(Buffer.from(JSON.stringify([leadRows, [...gpRows.entries()]])));
  if (ffm !== 'ffm' && group !== 'starlink') throw new Error('--ffm ffm3 is part 1a\'s (Starlink) only');
  const windows = leadRows.map((r) => {
    const g = gpRows.get(S.key(r));
    const leads = Object.fromEntries(LEADS.map((L) => [L, {
      ...(r.sgp4xp?.[L] ? { sgp4xp: r.sgp4xp[L] } : {}), ...(r[ffm]?.[L] ? { ffm: r[ffm][L] } : {}), ...(r.forecast?.[L] ? { forecast: r.forecast[L] } : {}),
      ...(g?.leads?.[L]?.v1c5?.cov ? { gp: g.leads[L].v1c5 } : {}), ...(g?.leads?.[L] ? { gpLabels: g.leads[L] } : {}),
    }]));
    return { object: S.object(r), key: S.key(r), leads, gpTier: g?.tier ?? null, gpFlagged: g?.flagged ?? null };
  });
  return { windows, inputs, leadRows: leadRows.length, gpRows: gpRows.size, gpExcluded: tally(rowsOf(S.gp).map((r) => r.gp?.excluded ?? (r.excluded ? `window excluded: ${r.excluded.replace(/^planned burn .*/, 'a planned burn')}` : 'recorded'))) };
}
const tally = (values) => Object.fromEntries([...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]));

/** Part 3: per covariance and lead, the realism cell over the group's windows. */
export function realism(group, windows) {
  const labels = { ffm: (l) => l.ffm, sgp4xp: (l) => l.sgp4xp, v1c5: (l) => l.gpLabels?.v1c5, uncalibrated: (l) => l.gpLabels?.uncalibrated, v1c4: (l) => l.gpLabels?.v1c4 };
  return Object.fromEntries(Object.entries(labels).map(([label, pick]) => [label, Object.fromEntries(LEADS.map((L) => [L, realismCell(windows.flatMap((w) => { const r = pick(w.leads[L] ?? {}); return r && Number.isFinite(r.d2) ? [{ object: w.object, d2: r.d2 }] : []; }), `B2|part3|${group}|${label}|${L}`)]))]));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { loadModule } = await import(path.join(root, 'harness/modules.mjs'));
  const { modulesRoot } = await import(path.join(g1Dir, 'lib/modules.mjs'));
  const ca = await loadModule(modulesRoot(), 'analysis/conjunction-assessment');
  const pc = pcClient(ca);
  const group = args.group, ffm = args.ffm ?? 'ffm';
  const label = ffm === 'ffm' ? group : `${group}.${ffm}`; // the draws stay the group's (seeds B2|part4|<group>|...), so the two FFM slots meet the same encounters
  const { windows, inputs, leadRows, gpRows, gpExcluded } = windowsOf(group, ffm);
  const summary = { group, ffmArm: ffm, inputs, leadRows, gpRows, gpExcluded, objects: new Set(windows.map((w) => w.object)).size, realism: realism(group, windows), classes: {} };
  const classes = summary.objects > 1 ? ['gp', 'precise'] : ['gp'];
  for (const cls of classes) {
    const t0 = Date.now();
    const { rows, counts } = await encounters(group, cls, windows, pc);
    const file = path.join(store, 'rows', `ca-encounters.${label}.${cls}.jsonl`);
    fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    summary.classes[cls] = summarize(group, cls, rows, counts);
    console.error(`part 4 ${group} ${cls}: ${rows.length} encounters (${counts.noPrimary} without a primary, ${counts.noSecondary} without a secondary), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  write(path.join(store, 'rows', `ca.${label}.json`), summary);
  await ca.destroy?.();
  process.exit(0);
}
