import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, options, pinnedModules, newRun, finishRun, sha, read } from './lib.mjs';

const opts = options(), modules = pinnedModules(opts.modules), run = newRun('ffm', opts, modules);
for (const file of [
  config.ffm.benchmark, 'propagator/ffm/tests/fixtures/standard.json', 'propagator/ffm/tests/fixtures/seeds.json',
  'propagator/ffm/tests/fixtures/resident/eop-2026-08.json', 'propagator/ffm/tests/fixtures/resident/spw-2026-08-synthetic.json',
  'files/orbit-products/tests/fixtures/de440/de440-2026.bsp',
]) run.manifest.inputs[file] = sha(fs.readFileSync(path.join(modules.root, file)));
const raw = path.join(run.dir, 'resident-aa.json');
const args = [path.join(modules.root, config.ffm.benchmark), '--baseline', config.ffm.baselineCommit,
  '--reps', String(config.ffm.repetitions), '--wasmedge-hours', String(config.ffm.wasmedgeHours), '--out', raw];
const log = fs.openSync(path.join(run.dir, 'runner.log'), 'w');
const code = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: path.join(modules.root, 'propagator/ffm'), stdio: ['ignore', log, log] });
  child.once('error', reject); child.once('exit', (status, signal) => resolve(signal ? `signal:${signal}` : status));
});
fs.closeSync(log);
run.manifest.childCommand = [process.execPath, ...args];
const result = { exitCode: code, result: fs.existsSync(raw) ? read(raw) : null,
  logSha256: sha(fs.readFileSync(path.join(run.dir, 'runner.log'))),
  limitation: 'Same-artifact repeatability and resident preparation cost on eight fixtures with synthetic weather; not independent accuracy or an XP speed comparison.' };
const output = finishRun(run, result, 'ffm.json');
console.log(JSON.stringify({ output, exitCode: code, pass: result.result?.ok === true }));
if (code !== 0) { console.error(fs.readFileSync(path.join(run.dir, 'runner.log'), 'utf8')); process.exitCode = 1; }
