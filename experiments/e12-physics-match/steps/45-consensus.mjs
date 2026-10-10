// Step 45: each provider's (CPF: each centre's) consensus configuration from
// the dev tournaments (PLAN.md section 8): per axis, the level most dev
// segments identified with strong or moderate confidence; the default's level
// where none did. The joint DRAG axis votes as one.
//   node steps/45-consensus.mjs --run <step-40 dev run id> [--out file]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { ORDER } from '../gauntlet.mjs';

const { values } = parseArgs({ options: { run: { type: 'string' }, out: { type: 'string' } } });
const rows = values.run.split(',').flatMap((id) => fs.readFileSync(path.join(repoRoot, 'runs', id, 'cases.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const groups = {};
for (const r of rows.filter((x) => !x.error)) for (const c of r.chunks ?? []) {
  const g = (groups[r.group] ??= { segments: 0, votes: {} });
  ++g.segments;
  for (const axis of ORDER) {
    const conf = c.confidence?.[axis];
    if (conf !== 'strong' && conf !== 'moderate') continue;
    const level = axis === 'DRAG' ? [c.identified.atmosphere, c.identified.spaceWeather] : c.identified[axis];
    const key = JSON.stringify(level);
    ((g.votes[axis] ??= {})[key] ??= 0);
    ++g.votes[axis][key];
  }
}
for (const g of Object.values(groups)) {
  g.hypothesis = {};
  for (const [axis, v] of Object.entries(g.votes)) {
    const [best, n] = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
    if (n * 2 <= Object.values(v).reduce((a, b) => a + b, 0) && Object.keys(v).length > 1) continue; // no majority
    const level = JSON.parse(best);
    if (axis === 'DRAG') Object.assign(g.hypothesis, { atmosphere: level[0], spaceWeather: level[1] });
    else g.hypothesis[axis] = level;
  }
}
const file = values.out ?? path.join(repoRoot, 'runs', `e12-physics-match-45-consensus-${values.run.split(',')[0]}.json`);
fs.writeFileSync(file, `${JSON.stringify({ sourceRuns: values.run.split(','), groups }, null, 1)}\n`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, g.hypothesis]))));
console.log(file);
