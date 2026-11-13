// Verifies the frozen files and the module before a run.
//   node check.mjs [--config config.json]
// Every line of MANIFEST.sha256 (SHA-256 and a path relative to the repository root) is compared with the file; the module's bytes are compared with the
// registered SHA-256 (SDN_AP_WASM, else the configuration's path); the weather forecaster's bytes are compared with theirs. Exits 1 on any difference.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readConfig, HERE, REPO, sha256, verifyModule } from './lib/module.mjs';

const config = readConfig();
let bad = 0;
const manifest = fs.readFileSync(path.join(HERE, 'MANIFEST.sha256'), 'utf8').split('\n').filter(Boolean);
for (const line of manifest) {
  const [want, file] = line.split(/\s+/);
  const p = path.join(REPO, file);
  const got = fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null;
  if (got !== want) { bad += 1; console.log(`DIFFERENT ${file}: ${got ?? 'absent'}, registered ${want}`); }
}
console.log(`${manifest.length} manifest lines checked`);
try { console.log(`module ${verifyModule(config)}: SHA-256 as registered (sdn-ap ${config.module.version}, commit ${config.module.repositoryCommit})`); } catch (error) { bad += 1; console.log(`MODULE ${error.message}`); }
const fc = path.join(REPO, config.weatherForecaster.file);
const got = fs.existsSync(fc) ? sha256(fs.readFileSync(fc)) : null;
if (got !== config.weatherForecaster.sha256) { bad += 1; console.log(`FORECASTER ${config.weatherForecaster.file}: ${got ?? 'absent'}, registered ${config.weatherForecaster.sha256}`); }
else console.log('weather forecaster: SHA-256 as registered');
console.log(`node ${process.version}`);
try { console.log(execFileSync('python3', ['-c', 'import sys, numpy; print("python", sys.version.split()[0], "numpy", numpy.__version__)'], { encoding: 'utf8' }).trim()); } catch { console.log('python3 with numpy: absent'); }
process.exit(bad ? 1 : 0);
