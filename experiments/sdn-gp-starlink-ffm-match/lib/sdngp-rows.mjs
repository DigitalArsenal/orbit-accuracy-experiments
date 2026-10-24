// Where the SDN-AP arm keeps its rows (amendment A9b): one directory per build of the module, <store>/rows/sdngp/<wasm SHA-256 prefix>/, with
// build.json (hash, side-B source commit, uncommitted files, first use) and one file per source and shard, <source>.s<k>.jsonl. Rows of different
// builds are never merged. A sink hands a shard its windows (every n-th of a fixed enumeration), remembers the windows already scored, and appends.
import fs from 'node:fs';
import path from 'node:path';
import { store } from '../common.mjs';

const readLines = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
export const rowKey = (r) => `${r.source}|${r.id}|${r.startUtc}|${r.fitSeconds}`;
export const sdngpRoot = () => path.join(store, 'rows/sdngp');

/** b: the opened baselines with `sdngp`; source: the file stem; shard: 'k/n' (default the whole). */
export function sdngpSink(b, source, shard) {
  const prov = b.sdngp.provenance, build = prov.wasmSha256.slice(0, 12);
  const dir = path.join(sdngpRoot(), build);
  fs.mkdirSync(dir, { recursive: true });
  const info = path.join(dir, 'build.json');
  if (!fs.existsSync(info)) fs.writeFileSync(info, `${JSON.stringify({ build, wasmSha256: prov.wasmSha256, sourceCommit: prov.sourceCommit, sourceDirtyFiles: prov.sourceDirtyFiles, firstUseUtc: new Date().toISOString() }, null, 2)}\n`);
  const [k, n] = shard ? shard.split('/').map(Number) : [0, 1];
  const done = new Set(fs.readdirSync(dir).filter((f) => f.startsWith(`${source}.`) && f.endsWith('.jsonl')).flatMap((f) => readLines(path.join(dir, f)).map(rowKey)));
  let index = 0;
  return {
    build, dir,
    /** True for the windows of this shard; call once per window of the enumeration, in a fixed order. */
    mine: () => index++ % n === k,
    has: (key) => done.has(key),
    append: (row) => { fs.appendFileSync(path.join(dir, `${source}.s${k}.jsonl`), `${JSON.stringify(row)}\n`); done.add(rowKey(row)); },
  };
}

/** The builds with rows, oldest first: [{ ...build.json, complete: object|null }]. */
export function builds() {
  if (!fs.existsSync(sdngpRoot())) return [];
  return fs.readdirSync(sdngpRoot()).filter((d) => fs.existsSync(path.join(sdngpRoot(), d, 'build.json'))).map((d) => {
    const dir = path.join(sdngpRoot(), d);
    const complete = path.join(dir, 'complete.json');
    const snap = path.join(store, 'sdngp-snapshot', d, 'snapshot.json'); // when this wasm was first copied: the order of the builds
    return { ...JSON.parse(fs.readFileSync(path.join(dir, 'build.json'), 'utf8')), dir, builtSeenUtc: fs.existsSync(snap) ? JSON.parse(fs.readFileSync(snap, 'utf8')).createdUtc : null, complete: fs.existsSync(complete) ? JSON.parse(fs.readFileSync(complete, 'utf8')) : null };
  }).sort((a, c) => ((a.builtSeenUtc ?? a.firstUseUtc) < (c.builtSeenUtc ?? c.firstUseUtc) ? -1 : 1));
}

/** All rows of one build as a map key -> row, and the rows of one source if named. */
export function buildRows(dir, source = null) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl') && (!source || x.startsWith(`${source}.`)))) out.push(...readLines(path.join(dir, f)));
  return out;
}
