// Reading run outputs and per-run summaries (PLAN.md section 4). Statistics
// only.
import fs from 'node:fs';
import path from 'node:path';
import { config, msOf } from './common.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { rms, median, quantile } from '../../harness/stats.mjs';

const seedEpoch = (id) => [...config.partB.devSeeds, ...config.partB.testSeeds].find((s) => s.id === id)?.epoch;

// Every job output of the runs (runs/<id>/jobs/*.json), with its arc epoch.
export function readJobs(runIds, { subdir = 'jobs' } = {}) {
  const jobs = [];
  for (const id of runIds) {
    const dir = path.join(repoRoot, 'runs', id, subdir);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
      const job = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      job.run = id;
      if (job.epochMs === undefined && seedEpoch(job.seed)) job.epochMs = msOf(seedEpoch(job.seed));
      jobs.push(job);
    }
  }
  return jobs;
}

// Scored epochs: after the warm-up (Part B), all of them otherwise.
export const scoredRows = (job, warmupHours = config.partB.warmupHours) => job.rows.filter((r) => r.ms >= job.epochMs + warmupHours * 3600e3);

// One run: point error over the scored epochs and the failure flag (a run
// that stops, or whose final position error exceeds the limit).
export function runSummary(job, { warmupHours = config.partB.warmupHours, failureKm = config.partB.failureKm } = {}) {
  const rows = scoredRows(job, warmupHours);
  const pos = rows.map((r) => r.pos), vel = rows.map((r) => r.vel);
  const final = job.rows.at(-1);
  const stopped = !!job.failure || job.rows.length < job.observations;
  return {
    seed: job.seed, case: job.case, variant: job.variant, run: job.run,
    failed: stopped || !final || final.pos > failureKm * 1000, stopped,
    epochs: rows.length, rmsPos: pos.length ? rms(pos) : NaN, medianPos: pos.length ? median(pos) : NaN,
    p95Pos: pos.length ? quantile(pos, 0.95) : NaN, maxPos: pos.length ? Math.max(...pos) : NaN, rmsVel: vel.length ? rms(vel) : NaN,
    finalPos: final?.pos ?? NaN, hpop: job.calls?.hpop ?? 0, estimation: job.calls?.estimation ?? 0, seconds: job.seconds ?? 0,
  };
}
