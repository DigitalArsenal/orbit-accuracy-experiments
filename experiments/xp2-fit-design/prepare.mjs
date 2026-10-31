// XP2F data preparation, before any score (PLAN.md, Dates). No orbit is scored here; the GRACE-FO arcs and the public sets are read and written, not compared with anything but their own earlier conversion.
//   node experiments/xp2-fit-design/prepare.mjs --rsga              the normalized bulletins and their counts (lib/rsga.mjs)
//   node experiments/xp2-fit-design/prepare.mjs --public [--k K --n N]   XM's extraction of the public sets for these creation days
//   node experiments/xp2-fit-design/prepare.mjs --rso               the GRACE-FO arcs of the primary span to <store>/reference
//   node experiments/xp2-fit-design/prepare.mjs --rso-compare       a spent day's arcs converted to a temporary folder and compared with XM's store, byte for byte
import fs from 'node:fs';
import path from 'node:path';
import { config, store, root, args, write, DAY, frozen, XM } from './common.mjs';

frozen();
const objects = config.objects;
if (args.rsga) {
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const { prepareRsga, countsOf } = await import('./lib/rsga.mjs');
  const records = prepareRsga({ bundles: config.spaceWeather.bundles, store, parseRsga: W.parseRsga });
  const counts = { extension: countsOf(records, '20241228RSGA.txt', '20250930RSGA.txt'), primary: countsOf(records, '20250930RSGA.txt', '20251221RSGA.txt') };
  write(path.join(store, 'inputs/rsga-normalization.json'), { counts, records: records.filter((r) => r.actions.length || !r.parsed), bulletins: records.length });
  console.log(JSON.stringify(counts, null, 1));
}
if (args.public) {
  const P = await import(path.join(root, config.xm.dir, 'lib/public.mjs'));
  P.extract(objects.map((o) => o.norad), Number(args.k ?? 0), Number(args.n ?? 1));
  const e = P.extraction();
  console.log(`extraction: ${e.extracted} of ${e.days} days`);
}
if (args.rso || args['rso-compare']) {
  const { convertCode } = await import('./lib/rso.mjs');
  const compare = !!args['rso-compare'];
  const out = compare ? fs.mkdtempSync(path.join(process.env.TMPDIR ?? store, 'xp2f-rso-')) : path.join(store, 'reference');
  const lo = compare ? Date.parse('2026-03-09T00:00:00Z') : Date.parse(`${config.spans.primary.from}T00:00:00Z`) - 4 * DAY;
  const hi = compare ? Date.parse('2026-03-09T12:00:00Z') : Date.parse(`${config.spans.primary.to}T00:00:00Z`) + 7 * DAY;
  const summary = {};
  for (const o of objects.filter((x) => x.truth === 'gfz-rso')) {
    const t0 = Date.now();
    const r = await convertCode(o.code, { norad: o.norad, objectId: o.objectId, name: o.name }, lo, hi, out);
    summary[o.code] = { norad: o.norad, converted: r.converted, skipped: r.skipped, seconds: Math.round((Date.now() - t0) / 1000) };
    console.log(`${o.code} ${o.name}: ${r.converted} arcs converted, ${r.skipped.length} skipped (${summary[o.code].seconds} s)`);
  }
  if (compare) {
    const xmRef = path.join(config.xm.rows, '../reference');
    let same = 0, diff = 0;
    for (const d of fs.readdirSync(out)) for (const f of fs.readdirSync(path.join(out, d))) { const a = fs.readFileSync(path.join(out, d, f)), b = fs.readFileSync(path.join(xmRef, d, f)); if (a.equals(b)) same += 1; else { diff += 1; console.log(`DIFF ${d}/${f}`); } }
    console.log(`compared with XM's store: ${same} files equal, ${diff} differ`);
    fs.rmSync(out, { recursive: true });
    if (diff) process.exit(1);
  } else write(path.join(store, 'inputs/rso-conversion.json'), { from: new Date(lo).toISOString(), to: new Date(hi).toISOString(), codes: summary });
}
process.exit(0);
