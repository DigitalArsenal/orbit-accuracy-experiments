#!/usr/bin/env node
// ca-socrates-gp-parity: labels on a comparison's misses and geometry tail, from the SGP4 lane's per-row arbitration of the
// same SOCRATES rows (coordinator 2026-10-30; modules task modules-sgp4-implementation-parity-bstar-20261029). Not a run
// source: it changes no registered rule, count or verdict; it adds a diagnosis label beside them.
//   node experiments/ca-socrates-gp-parity/annotate-tle.mjs --run <run dir> --tag part1|full --per-row <tsv>
// The per-row file holds SOCRATES row values (CelesTrak grants no licence to reproduce them): it is read, hashed and cited,
// never committed. Labels:
//   TLE rounding — the CA module rebuilds each OMM as TLE text (BSTAR to 5 significant digits, eccentricity to 7 decimals);
//     a row is attributable when full precision reproduces SOCRATES (|full - SOCRATES| <= 0.5 m print rounding + 0.5 m)
//     and the as-shipped CA path reproduces our screen (|ca - ours| <= 1 m), or, for a miss, when full precision puts the
//     minimum inside 5 km and the CA path beyond it.
//   altitude prefilter — a miss whose pair the screen never reported and whose epoch perigee/apogee bands (the provider's
//     PERIAPSIS/APOAPSIS) lie more than the screen's 50 km margin apart, although the pair's own minimum is inside 5 km.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { readCatalog } from './common.mjs';

const { values: o } = parseArgs({ options: { run: { type: 'string' }, tag: { type: 'string' }, 'per-row': { type: 'string' } } });
const dir = path.resolve(o.run);
const metrics = JSON.parse(fs.readFileSync(path.join(dir, `metrics.${o.tag}.json`), 'utf8'));
const matches = JSON.parse(fs.readFileSync(path.join(dir, `matches.${o.tag}.json`), 'utf8'));
const tsvBytes = fs.readFileSync(o['per-row']);
const [head, ...lines] = tsvBytes.toString('utf8').trim().split('\n');
const col = Object.fromEntries(head.split('\t').map((h, i) => [h, i]));
const key = (a, b, tca) => `${a}|${b}|${String(tca).replace(' ', 'T')}`;
const perRow = new Map();
for (const line of lines) {
  const v = line.split('\t');
  const n = (c) => Number(v[col[c]]);
  perRow.set(key(v[col.norad1], v[col.norad2], v[col.tca_socrates_utc]), {
    row: n('row'), socratesM: n('range_socrates_m'), maxAbsBstar: n('max_abs_bstar'), maxDseD: n('max_dse_d'),
    full: n('full_ok') === 1 ? n('full_range_m') : null, tle: n('tle_ok') === 1 ? n('tle_range_m') : null, ca: n('ca_ok') === 1 ? n('ca_range_m') : null,
  });
}
const TLE = 'attributable to TLE rounding of OMM values (modules task modules-sgp4-implementation-parity-bstar-20261029)';
const PREFILTER = 'altitude prefilter: the epoch perigee/apogee bands lie more than the 50 km margin apart, the pair\'s own minimum is inside 5 km (screen defect)';
const VLRV = 'very low relative speed (below 10 m/s): the screen reports this pair\'s minimum, but more than the 60 s match window from SOCRATES\'s TCA (a flat minimum); found, not matched';
const catalog = readCatalog();
const band = new Map(catalog.rows.map((g) => [Number(g.NORAD_CAT_ID), [Number(g.PERIAPSIS), Number(g.APOAPSIS)]]));
const gapKm = (a, b) => { const x = band.get(a), y = band.get(b); return x && y ? Math.max(y[0] - x[1], x[0] - y[1]) : null; };

const missLabels = metrics.misses.map((m) => {
  const p = perRow.get(key(m.pair[0], m.pair[1], m.socratesTcaUtc));
  const gap = gapKm(m.pair[0], m.pair[1]);
  let label = null;
  if (p && p.full !== null && p.full <= 5000 && (p.ca === null || p.ca > 5000)) label = TLE;
  else if (!m.nearestScreenEvent && m.pairMethod?.missM <= 5000 && gap !== null && gap > 50) label = PREFILTER;
  else if (m.socratesSpeedMS < 10 && m.nearestScreenEvent && Math.abs(m.nearestScreenEvent.secondsFromSocrates) > 60 && m.nearestScreenEvent.missM <= 5000) label = VLRV;
  return { pair: m.pair, socratesTcaUtc: m.socratesTcaUtc, cls: m.cls, socratesRangeM: m.socratesRangeM, socratesSpeedMS: m.socratesSpeedMS, perRow: p ?? null, bandGapKm: gap, label };
});
const tail = {};
const tailRows = [];
for (const x of matches) {
  const beyond = (x.stratum === 'NLRV' && Math.abs(x.dtSeconds) > metrics.tolerances.tcaNlrvSeconds) || Math.abs(x.dMissM) > metrics.tolerances.missM || Math.abs(x.dSpeedMS) > metrics.tolerances.speedMS;
  if (!beyond) continue;
  const p = perRow.get(key(x.pair[0], x.pair[1], x.socratesTcaUtc));
  const ours = x.socratesRangeM + x.dMissM;
  const ok = p && p.full !== null && p.ca !== null && Math.abs(p.full - p.socratesM) <= 1.0 && Math.abs(p.ca - ours) <= 1.0;
  const cls = Math.max(...x.pair) >= 100000 ? 'numbered100000' : 'primary';
  tail[cls] ??= { beyondTolerance: 0, attributableToTleRounding: 0, notAttributable: 0, noPerRow: 0 };
  tail[cls].beyondTolerance++;
  if (!p) tail[cls].noPerRow++; else if (ok) tail[cls].attributableToTleRounding++; else tail[cls].notAttributable++;
  if (!ok) tailRows.push({ ...x, perRow: p ?? null });
}
const out = {
  tag: o.tag, perRowSource: { path: o['per-row'], sha256: createHash('sha256').update(tsvBytes).digest('hex'), rows: perRow.size, from: 'SGP4 lane a6331b93be3a52c21 (modules-sgp4-implementation-parity-bstar-20261029)' },
  labels: { tleRounding: TLE, altitudePrefilter: PREFILTER, vlrvFound: VLRV },
  misses: { total: missLabels.length, tleRounding: missLabels.filter((m) => m.label === TLE).length, altitudePrefilter: missLabels.filter((m) => m.label === PREFILTER).length, vlrvFound: missLabels.filter((m) => m.label === VLRV).length, other: missLabels.filter((m) => !m.label).length, rows: missLabels },
  tail, tailNotAttributable: tailRows.sort((a, b) => Math.abs(b.dMissM) - Math.abs(a.dMissM)).slice(0, 50),
};
fs.writeFileSync(path.join(dir, `annotations.${o.tag}.json`), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ misses: { total: out.misses.total, tleRounding: out.misses.tleRounding, altitudePrefilter: out.misses.altitudePrefilter, vlrvFound: out.misses.vlrvFound, other: out.misses.other }, tail }));
