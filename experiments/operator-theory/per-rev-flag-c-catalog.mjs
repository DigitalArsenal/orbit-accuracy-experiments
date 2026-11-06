// PER-REV-FLAG.md, amendment of 2026-11-06 (c), quiet-set enlargement: the burn catalog of the near-700 km altimetry satellites over their spring 2026 products
// (AP9.md's files), by the covariance-model catalog's detector unchanged (lib/steps.mjs lowSteps on revolution time means of the truth, 4 m, K 12, its rule as
// written in the 2025 `dols` files). Truth only: no flight, no forecast. A selection input of rule (c)'s quiet windows, written before any (c) row.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/per-rev-flag-c-catalog.mjs --out results/operator-theory/per-rev-flag/c/catalog
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './lib/xp2.mjs';
import { ORBITS_010 } from './lib/build.mjs';
import { DO9 } from './lib/regimes.mjs';
import { openElements, revolutions, lowSteps } from './lib/steps.mjs';
import { ALTIMETRY } from './per-rev-flag-c.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
if (!OUT) throw new Error('--out');
const RULE = JSON.parse(fs.readFileSync('/opt/data/sdn-archive/operator-theory/covariance-model/steps/dols-36508.json', 'utf8')).rule;
const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
const el = await openElements({ build: ORBITS_010 });
fs.mkdirSync(OUT, { recursive: true });
for (const a of ALTIMETRY) {
  const o = DO9.find((x) => x.name === a.name), files = o.files();
  if (!files.length) { console.error(`${a.name}: no spring 2026 product`); continue; }
  const s = SRC.chain(files), revs = await revolutions(s.lines, el), d = lowSteps(revs, RULE);
  fs.writeFileSync(path.join(OUT, `spring2026-${s.norad}.json`), `${JSON.stringify({ set: 'spring2026', norad: s.norad, name: s.name, from: s.lines[0].epoch, to: s.lines.at(-1).epoch, files: files.length, states: s.lines.length, revolutions: revs.length, rule: RULE,
    steps: d.steps.map((x) => ({ t: new Date(x.t).toISOString(), sizeM: Math.round(x.sizeM * 100) / 100 })), checked: d.checked.map(([p, q]) => [new Date(p).toISOString(), new Date(q).toISOString()]) })}\n`);
  console.error(`${a.name}: ${s.lines.length} states, ${revs.length} revolutions, ${d.steps.length} steps`);
}
await el.close();
process.exit(0);
