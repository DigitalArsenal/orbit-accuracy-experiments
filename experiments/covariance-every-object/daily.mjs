// `run.mjs --day YYYY-MM-DD [--limit N]`: one command for an issue day. Per-object rows -> AR/daily/<day>.jsonl (hashed in the committed manifest);
// stratum-level aggregates -> results/covariance-every-object/daily/<day>.json.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { OUT } from './lib/archive.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..'), res = path.join(repo, 'results/covariance-every-object');
export async function runDay(day, limit = 0, workers = 8) {
  const den = JSON.parse(fs.readFileSync(path.join(res, 'denominators.json'))).strata, n0r = JSON.parse(fs.readFileSync(path.join(res, 'n0-rows.json')));
  const cfg = { a: Object.fromEntries(Object.entries(den).map(([k, v]) => [k, v.a_RTN_m2])), n0: n0r.n0 ?? 20 };
  const dir = path.join(OUT, 'daily'), tmp = path.join(dir, `.${day}`); fs.mkdirSync(tmp, { recursive: true });
  await Promise.all(Array.from({ length: workers }, (_, k) => new Promise((ok, no) => {
    const p = spawn('nice', ['-n', '10', process.execPath, path.join(here, 'daily-worker.mjs'), String(k), String(workers), day, path.join(tmp, `part-${k}.jsonl`), String(limit)], { stdio: 'inherit', env: { ...process.env, COV_DAILY_CONFIG: JSON.stringify(cfg) } });
    p.on('exit', (c) => (c === 0 ? ok() : no(new Error(`daily worker ${k} exit ${c}`))));
  })));
  const rows = [], dropped = {};
  for (let k = 0; k < workers; k++) {
    for (const l of fs.readFileSync(path.join(tmp, `part-${k}.jsonl`), 'utf8').split('\n')) if (l) rows.push(JSON.parse(l));
    for (const [p, c] of Object.entries(JSON.parse(fs.readFileSync(path.join(tmp, `part-${k}.jsonl.dropped.json`))))) dropped[p] = (dropped[p] ?? 0) + c;
  }
  rows.sort((a, b) => a.norad - b.norad);
  const body = rows.map((x) => JSON.stringify(x)).join('\n') + '\n', file = path.join(dir, `${day}.jsonl`);
  fs.writeFileSync(file, body); fs.rmSync(tmp, { recursive: true });
  const sha = crypto.createHash('sha256').update(body).digest('hex'), agg = {};
  for (const r of rows) { const g = agg[r.regime ?? 'BASE-no-regime'] ??= { objects: 0, base: 0, flagged: 0 }; g.objects++; if (r.base) g.base++; if (r.flagged) g.flagged++; }
  fs.mkdirSync(path.join(res, 'daily'), { recursive: true });
  fs.writeFileSync(path.join(res, 'daily', `${day}.json`), JSON.stringify({ day, issueTime: `${day}T00:00:00Z`, objects: rows.length, n0: cfg.n0, n0ReportOnly: n0r.n0 === null, provisionalAllBins: true, limit: limit || null, droppedByPredicate: dropped, byRegime: agg }, null, 1) + '\n');
  const mf = path.join(res, 'manifest.json'), m = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf)) : {};
  m[`${day}.jsonl`] = sha; fs.writeFileSync(mf, JSON.stringify(m, null, 1) + '\n');
  return { rows: rows.length, sha, agg };
}
