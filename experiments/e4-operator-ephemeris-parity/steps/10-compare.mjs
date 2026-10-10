#!/usr/bin/env node
// E4 step 10: one provider's comparison (PLAN.md section 4, amendment A4).
// For each operator file and object: the operator's GCRF states at the
// horizons, the element set at the cut-off, products S (SGP4), R (the
// resident product), H-epoch and H-arc (full force), their RTN differences
// from the operator, and, where truth exists, every one of them against
// truth. R, H-epoch and H-arc are made once per object and element set, for
// every epoch any file scores with that set. Rows go to runs/<id>/rows.jsonl.gz
// (derived from element sets: never committed).
//
//   node experiments/e4-operator-ephemeris-parity/steps/10-compare.mjs --provider spacex-starlink [--shard 0/6] [--resume RUN_ID] [--limit N]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { gunzipSync } from 'node:zlib';
import { startRun } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { ReferenceIndex } from '../../../harness/reference.mjs';
import { decodeOemStream } from '../../../harness/records.mjs';
import { toGcrf } from '../../../harness/frames.mjs';
import { convertIso } from '../../../harness/time.mjs';
import { DAY_MS, HOUR_MS, assertFrozen, cli, config, configPath } from '../common.mjs';
import { readCpf, readIntelsat, readMeme, readOem, readPlanetStates, readTle, sp3Text, unzipMembers } from '../operators.mjs';
import { gnssIdentities, sp3Context, sp3Satellites } from '../sp3.mjs';
import { epochMs, productContext, readSets, setAt } from '../products.mjs';

assertFrozen();
const { values, modules, archive, inputs, truth: truthDir } = cli({ limit: { type: 'string' }, shard: { type: 'string' }, resume: { type: 'string' } });
const provider = values.provider;
const spec = config.providers[provider];
if (!spec) throw new Error(`--provider: one of ${Object.keys(config.providers).join(', ')}`);
const [shard, shards] = (values.shard ?? '0/1').split('/').map(Number);
const run = startRun({ experiment: config.experiment, step: `10-compare-${provider}${shards > 1 ? `-s${shard}of${shards}` : ''}`, configPath, modulesDir: modules, args: values, resume: values.resume });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const record = JSON.parse(fs.readFileSync(path.join(inputs, provider, 'inputs.json'), 'utf8'));
const iso = (ms) => new Date(ms).toISOString();
const readInput = (f) => {
  const bytes = fs.readFileSync(path.join(inputs, provider, f.file));
  if (sha256(bytes) !== f.sha256) throw new Error(`${f.file}: bytes differ from inputs.json`);
  run.addInputs('operator', { [`${provider}/${f.file}`]: f.sha256 });
  return bytes;
};
const ctx = await productContext(modules, run);
const frames = ctx.modules['foundation/frames'];
let sp3 = null;
const sp3Ctx = async () => (sp3 ??= await sp3Context(modules, run, config.inputs.eopFinals));
const sinex = fs.readFileSync(config.inputs.satelliteMetadata);

// Horizon picks: the first operator epoch at or after tc + h within the span.
function horizons(epochsMs, tc) {
  const out = [];
  for (const h of config.horizonsHours) {
    const goal = tc + h * HOUR_MS;
    const k = epochsMs.findIndex((t) => t >= goal);
    if (k < 0) continue;
    if (epochsMs[k] - goal > config.scoring.maximumGapSeconds * 1000) continue;
    if (out.some((o) => o.index === k)) continue;
    out.push({ h, index: k });
  }
  return out;
}

// ── operator cases: [{file, norad, tc, kind, states: [{h, epoch, state, cov?}]}] ──
async function inertialCase(f, norad, parsed, tc, extra = {}) {
  if (!/^(EME2000|J2000)$/i.test(parsed.frame) || parsed.timeScale !== 'UTC') throw new Error(`${f.file}: ${parsed.frame}/${parsed.timeScale} not handled`);
  const epochs = parsed.epochs.map((e) => Date.parse(e));
  const states = [];
  for (const { h, index } of horizons(epochs, tc)) {
    const epoch = iso(epochs[index]);
    states.push({ h, epoch, state: await toGcrf(frames, spec.frame, epoch, parsed.states[index]), ...(parsed.covariances ? { cov: parsed.covariances[index] } : {}) });
  }
  return { file: f.file, norad, tc: iso(tc), kind: 'forecast', states, ...extra };
}

// Earth-fixed: SP3 bytes -> GCRF blocks by the modules -> horizon states.
function blockCases(f, blocks, tcOf, kind) {
  return blocks.map((b) => {
    const lines = b.block.EPHEMERIS_DATA_LINES;
    const epochs = lines.map((l) => Date.parse(l.EPOCH));
    const tc = tcOf(epochs);
    const states = horizons(epochs, tc).map(({ h, index }) => ({ h, epoch: iso(epochs[index]), state: ['X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT'].map((k) => lines[index][k] * 1000) }));
    return { file: f.file, norad: b.norad, tc: iso(tc), kind, states };
  });
}

async function cases() {
  const out = [];
  const files = record.files.filter((f) => f.role === 'ephemeris');
  if (spec.format === 'meme') {
    for (const f of files) {
      const parsed = readMeme(readInput(f).toString('latin1'));
      out.push(await inertialCase(f, Number(/MEME_(\d+)_/.exec(f.file)[1]), parsed, Date.parse(parsed.created), { covarianceAxes: 'UVW' }));
    }
  } else if (spec.format === 'ccsds-oem' || spec.format === 'ccsds-oem-zip') {
    for (const f of files) {
      const bytes = readInput(f);
      const texts = spec.format === 'ccsds-oem' ? [bytes.toString('latin1')] : unzipMembers(bytes).filter((m) => !m.name.endsWith('/')).map((m) => m.bytes.toString('latin1'));
      for (const text of texts) {
        const parsed = readOem(text);
        out.push(await inertialCase(f, spec.norad, parsed, Date.parse(parsed.created)));
      }
    }
  } else if (spec.format === 'planet-states') {
    for (const f of files) {
      const sets = record.files.filter((t) => t.role === 'operator-tle' && t.captured <= f.captured).sort((a, b) => a.captured.localeCompare(b.captured)).at(-1);
      const operatorSets = sets ? readTle(readInput(sets).toString('latin1')) : [];
      const byHwid = new Map(operatorSets.map((t) => [t.hwid, t]));
      for (const s of readPlanetStates(readInput(f).toString('latin1'))) {
        const t = byHwid.get(s.hwid);
        if (!t) { out.push({ file: f.file, hwid: s.hwid, skipped: 'no element set names this HWID' }); continue; }
        const epoch = `${(await convertIso(ctx.modules['foundation/time'], s.epochTT.replace('Z', ''), 'TT', 'UTC')).replace(/Z?$/, '')}Z`;
        const at = Date.parse(epoch);
        out.push({ file: f.file, hwid: s.hwid, norad: t.norad, tc: f.captured, notAfter: iso(at), kind: 'at-epoch',
          states: [{ h: 'at-epoch', epoch: iso(at), state: await toGcrf(frames, spec.frame, iso(at), s.state) }],
          operatorSet: t.epochMs <= at ? { norad: t.norad, epoch: t.epoch, elements: t.elements, file: sets.file } : null });
      }
    }
  } else if (spec.format === 'intelsat-ecf') {
    const names = intelsatNames();
    for (const f of files) {
      const token = /_([a-z0-9-]+)_\d{8}_\d{6}\.txt$/.exec(f.file)[1];
      const norad = names.resolve(token);
      if (!norad) { out.push({ file: f.file, token, skipped: `no unique catalog name for ${names.target(token)}` }); continue; }
      const m = /_(\d{8})_(\d{6})\.txt$/.exec(f.file);
      const tc = Date.parse(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)}T${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4)}Z`);
      const parsed = readIntelsat(readInput(f).toString('latin1'));
      const text = sp3Text('L01', parsed.rows, 'UTC', [`INTELSAT ECF ${token} TRANSCRIBED TO SP3-C, KM, UTC`, f.url]);
      const blocks = await (await sp3Ctx()).convert(text, { product: f.file, source: f.url, statedSigmaM: spec.statedSigmaM, statedSigmaBasis: spec.statedSigmaBasis,
        satellites: { L01: { norad, objectId: '', name: parsed.title } } });
      out.push(...blockCases(f, blocks, () => tc, 'forecast'));
    }
  } else if (spec.format === 'ses-i11') {
    // A4: the eleven-parameter model evaluated by files/orbit-products, its
    // Earth-fixed positions transcribed into SP3-c like Intelsat's.
    const names = sesNames();
    for (const f of files) {
      let ses;
      try { ses = await (await sp3Ctx()).ses(readInput(f)); } catch (error) { out.push({ file: f.file, skipped: `normalize_ses_i11 refused the file: ${error.message.slice(0, 200)}` }); continue; }
      const norad = names.resolve(ses.name);
      if (!norad) { out.push({ file: f.file, token: ses.name, skipped: `no unique catalog name for ${names.key(ses.name)}` }); continue; }
      const text = sp3Text('L01', ses.rows, 'UTC', [`SES I11 ${ses.name} EVALUATED BY ORBIT-PRODUCTS, KM, UTC`, f.url]);
      const blocks = await (await sp3Ctx()).convert(text, { product: f.file, source: f.url, statedSigmaM: spec.statedSigmaM, statedSigmaBasis: spec.statedSigmaBasis,
        satellites: { L01: { norad, objectId: '', name: ses.name } } });
      out.push(...blockCases(f, blocks, () => Date.parse(f.captured), 'forecast'));
    }
  } else if (spec.format === 'cpf') {
    for (const f of files) {
      const parsed = readCpf(readInput(f).toString('latin1'));
      if (parsed.frame !== 0) { out.push({ file: f.file, skipped: `CPF reference frame ${parsed.frame}` }); continue; }
      const text = sp3Text('L01', parsed.rows, 'UTC', [`CPF ${parsed.target} TRANSCRIBED TO SP3-C, KM, UTC`, f.url]);
      const blocks = await (await sp3Ctx()).convert(text, { product: f.file, source: f.url, statedSigmaM: spec.statedSigmaM, statedSigmaBasis: spec.statedSigmaBasis,
        satellites: { L01: { norad: parsed.norad, objectId: '', name: parsed.target } } });
      out.push(...blockCases(f, blocks, () => Date.parse(parsed.created), 'forecast'));
    }
  } else if (spec.format === 'sp3') {
    for (const f of files) {
      const text = gunzipSync(readInput(f));
      const ids = sp3Satellites(text.toString('latin1'));
      const single = Object.entries(spec.singleSatellite ?? {}).find(([k]) => f.file.includes(k));
      let satellites;
      if (single) satellites = { [ids[0]]: { norad: single[1], objectId: '', name: single[0] } };
      else {
        const mid = (Date.parse(f.span?.[0]?.replace(/^(\d{4}) +(\d+) +(\d+) +(\d+) +(\d+) .*$/, (_, y, mo, d, h, mi) => `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:00Z`)) || Date.parse(f.captured)) + DAY_MS / 2;
        satellites = Object.fromEntries(Object.entries(gnssIdentities(sinex.toString(), mid)).filter(([prn]) => spec.systems.includes(prn[0]) && ids.includes(prn)));
      }
      const definitive = spec.cutoff === 'span-start';
      const blocks = await (await sp3Ctx()).convert(text, { product: f.file, source: f.url, satellites, ...(spec.statedSigmaM ? { statedSigmaM: spec.statedSigmaM, statedSigmaBasis: spec.statedSigmaBasis } : {}) });
      out.push(...blockCases(f, blocks, (epochs) => (definitive ? epochs[0] : Date.parse(f.captured)), definitive ? 'definitive' : 'forecast'));
    }
  }
  return out;
}

// Catalog names over the files' window: norad -> the latest OBJECT_NAME.
let gpNames = null;
function catalogNames(days) {
  const named = readSets(archive, iso(Date.parse(`${days[0]}T00:00:00Z`) - config.elementSets.lookbackDays * DAY_MS).slice(0, 10), days.at(-1), null, null);
  return new Map([...named].map(([n, l]) => [n, l.sort((a, b) => a.creationDate.localeCompare(b.creationDate)).at(-1).objectName]));
}
const payload = (name) => !/\bDEB\b|R\/B/.test(name);

// Intelsat file token -> NORAD by catalog name (config.providers.intelsat.names).
function intelsatNames() {
  const rule = spec.names;
  const target = (token) => {
    if (rule.aliases[token]) return rule.aliases[token];
    const m = /^([a-z]+\d*[a-z]*?)-?([0-9a-z]+)?$/.exec(token);
    if (rule.prefixes[token]) return rule.prefixes[token];
    const [prefix, rest] = token.includes('-') ? token.split('-') : [token, ''];
    return rule.prefixes[prefix] ? `${rule.prefixes[prefix]} ${rest.toUpperCase()}`.trim() : (m ? token.toUpperCase() : token);
  };
  return {
    target,
    resolve(token) {
      const want = target(token);
      const hits = [...gpNames].filter(([, name]) => name.replace(/\s*\(.*$/, '').trim().toUpperCase() === want && payload(name)).map(([n]) => n);
      return hits.length === 1 ? hits[0] : null;
    },
  };
}

// SES satellite name -> NORAD (config.providers.ses.names): upper case,
// without a parenthesised suffix, spaces and hyphens removed.
function sesNames() {
  const key = (name) => name.replace(/\s*\(.*$/, '').toUpperCase().replace(/[\s-]+/g, '');
  return {
    key,
    resolve(name) {
      const want = key(name);
      const hits = [...gpNames].filter(([, n]) => key(n) === want && payload(n)).map(([n]) => n);
      return hits.length === 1 ? hits[0] : null;
    },
  };
}

// ── run ──
// Intelsat and SES names resolve against the catalog's object names over the files' window.
if (spec.format === 'intelsat-ecf') gpNames = catalogNames(record.files.map((f) => /_(\d{8})_\d{6}\.txt$/.exec(f.file)[1]).map((d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`).sort());
if (spec.format === 'ses-i11') gpNames = catalogNames(record.files.map((f) => f.captured.slice(0, 10)).sort());
const all = await cases();
let list = all.filter((c) => !c.skipped && c.states?.length);
if (values.limit) list = list.slice(0, Number(values.limit));
log(`${all.length} cases (${all.filter((c) => c.skipped).length} skipped, ${all.filter((c) => !c.skipped && !c.states?.length).length} without a horizon in span), ${list.length} compared`);

// Element sets for every case's cut-off (the first run's window), and the
// days before it that H-arc's arcs reach back to (A4).
const tcs = list.map((c) => Date.parse(c.tc));
const from = iso(Math.min(...tcs) - config.elementSets.lookbackDays * DAY_MS).slice(0, 10), to = iso(Math.max(...tcs)).slice(0, 10);
const norads = new Set(list.map((c) => c.norad));
const sets = readSets(archive, from, to, norads, run);
const before = readSets(archive, iso(Date.parse(`${from}T00:00:00Z`) - (config.a4.fit.spanDays + 1) * DAY_MS).slice(0, 10), iso(Date.parse(`${from}T00:00:00Z`) - DAY_MS).slice(0, 10), norads, run);
const arcPool = new Map([...norads].map((n) => {
  const byId = new Map([...(before.get(n) ?? []), ...(sets.get(n) ?? [])].map((s) => [s.gpId, s]));
  return [n, [...byId.values()]];
}));

// Truth for the case's objects and horizons, when the provider has it.
let truthIndex = null;
if (spec.truth && fs.existsSync(path.join(truthDir, 'reference'))) truthIndex = new ReferenceIndex(path.join(truthDir, 'reference'), spec.truth);
function truthStates(norad, epochs) {
  if (!truthIndex) return new Map();
  const lo = Math.min(...epochs), hi = Math.max(...epochs);
  const out = new Map();
  for (const f of truthIndex.frames(norad, lo - 1000, hi + 1000))
    for (const o of decodeOemStream(new Uint8Array(f.payload)))
      for (const l of o.EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES) {
        const t = Date.parse(l.EPOCH);
        if (epochs.includes(t)) out.set(t, ['X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT'].map((k) => l[k] * 1000));
      }
  return out;
}

// Cases by object and element set; this shard's groups.
const rowsFile = path.join(run.dir, 'rows.jsonl');
const done = new Set(fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).group) : []);
if (!fs.existsSync(rowsFile)) fs.writeFileSync(rowsFile, '');
const counts = { cases: all.length, skipped: all.filter((c) => c.skipped).map((c) => ({ file: c.file, token: c.token, hwid: c.hwid, reason: c.skipped })), compared: 0, withoutSet: 0, groups: 0, reasons: {} };
const groups = new Map();
for (const c of list) {
  const set = setAt(sets.get(c.norad), Date.parse(c.tc), c.notAfter ? Date.parse(c.notAfter) : Date.parse(c.tc));
  const key = set ? `${c.norad}|${set.gpId}` : `${c.norad}|none`;
  if (!groups.has(key)) groups.set(key, { key, norad: c.norad, set, cases: [] });
  groups.get(key).cases.push(c);
}
const order = [...groups.values()].sort((a, b) => a.norad - b.norad || (a.set && b.set ? epochMs(a.set.epoch) - epochMs(b.set.epoch) : a.set ? 1 : -1));
const mine = order.filter((_, i) => i % shards === shard);
log(`${groups.size} object-set groups; shard ${shard}/${shards}: ${mine.length}${done.size ? `, ${done.size} done before` : ''}`);
const note = (reason) => { if (reason) counts.reasons[reason] = (counts.reasons[reason] ?? 0) + 1; };

let processed = 0;
const started = Date.now();
for (const g of mine) {
  if (done.has(g.key)) continue;
  const rows = [];
  if (!g.set) {
    for (const c of g.cases) rows.push({ group: g.key, provider, file: c.file, norad: c.norad, hwid: c.hwid, tc: c.tc, kind: c.kind, skipped: 'no element set at the cut-off' });
  } else {
    // R, H-epoch and H-arc at the union of the group's epochs.
    const union = new Map();
    for (const c of g.cases) for (const s of c.states) if (!union.has(s.epoch)) union.set(s.epoch, { epoch: s.epoch, state: s.state });
    const epochs = [...union.values()].sort((a, b) => Date.parse(a.epoch) - Date.parse(b.epoch));
    let products;
    try {
      products = await ctx.setProducts(g.set, g.norad, provider, arcPool.get(g.norad), epochs);
    } catch (error) {
      products = { regime: null, forceRegime: null, R: new Map(), He: new Map(), Ha: new Map(), info: { error: String(error.message).slice(0, 300) } };
    }
    const info = products.info;
    for (const k of ['reason', 'rCovariance', 'fullForce', 'hEpochError', 'hArc', 'hArcError', 'error']) note(info[k] ? `${k}: ${String(info[k]).replace(/\d+(\.\d+)?/g, 'n')}` : null);
    for (const c of g.cases) {
      const set = g.set;
      const row = { group: g.key, provider, file: c.file, norad: c.norad, hwid: c.hwid, tc: c.tc, kind: c.kind,
        setEpoch: set.epoch, setCreated: set.creationDate, setAgeAtCutoffDays: (Date.parse(c.tc) - epochMs(set.epoch)) / DAY_MS,
        regime: products.regime, forceRegime: products.forceRegime, h: info };
      const S = await ctx.sgp4Errors(set, c.norad, c.states);
      const P = c.operatorSet ? await ctx.sgp4Errors(c.operatorSet, c.norad, c.states) : null;
      const truth = truthStates(c.norad, c.states.map((s) => Date.parse(s.epoch)));
      const truthList = c.states.filter((s) => truth.has(Date.parse(s.epoch))).map((s) => ({ epoch: s.epoch, state: truth.get(Date.parse(s.epoch)) }));
      const ST = truthList.length ? await ctx.sgp4Errors(set, c.norad, truthList) : [];
      row.horizons = [];
      for (let k = 0; k < c.states.length; ++k) {
        const s = c.states[k], out = { h: s.h, epoch: s.epoch };
        if (S[k]) {
          out.S = S[k].e;
          out.ageDays = S[k].ageDays;
          const cov = ctx.sgp4Covariance(S[k].regimeIndex, S[k].ageDays);
          if (cov) { out.Sc3 = cov.c3; out.Sregime = cov.regime; }
        }
        for (const name of ['R', 'He', 'Ha']) {
          const ours = products[name].get(s.epoch);
          if (!ours) continue;
          const d = await ctx.rtnDifference(s.epoch, ours.state, s.state, s.state, ours.covariance, ours.n ?? 6);
          out[name] = d.e;
          if (d.c3) out[`${name}c3`] = d.c3;
        }
        if (P?.[k]) out.P = P[k].e;
        if (s.cov) out.opCov = s.cov;
        const t = truth.get(Date.parse(s.epoch));
        if (t) {
          const j = truthList.findIndex((x) => x.epoch === s.epoch);
          out.truth = { op: (await ctx.rtnDifference(s.epoch, s.state, t, t)).e, S: ST[j]?.e ?? null };
          for (const name of ['R', 'He', 'Ha']) {
            const ours = products[name].get(s.epoch);
            out.truth[name] = ours ? (await ctx.rtnDifference(s.epoch, ours.state, t, t)).e : null;
          }
        }
        row.horizons.push(out);
      }
      rows.push(row);
    }
  }
  fs.appendFileSync(rowsFile, rows.map((r) => `${JSON.stringify(r)}\n`).join(''));
  ++processed;
  if (processed % 10 === 0) {
    const rate = (Date.now() - started) / processed / 1000;
    log(`${processed}/${mine.length - done.size} groups, ${rate.toFixed(1)} s per group`);
    run.checkpoint();
  }
}
if (truthIndex) run.addInputs('truth', truthIndex.read);
const written = fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
counts.groups = new Set(written.map((r) => r.group)).size;
counts.compared = written.filter((r) => r.horizons).length;
counts.withoutSet = written.filter((r) => r.skipped).length;
counts.reasons = {};
for (const g of new Map(written.filter((r) => r.h).map((r) => [r.group, r.h])).values())
  for (const k of ['reason', 'rCovariance', 'fullForce', 'hEpochError', 'hArc', 'hArcError', 'error']) note(g[k] ? `${k}: ${String(g[k]).replace(/\d+(\.\d+)?/g, 'n')}` : null);
fs.writeFileSync(`${rowsFile}.gz`, zlib.gzipSync(fs.readFileSync(rowsFile)));
fs.rmSync(rowsFile);
run.write('counts.json', counts);
run.finish({ provider, shard: `${shard}/${shards}`, counts: { cases: counts.cases, groups: counts.groups, compared: counts.compared, withoutSet: counts.withoutSet, skipped: counts.skipped.length } });
log(`compared ${counts.compared} in ${counts.groups} groups; without element set ${counts.withoutSet}; skipped ${counts.skipped.length}; ${JSON.stringify(counts.reasons)}`);
await ctx.destroy();
if (sp3) await sp3.destroy();
