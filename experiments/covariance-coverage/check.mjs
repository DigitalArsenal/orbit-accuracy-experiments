// The end-to-end check: a sample of the registered windows flown again by the build the registered rows were flown on (covbuild.mjs at
// 31/70), written by summary.py fixture with that build's radial factor taken off, every row equal to one of the registered rows.
//   node check.mjs <out> [--sample k/n]        (default 7/60: every 60th registered window from the 8th, 13 windows)
// Needs the registered windows file and rows (in COVERAGE_ARCHIVE, default /opt/data/sdn-archive/operator-theory) and the build
// registered in <out> (build.mjs; 0.6.42, wasm SHA-256 1ddff52c...). Without any of them it prints SKIPPED, never a pass.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { HERE, outDir, opt, shardArg } from './lib.mjs';

const ARCHIVE = process.env.COVERAGE_ARCHIVE ?? '/opt/data/sdn-archive/operator-theory';
const WINDOWS = { file: path.join(ARCHIVE, 'covariance-coverage-windows/windows-c2f7fd4049bb.txt'), sha256: 'c2f7fd4049bb88a011ff837e84c942ae55ab26fb55a34a06a3ec9c59a7354d85' };
const ROWS = { file: path.join(ARCHIVE, 'covariance-coverage-1ddff52cf42c/rows-31-70-factor-off.jsonl'), sha256: 'dc54dafd6da1816734de29cd7f1319e6f023f783d664240e6090912149881be6' };
const BUILD = { sha12: '1ddff52cf42c', sha256: '1ddff52cf42c6f3e9b1c8dfe470d0d70e22b6afcb187838fbe4b7ceb5c333487' };
const FACTOR = '1.1051709180756477'; // the build's radial floor factor exp(0.10), as the registered rows took it off
const out = outDir(process.argv[2]);
const [K, N] = shardArg(opt('--sample') ?? '7/60');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const skip = (why) => { console.log(`SKIPPED: ${why}`); process.exit(0); };
for (const f of [WINDOWS, ROWS]) {
  if (!fs.existsSync(f.file)) skip(`${f.file} is absent`);
  if (sha(fs.readFileSync(f.file)) !== f.sha256) throw new Error(`${f.file} is not the registered file (SHA-256 ${f.sha256})`);
}
const buildJson = path.join(out, 'builds', BUILD.sha12, 'build.json');
if (!fs.existsSync(buildJson)) skip(`the build ${BUILD.sha12} is not registered in ${out} (build.mjs)`);
if (JSON.parse(fs.readFileSync(buildJson, 'utf8')).sha256 !== BUILD.sha256 || sha(fs.readFileSync(path.join(out, 'builds', BUILD.sha12, 'module.wasm'))) !== BUILD.sha256) throw new Error(`${BUILD.sha12} in ${out} is not the registered build`);

const dir = path.join(out, `check-${BUILD.sha12}-${K}of${N}`);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.symlinkSync(path.join(out, 'builds'), path.join(dir, 'builds'));
const sample = fs.readFileSync(WINDOWS.file, 'utf8').split('\n').filter(Boolean).filter((l, i) => i % N === K);
fs.writeFileSync(path.join(dir, 'windows.txt'), `${sample.join('\n')}\n`);
fs.writeFileSync(path.join(dir, 'windows.json'), `${JSON.stringify({ windows: sample.length, s1ScoredDays: [1, 2, 3], from: { file: path.basename(WINDOWS.file), sample: `${K}/${N}` } }, null, 1)}\n`);
const step = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: HERE, stdio: 'inherit' }); if (r.status !== 0) throw new Error(`${path.basename(args[1] ?? args[0])} exited ${r.status}`); };
step(process.execPath, [path.join(HERE, 'covbuild.mjs'), dir, BUILD.sha12, '0/1', '--caps', '31,70']);
step('python3', ['-I', path.join(HERE, 'summary.py'), 'fixture', dir, BUILD.sha12, 'check', '--caps', '31,70', '--factor-off', FACTOR, '--registered', FACTOR, '--to', path.join(dir, 'fixture')]);
const body = (l) => l.replace(/^\{"id": \d+, /, '{');
const registered = new Set(fs.readFileSync(ROWS.file, 'utf8').split('\n').filter(Boolean).map(body));
const flown = fs.readFileSync(path.join(dir, 'fixture/rows-check.jsonl'), 'utf8').split('\n').filter(Boolean).map(body);
const equal = flown.filter((l) => registered.has(l)).length;
const ok = flown.length === sample.length && equal === flown.length;
console.log(`${ok ? 'PASS' : 'FAIL'}: ${equal} of ${sample.length} sampled windows (${K}/${N} of the registered ${registered.size}) flown again equal to the registered rows`);
process.exitCode = ok ? 0 : 1;
