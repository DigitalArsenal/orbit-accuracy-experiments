// End-to-end check of the forward test: score.mjs re-scores the first two registered cycles' pairs, one shard of them, from the stored products, and each number must equal the stored row's.
//   node experiments/operator-theory/check.mjs [--root /opt/data/sdn-archive/operator-theory]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const flag = process.argv.indexOf('--root');
const ROOT = flag > 0 ? process.argv[flag + 1] : '/opt/data/sdn-archive/operator-theory';
const FIRST = ['c20261101T0326', 'c20261101T1526'];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-theory-check-'));
try {
  for (const c of FIRST) fs.symlinkSync(path.join(ROOT, c), path.join(temp, c));
  const out = path.join(temp, 'rows.jsonl');
  execFileSync(process.execPath, ['--max-old-space-size=3072', path.join(here, 'score.mjs'), '--root', temp, '--out', out, '--shard', '0/12'], { stdio: 'inherit' });
  const rows = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (!rows.length) throw new Error('no pair scored');
  const stored = new Map(fs.readFileSync(path.join(ROOT, 'forward/rows.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [`${r.key}|${r.olderStart}|${r.newerStart}`, r]));
  let compared = 0;
  for (const r of rows) {
    const s = stored.get(`${r.key}|${r.olderStart}|${r.newerStart}`);
    if (!s) throw new Error(`no stored row for ${r.key} ${r.olderStart} ${r.newerStart}`);
    if (!r.arms.operator) throw new Error(`${r.key}: no operator forecast scored`);
    if (Object.keys(r.arms).length < 4) throw new Error(`${r.key}: only ${Object.keys(r.arms).length} arms scored`);
    for (const [name, a] of Object.entries(s.arms)) {
      if (a.error || r.arms[name]?.error) throw new Error(`${r.key} ${name}: ${a.error ?? r.arms[name].error}`);
      if (Math.abs(r.arms[name].km - a.km) > 1e-9) throw new Error(`${r.key} ${name}: ${r.arms[name].km} against stored ${a.km}`);
      compared += 1;
    }
  }
  console.log(`OPERATOR THEORY CHECK PASS: ${rows.length} pairs, ${compared} arm scores equal the stored rows`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
process.exit(0);
