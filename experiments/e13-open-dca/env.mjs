// The environment inputs of one collector cycle: the newest EOP finals, the GFZ
// Kp/ap/F10.7 series (the 1932- history, trimmed, plus the newest daily nowcast
// file), the NOAA SWPC reports and the planetary kernel. The fitter reads them
// as they were released at each file's issue time (harness/cutoff-environment.mjs),
// so a cycle only has to hold every file a version could need. Input selection only.
import fs from 'node:fs';
import path from 'node:path';
import { config, paths, modulesDir, sha256 } from './common.mjs';

const newestDated = (root, name) => {
  const days = fs.readdirSync(root).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d) && fs.existsSync(path.join(root, d, name))).sort();
  if (!days.length) throw new Error(`no ${name} under ${root}`);
  return { day: days.at(-1), file: path.join(root, days.at(-1), name) };
};

// GFZ's history file up to the first day of the newest nowcast file, then the nowcast. Rows from 2025 on only
// (the fitter looks 40 days either side for the 81-day F10.7 mean). Written once per source pair.
function mergedGfz() {
  const history = fs.readFileSync(config.inputs.gfzHistory, 'latin1').split('\n');
  const nowcast = newestDated(config.inputs.gfzNowcastDir, config.inputs.gfzNowcastName);
  const fresh = fs.readFileSync(nowcast.file, 'latin1').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const key = (line) => { const t = line.trim().split(/\s+/); return `${t[0]}-${t[1].padStart(2, '0')}-${t[2].padStart(2, '0')}`; };
  const keep = history.filter((l) => l.trim() && !l.startsWith('#') && key(l) >= '2025-01-01' && key(l) < key(fresh[0]));
  const text = `${[...keep, ...fresh].join('\n')}\n`;
  fs.mkdirSync(paths.inputs, { recursive: true });
  const file = path.join(paths.inputs, `gfz-${nowcast.day}-${sha256(Buffer.from(text, 'latin1')).slice(0, 12)}.txt`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, text, 'latin1');
  return { file, nowcast: nowcast.file, nowcastDay: nowcast.day };
}

export function cycleEnv() {
  const eop = newestDated('/opt/data/sdn-archive/hac/iers-eop/2026', 'finals.all.iau2000.txt');
  const gfz = mergedGfz();
  return {
    envConfig: {
      modulesDir: modulesDir(),
      eopFinals: eop.file,
      gfzKp: gfz.file,
      swpcRsga: config.inputs.rsga,
      kernelPath: config.inputs.kernel.path,
      kernelSha256: config.inputs.kernel.sha256,
      rsgaCacheDir: path.join(paths.inputs, 'rsga-cache-unused'),
    },
    summary: { eopFinals: eop.file, eopDay: eop.day, gfz: gfz.file, gfzNowcast: gfz.nowcast },
  };
}
