// Step 2: the registered windows, fitted from the pseudo-observations of the preceding element-set history and scored (PLAN.md). One JSON line per
// window under <store>/rows/<regime>.s<k>.jsonl (identifiers, counts and errors only). Re-running skips windows already present.
//   node experiments/sdn-ap-gp-history-od/run.mjs [--shard k/n] [--regime id,id] [--limit N] [--only <windowKey substring>]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config, windows, store, args, frozen, endOf, windowKey, shardOf, DAY } from './common.mjs';
import { modulesRoot } from '../sdn-gp-starlink-ffm-match/lib/modules.mjs';
import { openBaselines } from '../sdn-gp-starlink-ffm-match/lib/baselines.mjs';
import { openGpPseudo } from '../sdn-gp-starlink-ffm-match/lib/gp-pseudo.mjs';
import { spaceWeatherHistory } from '../sdn-gp-starlink-ffm-match/lib/spw-history.mjs';
import { truthResolver, historyOf, availableSets, heldOf, pseudoOem, baselineArm, xpArm, sdnapArm } from './lib.mjs';

frozen();
const pinCommit = config.sdnap.modulesCommit;
process.env.SDNAP_MODULES_REF = process.env.SDNAP_MODULES_REF ?? pinCommit;
const modules = modulesRoot();
if (execFileSync('git', ['-C', modules, 'rev-parse', `${pinCommit}^{commit}`]).toString().trim() !== pinCommit) throw new Error('the modules checkout lacks the pinned commit');
const b = await openBaselines(modules, { sdngp: true });
if (!b.sdngp.provenance.wasmSha256.startsWith(config.sdnap.wasmSha256Prefix)) throw new Error(`SDN-AP build ${b.sdngp.provenance.wasmSha256.slice(0, 12)} is not the registered ${config.sdnap.wasmSha256Prefix}`);
const weather = spaceWeatherHistory(b.weatherTable).payload;
const truth = truthResolver(modules);
const pseudo = await openGpPseudo(modules);
const shard = shardOf();
const regimes = new Set((args.regime ?? config.regimes.map((r) => r.id).join(',')).split(','));
const limit = args.limit ? Number(args.limit) : Infinity;
const rowsDir = path.join(store, 'rows');
fs.mkdirSync(rowsDir, { recursive: true });
const done = new Set(fs.readdirSync(rowsDir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => fs.readFileSync(path.join(rowsDir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key)));
const intervalMemo = new Map(); // norad -> { gpId|previousEpoch -> interval }
const sink = path.join(rowsDir, `all.s${shard.k}.jsonl`);
const build = b.sdngp.provenance.wasmSha256.slice(0, 12);
let scored = 0;

for (const [i, w] of windows.entries()) {
  if (!shard.mine(i) || !regimes.has(w.regime)) continue;
  if (args.only && !windowKey(w).includes(args.only)) continue;
  const key = windowKey(w);
  if (done.has(key)) continue;
  if (scored >= limit) break;
  const eMs = endOf(w);
  const row = { key, regime: w.regime, source: w.source, id: w.id, norad: w.norad, startUtc: w.startUtc, endUtc: new Date(eMs).toISOString(), build };
  const append = (extra) => { fs.appendFileSync(sink, `${JSON.stringify({ ...row, ...extra })}\n`); scored += 1; };
  const object = await truth.object(w);
  const held = heldOf(object, eMs);
  if (!held) { append({ skipped: 'the truth holds fewer than 20 states after E' }); continue; }
  const sets = availableSets(historyOf(w.norad), eMs);
  if (!sets.length) { append({ skipped: 'no element set available at E' }); continue; }
  const latest = sets.at(-1);
  row.latestSet = { epochUtc: latest.EPOCH, createdUtc: latest.CREATION_DATE, ageHours: (eMs - Date.parse(`${latest.EPOCH}Z`)) / 3600e3 };
  row.setsAvailable = sets.length;
  const baseline = await baselineArm(b, object, latest, held, eMs);
  // pseudo-observations: the interval states of every available set, cut to the 120 h before E
  const memo = intervalMemo.get(w.norad) ?? new Map();
  intervalMemo.set(w.norad, memo);
  const wanted = sets.filter((s) => Date.parse(`${s.EPOCH}Z`) > eMs - (config.pseudoObservations.historyHours + config.pseudoObservations.maxIntervalHours) * 3600e3 - DAY);
  const start = sets.length - wanted.length;
  const intervals = [];
  for (let j = 0; j < wanted.length; j += 1) {
    const prev = j + start > 0 ? sets[j + start - 1] : null;
    const mk = `${wanted[j].GP_ID}|${prev?.EPOCH ?? ''}`;
    if (!memo.has(mk)) memo.set(mk, (await pseudo.intervals(prev ? [prev, wanted[j]] : [wanted[j]], { stepSeconds: config.pseudoObservations.stepSeconds })).at(-1));
    intervals.push(memo.get(mk));
  }
  const states = intervals.flatMap((x) => x.states);
  const failedSets = intervals.filter((x) => x.failed && x.epochMs > eMs - config.pseudoObservations.historyHours * 3600e3).length;
  const p = pseudoOem(object, states, eMs);
  row.pseudo = { states: p.states, failedSets };
  const arms = { 'sgp4-latest': baseline };
  if (!p.sized) { arms['sgp4xp-fit'] = { ok: false, skipped: `fewer than ${config.pseudoObservations.minimumStates} pseudo-observation states` }; arms['sdnap-fit'] = { ok: false, skipped: arms['sgp4xp-fit'].skipped }; } else {
    arms['sgp4xp-fit'] = await xpArm(b, object, p, held, eMs);
    arms['sdnap-fit'] = await sdnapArm(b, object, p, held, eMs, weather);
  }
  append({ arms });
  if (scored % 10 === 0) console.error(`${scored} windows (${w.regime})`);
}
console.error(`shard ${shard.k}/${shard.n}: ${scored} windows`);
await truth.close(); await pseudo.destroy(); await b.close();
process.exit(0);
