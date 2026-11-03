// node rebase-truth.mjs <part1 frozen-constants.json>: truth-objects.json from Part 1's placements (PLAN.md amendment 14).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), file = path.join(here, 'truth-objects.json');
const raw = fs.readFileSync(process.argv[2]), p1 = JSON.parse(raw), old = JSON.parse(fs.readFileSync(file));
const was = new Map(old.objects.map((o) => [o.norad, o])), ESA = ['2024-09-24', '2026-05-31'];
const objects = Object.entries(p1.placements).map(([n, v]) => { const o = was.get(Number(n)); return o ? { ...o, cluster: v.cluster, part1Regime: v.regimes[0] } : { name: `NORAD ${n}`, norad: Number(n), cluster: v.cluster, from: ESA[0], to: ESA[1], c2cal: true, part1Regime: v.regimes[0] }; });
const kept = new Set(objects.map((o) => o.norad));
const out = { note: old.note + '. Rebased on Part 1 placements (PLAN.md amendment 14).', part1FrozenConstantsSha256: crypto.createHash('sha256').update(raw).digest('hex'),
  droppedFromEarlierTable: old.objects.filter((o) => !kept.has(o.norad)).map((o) => o.norad), enteredFromPart1: objects.filter((o) => !was.has(o.norad)).map((o) => o.norad), objects };
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(objects.length, 'dropped', out.droppedFromEarlierTable.length, 'entered', out.enteredFromPart1.length);
