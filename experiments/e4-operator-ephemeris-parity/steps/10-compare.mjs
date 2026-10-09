#!/usr/bin/env node
// E4 step 10: one provider's comparison (PLAN.md section 4). For each
// operator file and object: the operator's GCRF states at the horizons, the
// element set at the cut-off, product S (SGP4) and H (HPOP resident with
// covariance), their RTN differences from the operator, and, where truth
// exists, every one of them against truth. Rows go to runs/<id>/rows.jsonl.gz
// (derived from element sets: never committed).
//
//   node experiments/e4-operator-ephemeris-parity/steps/10-compare.mjs --provider spacex-starlink [--limit N]
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
const { values, modules, archive, inputs, truth: truthDir } = cli({ limit: { type: 'string' } });
const provider = values.provider;
const spec = config.providers[provider];
if (!spec) throw new Error(`--provider: one of ${Object.keys(config.providers).join(', ')}`);
const run = startRun({ experiment: config.experiment, step: `10-compare-${provider}`, configPath, modulesDir: modules, args: values });
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
      const tles = record.files.filter((t) => t.role === 'operator-tle' && t.captured <= f.captured).sort((a, b) => a.captured.localeCompare(b.captured)).at(-1);
      const tle = tles ? readTle(readInput(tles).toString('latin1')) : [];
      const byHwid = new Map(tle.map((t) => [t.hwid, t]));
      for (const s of readPlanetStates(readInput(f).toString('latin1'))) {
        const t = byHwid.get(s.hwid);
        if (!t) { out.push({ file: f.file, hwid: s.hwid, skipped: 'no TLE names this HWID' }); continue; }
        const epoch = `${(await convertIso(ctx.modules['foundation/time'], s.epochTT.replace('Z', ''), 'TT', 'UTC')).replace(/Z?$/, '')}Z`;
        const at = Date.parse(epoch);
        out.push({ file: f.file, hwid: s.hwid, norad: t.norad, tc: f.captured, notAfter: iso(at), kind: 'at-epoch',
          states: [{ h: 'at-epoch', epoch: iso(at), state: await toGcrf(frames, spec.frame, iso(at), s.state) }],
          operatorTle: t.epochMs <= at ? { norad: t.norad, epoch: t.epoch, elements: t.elements, file: tles.file } : null });
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

// Intelsat file token -> NORAD by catalog name (config.providers.intelsat.names).
let gpNames = null;
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
      const hits = [...gpNames].filter(([, name]) => name.replace(/\s*\(.*$/, '').trim().toUpperCase() === want && !/\bDEB\b|R\/B/.test(name)).map(([n]) => n);
      return hits.length === 1 ? hits[0] : null;
    },
  };
}

// ── run ──
// Intelsat names resolve against the catalog's object names over the files' window.
if (spec.format === 'intelsat-ecf') {
  const stamps = record.files.map((f) => /_(\d{8})_\d{6}\.txt$/.exec(f.file)[1]).map((d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`).sort();
  const named = readSets(archive, iso(Date.parse(`${stamps[0]}T00:00:00Z`) - config.elementSets.lookbackDays * DAY_MS).slice(0, 10), stamps.at(-1), null, null);
  gpNames = new Map([...named].map(([n, l]) => [n, l.sort((a, b) => a.creationDate.localeCompare(b.creationDate)).at(-1).objectName]));
}
const all = await cases();
let list = all.filter((c) => !c.skipped && c.states?.length);
if (values.limit) list = list.slice(0, Number(values.limit));
log(`${all.length} cases (${all.filter((c) => c.skipped).length} skipped, ${all.filter((c) => !c.skipped && !c.states?.length).length} without a horizon in span), ${list.length} compared`);

// Element sets for every case's cut-off.
const tcs = list.map((c) => Date.parse(c.tc));
const from = iso(Math.min(...tcs) - config.elementSets.lookbackDays * DAY_MS).slice(0, 10), to = iso(Math.max(...tcs)).slice(0, 10);
const sets = readSets(archive, from, to, spec.format === 'intelsat-ecf' ? null : new Set(list.map((c) => c.norad)), run);

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

const rowsFile = path.join(run.dir, 'rows.jsonl');
fs.writeFileSync(rowsFile, '');
const counts = { cases: all.length, skipped: all.filter((c) => c.skipped).map((c) => ({ file: c.file, token: c.token, hwid: c.hwid, reason: c.skipped })), compared: 0, withoutSet: 0, hpopUnavailable: {} };
let done = 0;
for (const c of list) {
  const set = setAt(sets.get(c.norad), Date.parse(c.tc), c.notAfter ? Date.parse(c.notAfter) : Date.parse(c.tc));
  const row = { provider, file: c.file, norad: c.norad, hwid: c.hwid, tc: c.tc, kind: c.kind };
  if (!set) { ++counts.withoutSet; fs.appendFileSync(rowsFile, `${JSON.stringify({ ...row, skipped: 'no element set at the cut-off' })}\n`); continue; }
  Object.assign(row, { setEpoch: set.epoch, setCreated: set.creationDate, setAgeAtCutoffDays: (Date.parse(c.tc) - epochMs(set.epoch)) / DAY_MS });
  const S = await ctx.sgp4Errors(set, c.norad, c.states);
  const H = await ctx.hpop(set, c.norad, c.states);
  if (H.reason) counts.hpopUnavailable[H.reason] = (counts.hpopUnavailable[H.reason] ?? 0) + 1;
  const P = c.operatorTle ? await ctx.sgp4Errors(c.operatorTle, c.norad, c.states) : null;
  const truth = truthStates(c.norad, c.states.map((s) => Date.parse(s.epoch)));
  const truthList = c.states.filter((s) => truth.has(Date.parse(s.epoch))).map((s) => ({ epoch: s.epoch, state: truth.get(Date.parse(s.epoch)) }));
  const ST = truthList.length ? await ctx.sgp4Errors(set, c.norad, truthList) : [];
  row.regime = H.regime ?? null;
  row.horizons = [];
  for (let k = 0; k < c.states.length; ++k) {
    const s = c.states[k], out = { h: s.h, epoch: s.epoch };
    if (S[k]) {
      out.S = S[k].e;
      out.ageDays = S[k].ageDays;
      const cov = ctx.sgp4Covariance(S[k].regimeIndex, S[k].ageDays);
      if (cov) { out.Sc3 = cov.c3; out.Sregime = cov.regime; }
    }
    if (H.samples?.[k]) {
      const d = await ctx.rtnDifference(s.epoch, H.samples[k].state, s.state, s.state, H.samples[k].covariance);
      out.H = d.e;
      if (d.c3) out.Hc3 = d.c3;
    }
    if (P?.[k]) out.P = P[k].e;
    if (s.cov) out.opCov = s.cov;
    const t = truth.get(Date.parse(s.epoch));
    if (t) {
      const j = truthList.findIndex((x) => x.epoch === s.epoch);
      out.truth = {
        op: (await ctx.rtnDifference(s.epoch, s.state, t, t)).e,
        S: ST[j]?.e ?? null,
        H: H.samples?.[k] ? (await ctx.rtnDifference(s.epoch, H.samples[k].state, t, t)).e : null,
      };
    }
    row.horizons.push(out);
  }
  fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`);
  ++counts.compared;
  if (++done % 25 === 0) { log(`${done}/${list.length}`); run.checkpoint(); }
}
if (truthIndex) run.addInputs('truth', truthIndex.read);
fs.writeFileSync(`${rowsFile}.gz`, zlib.gzipSync(fs.readFileSync(rowsFile)));
fs.rmSync(rowsFile);
run.write('counts.json', counts);
run.finish({ provider, counts: { cases: counts.cases, compared: counts.compared, withoutSet: counts.withoutSet, skipped: counts.skipped.length } });
log(`compared ${counts.compared}; without element set ${counts.withoutSet}; skipped ${counts.skipped.length}; HPOP unavailable ${JSON.stringify(counts.hpopUnavailable)}`);
await ctx.destroy();
if (sp3) await sp3.destroy();
