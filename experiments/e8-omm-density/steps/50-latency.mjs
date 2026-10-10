#!/usr/bin/env node
// E8 step 50: latency (PLAN.md section 4c).
//   D5  for the calibration set of each 2026 window: the delay from each set's
//       EPOCH to its CREATION_DATE over the window's fit span; at each issue
//       day, each object's newest set created before t0, its age (t0 - EPOCH);
//       the forecast fits' compute time (step 10 forecast runs).
//   D2  each Swarm DNSxPOD and GRACE-FO DNS1ACC day file: the delay from the
//       end of its data day to its appearance on ESA's server (the server
//       modification time recorded in its .provenance.json).
//   Drivers: SET's free copy (the last data day against the file's release
//       time, from its header) and the RSGA issue times.
// Writes results/e8/latency.json. Statistics of times only.
//
//   node .../50-latency.mjs --pools RUN,... --forecast RUN,...
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { quantile } from '../../../harness/stats.mjs';
import { config, DAY_MS, dayMs, isoDay, issueDays, readRun } from '../common.mjs';
import { readCache } from '../omm.mjs';
import { rsga } from '../drivers.mjs';
import e5Config from '../../e5-density-calibration/config.json' with { type: 'json' };

const { values } = parseArgs({ options: { pools: { type: 'string' }, forecast: { type: 'string' } } });
const HOUR = 3600000;
const summary = (xs) => (xs.length ? { n: xs.length, median: quantile(xs, 0.5), p95: quantile(xs, 0.95), min: Math.min(...xs), max: Math.max(...xs) } : { n: 0 });
const out = { d5: {}, d2: {}, drivers: {} };

// D5: sets of the calibration objects (the largest K) over each window's fit span.
for (const id of (values.pools ?? '').split(',').filter(Boolean)) {
  const pool = readRun(id, 'pool.json');
  if (pool.window === 'historicalTest') continue;
  for (const [k, s] of pool.spans.entries()) {
    const cache = readCache(`${pool.window}-${k}`);
    const norads = s.bins.flatMap((b) => b.chosen.map((c) => c.norad));
    const S = dayMs(s.span.from) - config.decay.fitLeadDays * DAY_MS, E = dayMs(s.span.to) + config.decay.scoreDays * DAY_MS;
    const delays = [], ages = [];
    for (const n of norads) {
      const rows = cache.objects.get(n)?.rows ?? [];
      for (const r of rows) if (r[0] >= S && r[0] < E && r[1] !== null) delays.push((r[1] - r[0]) / HOUR);
      for (const t0 of issueDays([s.span])) {
        const created = rows.filter((r) => r[1] !== null && r[1] < t0);
        if (created.length) ages.push((t0 - Math.max(...created.map((r) => r[0]))) / HOUR);
      }
    }
    out.d5[`${pool.window}-${k}`] = { span: s.span, objects: norads.length, creationDelayHours: summary(delays), newestSetAgeAtIssueHours: summary(ages) };
  }
}
const compute = [];
for (const id of (values.forecast ?? '').split(',').filter(Boolean)) {
  for (const s of readRun(id, 'estimates.json').spans) for (const f of s.fits) compute.push(f.computeSeconds);
}
out.d5.forecastFitComputeSeconds = summary(compute);

// D2: ESA density day files, server time minus the end of the data day.
for (const [key, spec] of Object.entries(e5Config.inputs.densities)) {
  const delays = [];
  for (const name of fs.readdirSync(spec.dir).filter((n) => n.endsWith('.provenance.json'))) {
    const p = JSON.parse(fs.readFileSync(path.join(spec.dir, name), 'utf8'));
    const m = /_(\d{8})T\d{6}_/.exec(name);
    if (!m || !p.server_mtime_utc) continue;
    const dayEnd = Date.parse(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}T00:00:00Z`) + DAY_MS;
    delays.push((Date.parse(p.server_mtime_utc) - dayEnd) / DAY_MS);
  }
  out.d2[key] = { product: spec.pattern, appearanceDelayDays: summary(delays) };
}

// Drivers: SET's free copy and the RSGA issue times.
const head = fs.readFileSync(config.inputs.solfsmy, 'latin1').split('\n').slice(0, 4).join('\n');
const release = /\(\s*(\d+)-(\w{3})-(\d{4})\s+(\d{2}):(\d{2})/.exec(head);
const lastDay = fs.readFileSync(config.inputs.solfsmy, 'latin1').trim().split('\n').at(-1).trim().split(/\s+/);
const lastMs = Date.UTC(Number(lastDay[0]), 0, Number(lastDay[1]));
if (release) {
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const releaseMs = Date.UTC(Number(release[3]), months[release[2]], Number(release[1]), Number(release[4]), Number(release[5]));
  out.drivers.setFreeCopy = { release: new Date(releaseMs).toISOString(), lastDataDay: isoDay(lastMs), lagDays: (releaseMs - lastMs) / DAY_MS };
}
const reports = rsga().reports;
out.drivers.rsga = { reports: reports.length, first: new Date(reports[0].issuedMs).toISOString(), last: new Date(reports.at(-1).issuedMs).toISOString(),
  issueHoursUtc: [...new Set(reports.map((r) => new Date(r.issuedMs).getUTCHours()))] };
fs.mkdirSync(path.join(repoRoot, 'results', 'e8'), { recursive: true });
fs.writeFileSync(path.join(repoRoot, 'results', 'e8', 'latency.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
