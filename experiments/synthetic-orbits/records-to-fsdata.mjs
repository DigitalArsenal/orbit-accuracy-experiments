#!/usr/bin/env node
// One-off converter: the synthetic rows' fitted records from base64 inside JSON lines to the stream beside them (records.mjs).
//
//   node experiments/synthetic-orbits/records-to-fsdata.mjs convert <store>/synthetic [<wasm sha12> ...]
//   node experiments/synthetic-orbits/records-to-fsdata.mjs replace <store>/synthetic [<wasm sha12> ...]
//
// convert: for every <folder>/rows*.jsonl that holds a base64 record (row.ap.record, row.xp.record as strings) writes, beside it and under
// other names, records<suffix>.fsdata.new (the folder's existing stream, if a run already wrote one, then one frame for each base64 record,
// in row order) and rows<suffix>.jsonl.new (every line as it was, byte for byte, except that each base64 record is replaced by its
// reference {file, offset, size, sha256}). Nothing that exists is changed. Then it VERIFIES every record: the frame its row names, read back from the
// .new stream, has the same bytes and the same full SHA-256 as the base64 record decoded from the original row; a line without a base64
// record is byte for byte the original; the stream holds no frame that no row names. It prints the counts, and exits 1 on any difference.
// replace: verifies again, in full, then renames each .new over its name (the rows file's original is removed by the rename, the stream
// takes its name). Run it only after the counts of convert have been read.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RecordStream, recordsFileOf, frames } from './records.mjs';

const [mode, root, ...only] = process.argv.slice(2);
if (!['convert', 'replace'].includes(mode) || !root) { console.error('usage: records-to-fsdata.mjs convert|replace <store>/synthetic [<wasm sha12> ...]'); process.exit(2); }
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const folders = fs.readdirSync(root).filter((d) => !['truth', 'reference'].includes(d) && fs.statSync(path.join(root, d)).isDirectory() && (!only.length || only.includes(d)));
const hasBase64 = (line) => line.includes('"record":"');

function convertFile(dir, name) {
  const rowsFile = path.join(dir, name), streamFinal = recordsFileOf(rowsFile), streamNew = `${streamFinal}.new`, rowsNew = `${rowsFile}.new`;
  const lines = fs.readFileSync(rowsFile, 'utf8').split('\n');
  if (!lines.some(hasBase64)) return null;
  fs.rmSync(streamNew, { force: true }); fs.rmSync(rowsNew, { force: true });
  if (fs.existsSync(streamFinal)) fs.copyFileSync(streamFinal, streamNew);
  const stream = new RecordStream(streamNew), originals = [];
  const out = lines.map((line, i) => {
    if (!line || !hasBase64(line)) return line;
    const row = JSON.parse(line);
    for (const t of ['ap', 'xp']) if (typeof row[t]?.record === 'string') {
      const bytes = Buffer.from(row[t].record, 'base64'), ref = stream.append(bytes);
      ref.file = path.basename(streamFinal);   // the name the stream takes at replace
      originals.push({ line: i, theory: t, sha: sha256(bytes), bytes });
      row[t] = { ...row[t], record: ref };
    }
    // the line is written again from the parsed row: key order is kept by JSON.parse and JSON.stringify
    return JSON.stringify(row);
  });
  fs.writeFileSync(rowsNew, out.join('\n'));
  return { name, rowsNew, streamNew, streamFinal, originals, lines, out };
}

function verify(c) {
  const problems = [];
  const all = [...frames(c.streamNew)], pre = c.originals.length ? all.length - c.originals.length : all.length;
  // the base64 records are the last frames of the stream, in the order of the rows
  let ap = 0, xp = 0, bytes = 0;
  c.originals.forEach((o, k) => {
    const fr = all[pre + k], row = JSON.parse(c.out[o.line]), ref = row[o.theory].record;
    if (!fr) { problems.push(`${c.name} line ${o.line + 1} ${o.theory}: no frame`); return; }
    if (fr.offset !== ref.offset || fr.size !== ref.size) problems.push(`${c.name} line ${o.line + 1} ${o.theory}: the row's offset or size is not the frame's`);
    if (sha256(fr.bytes) !== o.sha || !fr.bytes.equals(o.bytes)) problems.push(`${c.name} line ${o.line + 1} ${o.theory}: the frame is not the original record (full sha256)`);
    if (!sha256(fr.bytes).startsWith(ref.sha256)) problems.push(`${c.name} line ${o.line + 1} ${o.theory}: the row's sha256 is not the frame's`);
    if (o.theory === 'ap') ap += 1; else xp += 1; bytes += fr.size;
  });
  c.lines.forEach((l, i) => { if ((!l || !hasBase64(l)) && c.out[i] !== l) problems.push(`${c.name} line ${i + 1}: a line without a record is not byte for byte the original`); });
  // every other field of a converted row is the original's
  for (const o of c.originals) { const a = JSON.parse(c.lines[o.line]), b = JSON.parse(c.out[o.line]); delete a[o.theory].record; delete b[o.theory].record; for (const t of ['ap', 'xp']) if (typeof a[t]?.record === 'string') delete a[t].record; for (const t of ['ap', 'xp']) if (b[t]?.record && typeof b[t].record === 'object') delete b[t].record; if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`${c.name} line ${o.line + 1}: a field other than the record changed`); }
  return { problems, ap, xp, bytes, frames: all.length };
}

const total = { files: 0, rowsConverted: 0, ap: 0, xp: 0, bytes: 0, problems: [] };
for (const f of folders) {
  const dir = path.join(root, f);
  for (const name of fs.readdirSync(dir).filter((n) => /^rows.*\.jsonl$/.test(n)).sort()) {
    if (mode === 'convert') {
      const c = convertFile(dir, name);
      if (!c) continue;
      const v = verify(c);
      total.files += 1; total.ap += v.ap; total.xp += v.xp; total.bytes += v.bytes; total.rowsConverted += new Set(c.originals.map((o) => o.line)).size; total.problems.push(...v.problems);
      console.error(`${f}/${name}: ${new Set(c.originals.map((o) => o.line)).size} rows, ${v.ap} AP and ${v.xp} XP records -> ${path.basename(c.streamNew)} (${v.frames} frames)${v.problems.length ? `: ${v.problems.length} PROBLEMS` : ': verified'}`);
    } else {
      const rowsNew = path.join(dir, `${name}.new`), streamFinal = recordsFileOf(path.join(dir, name)), streamNew = `${streamFinal}.new`;
      if (!fs.existsSync(rowsNew)) continue;
      // verify the staged pair against the original rows once more, in full, then rename
      const c = { name, rowsNew, streamNew, streamFinal, lines: fs.readFileSync(path.join(dir, name), 'utf8').split('\n'), out: fs.readFileSync(rowsNew, 'utf8').split('\n'), originals: [] };
      c.lines.forEach((line, i) => { if (!line || !hasBase64(line)) return; const row = JSON.parse(line); for (const t of ['ap', 'xp']) if (typeof row[t]?.record === 'string') { const b = Buffer.from(row[t].record, 'base64'); c.originals.push({ line: i, theory: t, sha: sha256(b), bytes: b }); } });
      const v = verify(c);
      if (v.problems.length) { total.problems.push(...v.problems); continue; }
      fs.renameSync(streamNew, streamFinal); fs.renameSync(rowsNew, path.join(dir, name));
      total.files += 1; total.ap += v.ap; total.xp += v.xp; total.bytes += v.bytes;
      console.error(`${f}/${name}: replaced (${v.ap} AP and ${v.xp} XP records)`);
    }
  }
}
console.log(JSON.stringify({ mode, files: total.files, apRecords: total.ap, xpRecords: total.xp, recordBytes: total.bytes, problems: total.problems.length }));
for (const p of total.problems.slice(0, 20)) console.error(p);
process.exit(total.problems.length ? 1 : 0);
