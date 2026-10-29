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
const { LEADS, encounters, summarize, realismCell, pcClient, a13Scores, realismCellC2 } = await import('./lib/ca.mjs');
/** A13 (part 5 point 4): the lead rows, the field in the FFM slot and the calibrated arms of each run. */
export const A13RUNS = {
  'iss.a13': { group: 'iss', leads: 'iss-leads3.', ffm: 'ffm3', extras: { ffmCal: 'ffm3Cal', sgp4xpCal: 'sgp4xpCal' } },
  'laser.a13': { group: 'laser', leads: 'laser-leads3.', ffm: 'ffm', extras: { ffmCal: 'ffmCal', ffmCalLP: 'ffmCalLP', ffmCalR2: 'ffmCalR2', sgp4xpCal: 'sgp4xpCal' } },
  starlink: { group: 'starlink', leads: 'starlink-leads.', ffm: 'ffm', extras: { sgp4xpCal: 'sgp4xpCal' } },
  'starlink.ffm3': { group: 'starlink', leads: 'starlink-leads.', ffm: 'ffm3', extras: { ffmCal: 'ffm3Cal', sgp4xpCal: 'sgp4xpCal' } },
};
const SOURCES = { iss: { leads: 'iss-leads.', gp: 'iss-gp.', key: (r) => r.file, object: () => 'ISS' }, laser: { leads: 'laser-leads.', gp: 'laser-gp.', key: (r) => `${r.norad}|${r.cutoff}`, object: (r) => r.target }, starlink: { leads: 'starlink-leads.', gp: 'starlink-gp.', key: (r) => String(r.norad), object: (r) => String(r.norad) } };
const rowsOf = (prefix) => { const d = path.join(store, 'rows'); return fs.readdirSync(d).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).sort().flatMap((f) => readJsonl(path.join(d, f))); };

/** The group's windows: { object, key, leads: { L: { ffm, sgp4xp, forecast, gp, gpLabels } } } from its lead and GP rows. `ffm` names the
 *  lead field in the FFM slot: 'ffm' (A3 as registered) or, for Starlink, 'ffm3' (A12 point 12, the FFM arm of record). */
export function windowsOf(group, ffm = 'ffm', run = null) {
  const S = run ? { ...SOURCES[group], leads: run.leads } : SOURCES[group];
  if (!S) throw new Error('--group iss|laser|starlink');
  // A12 point 2: with A3 in the FFM slot, A3's round-2-refused windows (the round-1 product kept) count as failed fits: no FFM record
  const roundOne = group === 'starlink' && ffm === 'ffm' ? new Set(rowsOf('starlink-ffm.').filter((r) => r.ffm?.ok && r.ffm.stoppedBy).map((r) => r.norad)) : new Set();
  const leadRows = rowsOf(S.leads).filter((r) => !r.excluded).map((r) => (roundOne.has(r.norad) ? { ...r, ffm: { error: 'A3 round 2 refused (counted failed, A12 point 2)' } } : r)), gpRows = new Map(rowsOf(S.gp).filter((r) => r.gp).map((r) => [S.key(r), r.gp]));
  const inputs = sha256(Buffer.from(JSON.stringify([leadRows, [...gpRows.entries()]])));
  if (!run && ffm !== 'ffm' && group !== 'starlink') throw new Error('--ffm ffm3 is part 1a\'s (Starlink) only');
  const windows = leadRows.map((r) => {
    const g = gpRows.get(S.key(r));
    const leads = Object.fromEntries(LEADS.map((L) => [L, {
      ...(r.sgp4xp?.[L] ? { sgp4xp: r.sgp4xp[L] } : {}), ...(r[ffm]?.[L] ? { ffm: r[ffm][L] } : {}),
      ...Object.fromEntries(Object.entries(run?.extras ?? {}).filter(([, f]) => r[f]?.[L]).map(([arm, f]) => [arm, r[f][L]])), ...(r.forecast?.[L] ? { forecast: r.forecast[L] } : {}),
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
  // --a13 <run> (A13): one of A13RUNS, the registered A5 figures on A5's pools plus the calibrated arms on the same encounters
  const run = args.a13 ? A13RUNS[args.a13] : null;
  if (args.a13 && !run) throw new Error(`--a13 ${Object.keys(A13RUNS).join('|')}`);
  const group = run ? run.group : args.group, ffm = run ? run.ffm : args.ffm ?? 'ffm';
  const label = run ? args.a13 : ffm === 'ffm' ? group : `${group}.${ffm}`; // the draws stay the group's (seeds B2|part4|<group>|...), so the two FFM slots meet the same encounters
  const extraArms = Object.keys(run?.extras ?? {});
  const { windows, inputs, leadRows, gpRows, gpExcluded } = windowsOf(group, ffm, run);
  // A13 part 6 point 2: per arm, the windows attempted, the records written and the refusals by message (the list in the receipt). A
  // record missing because the arm it derives from failed (a calibrated covariance without its A5 records; laser's L-P and R2 beside a
  // refused L run) takes that failure; A3's round-2-refused windows are failures counted apart (A12 point 2).
  const REFUSED = /^(refused by propagator\/ffm|propagator\/ffm invoke)/;
  const roundOneA3 = group === 'starlink' && ffm === 'ffm' ? new Set(rowsOf('starlink-ffm.').filter((r) => r.ffm?.ok && r.ffm.stoppedBy).map((r) => r.norad)) : new Set();
  const refusals = run ? Object.fromEntries([['ffm', ffm], ['sgp4xp', 'sgp4xp'], ...Object.entries(run.extras)].map(([arm, field]) => {
    const rowsAll = rowsOf(run.leads).filter((r) => !r.excluded);
    const parent = field === 'ffmCalLP' || field === 'ffmCalR2' ? 'ffmCal' : /Cal$/.test(field) ? (field === 'sgp4xpCal' ? 'sgp4xp' : ffm) : null;
    const stateOf = (r) => {
      if (field === 'ffm' && roundOneA3.has(r.norad)) return { kind: 'roundOne', message: 'A3 round 2 refused (counted failed, A12 point 2)' };
      let x = r[field];
      if ((!x || x.error) && parent && (r[parent]?.error || !r[parent])) x = { error: r[parent]?.error ?? `no ${parent} records` };
      if (!x) return { kind: 'other', message: 'no record' };
      if (x.error) return REFUSED.test(x.error) ? { kind: 'refused', message: x.error } : { kind: 'other', message: x.error.slice(0, 120) };
      return Object.keys(x).some((q) => /^\d+$/.test(q)) ? { kind: 'written' } : { kind: 'other', message: 'no lead epoch' };
    };
    const st = rowsAll.map((r) => ({ key: SOURCES[group].key(r), ...stateOf(r) }));
    const tally = (kind) => st.filter((x) => x.kind === kind).reduce((m, x) => { m[x.message] = (m[x.message] ?? 0) + 1; return m; }, {});
    const refused = st.filter((x) => x.kind === 'refused');
    return [arm, { field, attempted: rowsAll.length, written: st.filter((x) => x.kind === 'written').length, refused: refused.length, refusalRate: rowsAll.length ? refused.length / rowsAll.length : 0,
      byMessage: tally('refused'), roundOneCountedFailed: st.filter((x) => x.kind === 'roundOne').length, otherFailures: tally('other'), refusedWindows: refused.map((x) => x.key) }];
  })) : null;
  const summary = { group, ffmArm: ffm, ...(run ? { a13: { run: args.a13, extraArms }, refusals } : {}), inputs, leadRows, gpRows, gpExcluded, objects: new Set(windows.map((w) => w.object)).size, realism: realism(group, windows), classes: {} };
  const classes = summary.objects > 1 ? ['gp', 'precise'] : ['gp'];
  for (const cls of classes) {
    const t0 = Date.now();
    const { rows, counts } = await encounters(group, cls, windows, pc, { extraArms });
    const file = path.join(store, 'rows', `ca-encounters.${label}.${cls}.jsonl`);
    fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    summary.classes[cls] = summarize(group, cls, rows, counts);
    if (run) summary.classes[cls].a13 = a13Scores(group, cls, rows, ['ffm', 'sgp4xp', ...extraArms]);
    console.error(`part 4 ${group} ${cls}: ${rows.length} encounters (${counts.noPrimary} without a primary, ${counts.noSecondary} without a secondary), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  if (run) summary.realismCalibrated = Object.fromEntries(extraArms.map((arm) => [arm, Object.fromEntries(LEADS.map((L) => [L, realismCellC2(windows.flatMap((w) => { const x = w.leads[L]?.[arm]; return x && Number.isFinite(x.d2) ? [{ object: w.object, d2: x.d2 }] : []; }), `B2|A13|part3|${group}|${arm}|${L}`)]))]));
  write(path.join(store, 'rows', `ca.${label}.json`), summary);
  await ca.destroy?.();
  process.exit(0);
}
