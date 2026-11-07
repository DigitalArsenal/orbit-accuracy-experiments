// E2E for experiments-satnogs-optical-survey-20261104: node experiments/satnogs-optical-survey/check.mjs [dir]
// Reads REPORT.md, coverage.json and PROPOSED.md beside this file (or in [dir]) and the archive's file names and times.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2] ?? dirname(fileURLToPath(import.meta.url));
const ARCHIVE = process.env.SDN_ARCHIVE ?? '/opt/data/sdn-archive';
const SURVEY_START = Date.parse('2026-11-04T15:50:00Z');
const HELD = new Set([43567, 37847, 41862, 41174, 43055, 41175, 39451, 39452, 39453, 43476, 43477]);
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const report = readFileSync(join(dir, 'REPORT.md'), 'utf8');
const need = [
  ['format Parquet', /Parquet/], ['format CCSDS TDM v2', /CCSDS TDM v2/], ['format IOD', /IOD/],
  ['licence CC BY-SA 4.0', /CC BY-SA 4\.0/], ['licence SPDX', /CC-BY-SA-4\.0/],
  ['licence URL', /https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\//],
  ['data URL', /https:\/\/optical\.satnogs\.org\/data/], ['index URL', /products\/index\.json/],
  ['API URL', /https:\/\/optical\.satnogs\.org\/api\/v1\//],
  ['credit line', /SatNOGS Optical contributors - https:\/\/optical\.satnogs\.org - CC BY-SA 4\.0/],
  ['cadence', /\*\*Cadence\.\*\*[\s\S]*06:27Z[\s\S]*regenerated/],
  ['date range start', /2026-08-23/], ['date range end', /2026-11-03/],
  ['volume measurements', /3,460,174/], ['stations table', /dwingeloo/], ['SGP4 identity caveat', /Identity is an SGP4 label/],
];
for (const [name, re] of need) ok(re.test(report), `REPORT.md lacks ${name}`);

const cov = JSON.parse(readFileSync(join(dir, 'coverage.json'), 'utf8'));
ok(cov.licence === 'CC-BY-SA-4.0' && /CC BY-SA 4\.0/.test(cov.credit), 'coverage.json licence or credit');
ok(cov.sessions.first === '2026-08-23' && cov.sessions.last === '2026-11-03' && cov.sessions.count === 71, 'coverage.json session range');
ok(Array.isArray(cov.objects) && cov.objects.length === cov.totals.objects_with_truth, 'objects length equals totals');
let nights = 0, meas = 0, geq20 = 0;
for (const o of cov.objects) {
  ok(!HELD.has(o.norad), `held object ${o.norad} counted`);
  const withTruth = o.nights.filter((n) => n.truth_class);
  ok(withTruth.length === o.nights_with_truth && o.nights_with_truth > 0, `night count of ${o.norad}`);
  ok(o.nights.length === o.nights_observed, `observed night count of ${o.norad}`);
  for (const n of withTruth) ok(n.tracks_with_truth > 0 && n.measurements_with_truth > 0 && /^\d{4}-\d{2}-\d{2}$/.test(n.session), `night row of ${o.norad} ${n.session}`);
  nights += o.nights_with_truth;
  meas += withTruth.reduce((a, n) => a + n.measurements_with_truth, 0);
  geq20 += o.nights_with_truth_ge_20_measurements;
  ok(o.truth_classes.every((c) => c in cov.truth_classes), `truth class of ${o.norad}`);
}
ok(nights === cov.totals.object_nights_with_truth, 'object-night total');
ok(meas === cov.totals.measurements_with_truth, 'measurement total');
ok(geq20 === cov.totals.object_nights_with_truth_ge_20_measurements, '20-measurement night total');
ok(cov.totals.objects_observed_identified > cov.totals.objects_with_truth, 'identified objects exceed objects with truth');
ok(cov.holds_applied.galileo_excluded.length === 6, 'six Galileo excluded');
ok(cov.held_observed.every((h) => HELD.has(h.norad)), 'held list');
ok(!JSON.stringify(cov.objects).match(/starlink/i), 'no Starlink in objects');
ok(cov.truth_classes && !('sgp4' in cov.truth_classes) && !/element set/i.test(JSON.stringify(cov.truth_classes)), 'no SGP4 derivative as truth');

const prop = readFileSync(join(dir, 'PROPOSED.md'), 'utf8');
const records = prop.split(/^## R\d /m).slice(1);
ok(records.length === 5, `PROPOSED.md has ${records.length} records, expected 5`);
for (const [i, r] of records.entries()) {
  ok((r.match(/^\*\*E2E/gm) ?? []).length === 1, `record R${i + 1} does not have exactly one E2E`);
  ok(/`[a-z0-9-]+-20261104`/.test(r), `record R${i + 1} has no id`);
}
ok(/SatNOGS Optical contributors - https:\/\/optical\.satnogs\.org - CC BY-SA 4\.0/.test(prop), 'PROPOSED.md credit line');
ok(/read_tdm/.test(prop) && /IngestRequest/.test(prop), 'PROPOSED.md names read_tdm and IngestRequest tags');

// Nothing written to the archive: no SatNOGS Optical tree, and nothing under hac/satnogs newer than the survey start.
ok(!existsSync(join(ARCHIVE, 'hac/satnogs-optical')), 'hac/satnogs-optical exists');
const walk = (p) => { for (const e of readdirSync(p, { withFileTypes: true })) { const q = join(p, e.name); const m = statSync(q).mtimeMs; if (m > SURVEY_START) fails.push(`archive path written after survey start: ${q}`); if (e.isDirectory()) walk(q); } };
if (existsSync(join(ARCHIVE, 'hac/satnogs'))) walk(join(ARCHIVE, 'hac/satnogs'));

if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log(JSON.stringify({ ok: true, objects_with_truth: cov.objects.length, object_nights_with_truth: nights, measurements_with_truth: meas,
  arcs_24h_or_more: cov.totals.arcs_24h_or_more, records: records.length }));
