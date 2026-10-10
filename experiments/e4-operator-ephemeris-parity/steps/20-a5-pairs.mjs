#!/usr/bin/env node
// E4 step 20 (amendment A5): the pairs EPH-fit is scored on, shared with E11
// and E9. For each provider of config.a5.pairs, each paired operator file
// and object: the cutoff T_c (E4's rule), the validation split, the file's
// span, E4's within-span horizons, and the scoring references within the
// span and 6 h, 1 d, 3 d and 7 d past its end (truth, a later operator file,
// or a later Planet state; labelled). Operator metadata only; no element set is
// read. Output: results/e4/a5/pairs.json (committed).
//
//   node experiments/e4-operator-ephemeris-parity/steps/20-a5-pairs.mjs [--provider p,q]
import fs from 'node:fs';
import path from 'node:path';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { ReferenceIndex } from '../../../harness/reference.mjs';
import { DAY_MS, HOUR_MS, assertFrozen, cli, config, configPath } from '../common.mjs';
import { productContext, readSets } from '../products.mjs';
import { sp3Context } from '../sp3.mjs';
import { OperatorFiles, horizonIndices, iso, laterAt, laterPlanetState, splitOf, truthAt, truthAtOrAfter } from '../a5.mjs';

assertFrozen();
const { values, modules, archive, inputs, truth: truthDir } = cli();
const A = config.a5;
const run = startRun({ experiment: config.experiment, step: '20-a5-pairs', configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const ctx = await productContext(modules, run);
let sp3 = null;
const sp3Ctx = async () => (sp3 ??= await sp3Context(modules, run, config.inputs.eopFinals));
const sinex = fs.readFileSync(config.inputs.satelliteMetadata);
const tolerance = A.referenceToleranceSeconds * 1000;
const out = { experiment: config.experiment, amendment: 'A5', generated: new Date().toISOString(), note: 'Pairs, cutoffs, split and scoring references of E4 amendment A5; E11 and E9 use the same pairs. Operator metadata only.', providers: {} };

// Catalog names (Intelsat, SES) as step 10 resolves them.
function namesFor(provider, files) {
  const days = files.map((f) => f.captured.slice(0, 10)).sort();
  const named = readSets(archive, iso(Date.parse(`${days[0]}T00:00:00Z`) - config.elementSets.lookbackDays * DAY_MS).slice(0, 10), days.at(-1), null, null);
  const latest = new Map([...named].map(([n, l]) => [n, l.sort((a, b) => a.creationDate.localeCompare(b.creationDate)).at(-1).objectName]));
  const payload = (name) => !/\bDEB\b|R\/B/.test(name);
  if (provider === 'ses') {
    const key = (name) => name.replace(/\s*\(.*$/, '').toUpperCase().replace(/[\s-]+/g, '');
    return { resolve: (name) => { const hits = [...latest].filter(([, n]) => key(n) === key(name) && payload(n)).map(([n]) => n); return hits.length === 1 ? hits[0] : null; } };
  }
  const rule = config.providers.intelsat.names;
  const target = (token) => {
    if (rule.aliases[token]) return rule.aliases[token];
    const m = /^([a-z]+\d*[a-z]*?)-?([0-9a-z]+)?$/.exec(token);
    if (rule.prefixes[token]) return rule.prefixes[token];
    const [prefix, rest] = token.includes('-') ? token.split('-') : [token, ''];
    return rule.prefixes[prefix] ? `${rule.prefixes[prefix]} ${rest.toUpperCase()}`.trim() : (m ? token.toUpperCase() : token);
  };
  return { resolve: (token) => { const want = target(token); const hits = [...latest].filter(([, n]) => n.replace(/\s*\(.*$/, '').trim().toUpperCase() === want && payload(n)).map(([n]) => n); return hits.length === 1 ? hits[0] : null; } };
}

for (const provider of A.pairs.providers.filter((p) => !values.provider || values.provider.split(',').includes(p))) {
  const spec = config.providers[provider];
  const readInput = (f) => {
    const bytes = fs.readFileSync(path.join(inputs, provider, f.file));
    if (sha256(bytes) !== f.sha256) throw new Error(`${f.file}: bytes differ from inputs.json`);
    run.addInputs('operator', { [`${provider}/${f.file}`]: f.sha256 });
    return bytes;
  };
  const record = JSON.parse(fs.readFileSync(path.join(inputs, provider, 'inputs.json'), 'utf8'));
  const gpNames = ['intelsat-ecf', 'ses-i11'].includes(spec.format) ? namesFor(provider, record.files) : null;
  const ops = new OperatorFiles({ provider, inputs, readInput, ctx, sp3Ctx, sinex, gpNames });
  const truthIndex = spec.truth && fs.existsSync(path.join(truthDir, 'reference')) ? new ReferenceIndex(path.join(truthDir, 'reference'), spec.truth) : null;

  // E4's paired files (role "ephemeris"), restricted per config.a5.pairs.
  let paired = record.files.filter((f) => f.role === 'ephemeris');
  if (provider === 'planet') {
    paired = A.pairs.planet.cutoffDays.map((day) => paired.filter((f) => f.captured.startsWith(day)).sort((a, b) => a.captured.localeCompare(b.captured))[0]).filter(Boolean);
  }
  if (A.pairs.firstFilePerDay.includes(provider)) {
    const byDay = new Map();
    for (const f of [...paired].sort((a, b) => a.captured.localeCompare(b.captured))) if (!byDay.has(f.captured.slice(0, 10))) byDay.set(f.captured.slice(0, 10), f);
    paired = [...byDay.values()];
  }
  const pairs = [];
  const histories = new Map();
  const historyOf = async (norad) => { if (!histories.has(norad)) histories.set(norad, await ops.history(norad)); return histories.get(norad); };
  for (const f of paired) {
    for (const [norad, t] of await ops.load(f)) {
      // T_c: E4's cutoff for the file (stated creation, else capture).
      const tc = spec.format === 'intelsat-ecf' || ['meme', 'ccsds-oem', 'ccsds-oem-zip', 'cpf'].includes(spec.format) ? t.issueMs : Date.parse(f.captured);
      const history = await historyOf(norad);
      const pair = { provider, norad, file: f.file, sha256: f.sha256, tc: iso(tc), issued: iso(t.issueMs), split: splitOf(norad), row: A.forceRow[provider],
        start: iso(t.start), end: iso(t.end), within: [], beyond: [] };
      if (spec.format === 'planet-states') {
        pair.within.push({ h: 'at-epoch', epoch: iso(t.epochs[0]) });
      } else {
        for (const { h, k } of horizonIndices(t, tc)) {
          const ms = t.epochs[k];
          const entry = { h, epoch: iso(ms) };
          if (truthIndex) {
            const tr = truthAt(truthIndex, norad, ms);
            if (tr) entry.reference = { source: `truth ${spec.truth}`, epoch: iso(ms) };
          } else {
            const later = await laterAt(history, tc, ms, tolerance);
            if (later) entry.reference = { source: 'later operator ephemeris', epoch: iso(later.ms), file: later.file, issued: iso(later.issueMs) };
          }
          pair.within.push(entry);
        }
      }
      const base = spec.format === 'planet-states' ? tc : t.end;
      for (const h of A.beyondHours) {
        const target = base + h * HOUR_MS;
        let reference = null;
        if (truthIndex) {
          const tr = truthAtOrAfter(truthIndex, norad, target, tolerance);
          if (tr) reference = { source: `truth ${spec.truth}`, epoch: iso(tr.ms) };
        } else if (spec.format === 'planet-states') {
          const later = await laterPlanetState(history, tc, target, A.planetReferenceToleranceHours * HOUR_MS);
          if (later) reference = { source: 'later Planet state', epoch: iso(later.ms), file: later.file, issued: iso(later.issueMs) };
        } else {
          const later = await laterAt(history, tc, target, tolerance);
          if (later) reference = { source: 'later operator ephemeris', epoch: iso(later.ms), file: later.file, issued: iso(later.issueMs) };
        }
        pair.beyond.push({ h, target: iso(target), reference });
      }
      pairs.push(pair);
    }
  }
  if (truthIndex) run.addInputs('truth', truthIndex.read);
  pairs.sort((a, b) => a.tc.localeCompare(b.tc) || a.norad - b.norad);
  out.providers[provider] = { pairedFiles: paired.length, pairs };
  const n = (s) => pairs.filter((p) => p.split === s).length;
  log(`${provider}: ${paired.length} files, ${pairs.length} pairs (validation ${n('validation')}, test ${n('test')}); beyond-span references ${pairs.reduce((a, p) => a + p.beyond.filter((b) => b.reference).length, 0)}`);
}
const dir = path.join(repoRoot, 'results', 'e4', 'a5');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, values.provider ? `pairs-${values.provider.replace(/,/g, '-')}.json` : 'pairs.json');
fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
run.finish({ pairs: Object.fromEntries(Object.entries(out.providers).map(([p, v]) => [p, v.pairs.length])) });
log(path.relative(process.cwd(), file));
await ctx.destroy();
if (sp3) await sp3.destroy();
