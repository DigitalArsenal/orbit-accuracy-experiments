#!/usr/bin/env node
// CelesTrak acquisition for ca-socrates-gp-parity.
//
//   node experiments/ca-socrates-gp-parity/fetch-celestrak.mjs --out <dir> <name>=<url> [...]
//
// FETCH POLICY (space-data-network-modules
// analysis/conjunction-assessment/scripts/CELESTRAK_FETCH_POLICY.md), enforced
// with its shared helper (scripts/lib/celestrakFetchPolicy.mjs): serial
// requests at least 2.5 s apart; never the same URL twice in 3 hours (this
// machine's ledger, /opt/data/sdn-archive/celestrak/.celestrak-fetch-ledger);
// 429/503 backs off 60 s and retries once; the run halts after 30 consecutive
// failures; any other non-200 stops the run. CelesTrak is reached through the
// local Tor SOCKS proxy (owner 2026-10-10: direct connections from this
// machine time out); a fresh SOCKS username isolates each attempt's circuit.
// The bytes are stored as served, with their SHA-256, in fetch-log.jsonl.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MODULES = process.env.SDN_MODULES_ROOT ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../main-packages/space-data-network-modules');
const { FetchPolicy, sleep } = await import(path.join(MODULES, 'analysis/conjunction-assessment/scripts/lib/celestrakFetchPolicy.mjs'));

const LEDGER = '/opt/data/sdn-archive/celestrak/.celestrak-fetch-ledger';
const AGENT = 'SDN-SOCRATES-GP-Parity/1.0';
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
if (outIndex < 0) throw new Error('--out <dir> is required');
const out = path.resolve(args[outIndex + 1]);
const targets = args.filter((_, i) => i !== outIndex && i !== outIndex + 1).map((a) => {
  const at = a.indexOf('=');
  if (at < 1) throw new Error(`expected <name>=<url>, got ${a}`);
  return { name: a.slice(0, at), url: a.slice(at + 1) };
});
fs.mkdirSync(out, { recursive: true });
const policy = new FetchPolicy(LEDGER);
const log = (row) => fs.appendFileSync(path.join(out, 'fetch-log.jsonl'), `${JSON.stringify(row)}\n`);

function attempt(url, file) {
  const user = `sdn${crypto.randomBytes(6).toString('hex')}`;
  const code = execFileSync('curl', ['-sS', '-m', '180', '--socks5-hostname', `${user}:x@127.0.0.1:9050`, '-A', AGENT,
    '-D', `${file}.headers`, '-o', file, '-w', '%{http_code}', url], { encoding: 'utf8' }).trim();
  return Number(code);
}

for (const { name, url } of targets) {
  const file = path.join(out, name);
  if (fs.existsSync(file)) { console.log(`${name}: kept (already stored)`); continue; }
  if (!policy.allowed(url)) throw new Error(`3-hour rule: ${url} was fetched within 3 hours`);
  let status = null;
  for (let tries = 0; tries < 2; ++tries) {
    const startedAt = new Date().toISOString();
    try {
      status = attempt(url, `${file}.part`);
    } catch (error) {
      status = null;
      log({ name, url, startedAt, error: String(error.message).split('\n')[0] });
    }
    if (status === 200) break;
    if (status !== null) log({ name, url, startedAt, status });
    policy.noteFailure(url);
    fs.rmSync(`${file}.part`, { force: true });
    fs.rmSync(`${file}.part.headers`, { force: true });
    if (status !== null && status !== 429 && status !== 503) throw new Error(`${url}: HTTP ${status}; stopping (non-200)`);
    if (tries === 0) await sleep(60_000);
  }
  if (status !== 200) throw new Error(`${url}: failed after one retry`);
  fs.renameSync(`${file}.part`, file);
  fs.renameSync(`${file}.part.headers`, `${file}.headers`);
  policy.record(url);
  policy.noteSuccess();
  const bytes = fs.readFileSync(file);
  const row = { name, url, status, fetchedAt: new Date().toISOString(), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  log(row);
  console.log(JSON.stringify(row));
  await sleep(FetchPolicy.clampInterval(2500));
}
