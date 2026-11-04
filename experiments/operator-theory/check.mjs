// End-to-end check of the one-$OCM path (lib/build.mjs PIN: sdn-ap 0.5.1, sgp4-xp 0.2.1), every product re-fitted as $OCM on stored windows (inputs on disk):
// 1. the forward test: score.mjs re-scores the first two registered cycles' pairs, one shard, the AP module's arms (X0, X2) re-fitted as $OCM on the older file's
//    stored window; every arm, the operator's forecast, SGP4 and FFM with them, equals the registered row (forward/rows.jsonl).
// 2. AP5 and AP6: ap-truth.mjs, truth-compare.mjs and all-regimes.mjs re-fit one shard of the registered windows. On AP5's windows AP equals AP 0.4.18's stored rows
//    (ap/b0418) and whiteroom XP AP7's 0.4.11 rows (ap/b0411), byte for byte; on AP6's, AP and XP equal the 0.5.1 re-measure (ap/b051), as does the Space Force XP
//    (sgp4-xp 0.2.1) everywhere.
//   node experiments/operator-theory/check.mjs [--root /opt/data/sdn-archive/operator-theory]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const flag = process.argv.indexOf('--root');
const ROOT = flag > 0 ? process.argv[flag + 1] : '/opt/data/sdn-archive/operator-theory';
const XP_STORE = path.join(ROOT, 'ap/b0411'), AP_STORE = path.join(ROOT, 'ap/b0418'), NEW = path.join(ROOT, 'ap/b051');
const FIRST = ['c20261101T0326', 'c20261101T1526'];
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const node = (script, args, env = {}) => execFileSync(process.execPath, ['--max-old-space-size=3072', path.join(here, script), ...args], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...env } });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-theory-check-'));
const AP_MODULE_ARM = /^(X0|X2|RFa|A-)/;
try {
  // 1. the forward test
  for (const c of FIRST) fs.symlinkSync(path.join(ROOT, c), path.join(temp, c));
  const out = path.join(temp, 'rows.jsonl');
  node('score.mjs', ['--root', temp, '--out', out, '--shard', '0/12']);
  const rows = jsonl(out);
  if (!rows.length) throw new Error('no pair scored');
  const id = (r) => `${r.key}|${r.olderStart}|${r.newerStart}`;
  const registered = new Map(jsonl(path.join(ROOT, 'forward/rows.jsonl')).map((r) => [id(r), r]));
  let compared = 0, refitted = 0;
  for (const r of rows) {
    const s = registered.get(id(r));
    if (!s) throw new Error(`no stored row for ${id(r)}`);
    if (!r.arms.operator) throw new Error(`${r.key}: no operator forecast scored`);
    if (Object.keys(r.arms).length !== Object.keys(s.arms).length) throw new Error(`${r.key}: ${Object.keys(r.arms).length} arms scored, ${Object.keys(s.arms).length} registered`);
    for (const [name, a] of Object.entries(r.arms)) {
      const want = s.arms[name];
      if (a.error || want?.error) throw new Error(`${r.key} ${name}: ${a.error ?? want.error}`);
      if (Math.abs(a.km - want.km) > 1e-9) throw new Error(`${r.key} ${name}: ${a.km} against stored ${want.km}`);
      compared += 1; if (AP_MODULE_ARM.test(name)) refitted += 1;
    }
  }
  if (!refitted) throw new Error('forward: no AP-module arm re-fitted');
  console.log(`forward: ${rows.length} pairs, ${compared} arm scores equal the registered rows (${refitted} from $OCM re-fitted at 0.5.1)`);

  // 2. AP5 and AP6, one shard of the registered windows each
  const equal = (fresh, stored, arms, what) => {
    const byKey = new Map(stored.map((r) => [r.key, r]));
    let n = 0;
    for (const r of fresh) {
      const s = byKey.get(r.key);
      if (!s) throw new Error(`${what}: no stored row for ${r.key}`);
      for (const arm of Object.keys(r.arms).filter((a) => arms.test(a))) {
        const a = r.arms[arm], b = s.arms[arm];
        if (!b) throw new Error(`${what} ${r.key} ${arm}: not stored`);
        if (JSON.stringify(a.days ?? a.error) !== JSON.stringify(b.days ?? b.error)) throw new Error(`${what} ${r.key} ${arm}: ${JSON.stringify(a.days?.['1'] ?? a.error)} against stored ${JSON.stringify(b.days?.['1'] ?? b.error)}`);
        n += a.ok ? Object.keys(a.days).length : 0;
      }
    }
    if (!n) throw new Error(`${what}: nothing compared`);
    return n;
  };
  const runs = [
    ['AP5 T, AP', 'ap-truth.mjs', ['--arms', 'registered', '--from', '2025-04-01', '--to', '2025-12-21', '--shard', '0/64'], {}, 'truth', 'truth', /^AP24$/, AP_STORE],
    ['AP5 T, XP', 'truth-compare.mjs', ['--arms', 'XP', '--from', '2025-04-01', '--to', '2025-12-21', '--shard', '0/64'], {}, 'compare-truth', 'compare-truth', /^XP24$/, XP_STORE],
    ['AP5 N, AP', 'ap-truth.mjs', ['--xm', '--from', '2026-01-01', '--to', '2026-05-31', '--shard', '0/128'], { XP2F_CONTROL: '1' }, 'truth2', 'truth2', /^AP(24|72)$/, AP_STORE],
    ['AP5 N, Space Force XP', 'truth-compare.mjs', ['--xm', '--arms', 'U', '--from', '2026-01-01', '--to', '2026-05-31', '--shard', '0/512'], { XP2F_CONTROL: '1' }, 'ussf-truth2', 'ussf-truth2', /^U(24|72)$/, NEW],
    ['AP6, AP and XP', 'all-regimes.mjs', ['--arms', 'AP,XP', '--shard', '0/64'], {}, 'regimes', 'regimes', /^(AP|XP)\d+$/, NEW],
  ];
  for (const [what, script, args, env, dir, storedDir, arms, base] of runs) {
    const o = path.join(temp, dir);
    node(script, [...args, '--out', o], env);
    const n = equal(rowsIn(o), rowsIn(path.join(base, storedDir)), arms, what);
    console.log(`${what}: ${n} lead-day errors equal ${path.basename(base)}'s stored rows`);
  }
  console.log('OPERATOR THEORY CHECK PASS');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
process.exit(0);
