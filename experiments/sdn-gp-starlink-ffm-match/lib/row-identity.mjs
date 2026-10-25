// Amendment A16: the rows of two builds of the module, source by source: how many are equal in every field but `build`, how many differ and by how much, how many exist in one build only.
// Rows are matched by their identifying fields (source, id, window, case, variant, hours, ...); rows that share a key are paired in the order of their text. Nothing is thresholded: a difference of 1e-12 and one of 1 km are both counted,
// and the largest absolute and relative change of the numeric fields is reported with the fields that changed most often. Aggregates only; no row leaves this function.
import fs from 'node:fs';
import path from 'node:path';

const readLines = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const KEYS = ['source', 'id', 'startUtc', 'fitSeconds', 'kind', 'variant', 'hours', 'level', 'k', 'batch', 'truthSource', 'norad', 'system', 'index', 'file', 'cluster', 'case'];
const keyOf = (r) => `${KEYS.map((k) => (r[k] === undefined ? '' : typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k]))).join('|')}|${r.cell?.id ?? ''}`;
const EXCLUDE = new Set(['starlink-skipped']);

/** The row stems of a build directory (the file names without `.s<k>.jsonl`). */
export const stems = (dir) => [...new Set(fs.readdirSync(dir).map((f) => /^(.*)\.s\d+\.jsonl$/.exec(f)?.[1]).filter((x) => x && !EXCLUDE.has(x)))].sort();
const rowsOf = (dir, stem) => fs.readdirSync(dir).filter((f) => /^(.*)\.s\d+\.jsonl$/.exec(f)?.[1] === stem).flatMap((f) => readLines(path.join(dir, f)));

// Wall-clock fields of the rows (milliseconds of a fit, of a propagation, microseconds per state) differ between any two runs, of the same build as well; they are not compared.
const TIMING = /^(ms|[A-Za-z]*Ms|usPerState)$/;
const strip = (r) => {
  const walk = (o) => (Array.isArray(o) ? o.map(walk) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !TIMING.test(k)).map(([k, v]) => [k, walk(v)])) : o);
  const { build, ...rest } = r;
  return walk(rest);
};
const arrayPath = (p) => p.replace(/\[\d+\]/g, '[]');

function diff(a, b, p, acc) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return;
    const abs = Math.abs(a - b), rel = abs / Math.max(Math.abs(a), Math.abs(b), 1e-300);
    const bytes = /Bytes$/.test(p); // sizes of the records: counted, and kept out of the largest change of the results
    const f = acc.fields.get(p) ?? { count: 0, maxAbs: 0, maxRel: 0, kind: bytes ? 'bytes' : 'number' };
    f.count += 1; f.maxAbs = Math.max(f.maxAbs, abs); f.maxRel = Math.max(f.maxRel, rel); acc.fields.set(p, f);
    if (bytes) { acc.bytes += 1; return; }
    acc.maxAbs = Math.max(acc.maxAbs, abs); acc.maxRel = Math.max(acc.maxRel, rel); acc.numeric += 1;
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { const f = acc.fields.get(`${p}.length`) ?? { count: 0, kind: 'shape' }; f.count += 1; acc.fields.set(`${p}.length`, f); acc.shape += 1; }
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], `${p}[]`, acc);
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a) || !(k in b)) { const f = acc.fields.get(`${p}.${k}`) ?? { count: 0, kind: 'shape' }; f.count += 1; acc.fields.set(`${p}.${k}`, f); acc.shape += 1; continue; }
      diff(a[k], b[k], p ? `${p}.${k}` : k, acc);
    }
    return;
  }
  if (a === b) return;
  const f = acc.fields.get(p) ?? { count: 0, kind: 'value' };
  f.count += 1; acc.fields.set(p, f); acc.value += 1;
}

/** `dirA`, `dirB`: build directories (rows/sdngp/<build>); `only`: the stems to compare (default every stem of both). */
export function compareBuilds(dirA, dirB, only = null) {
  const names = [...new Set([...stems(dirA), ...stems(dirB)])].filter((s) => !only || only.includes(s) || only.some((o) => s === o || s.startsWith(`${o}+`))).sort();
  const sources = [];
  for (const stem of names) {
    const group = (dir) => { const m = new Map(); for (const r of fs.existsSync(dir) ? rowsOf(dir, stem) : []) { const k = keyOf(r), t = JSON.stringify(strip(r)); (m.get(k) ?? m.set(k, []).get(k)).push(t); } for (const v of m.values()) v.sort(); return m; };
    const A = group(dirA), B = group(dirB);
    const acc = { fields: new Map(), maxAbs: 0, maxRel: 0, numeric: 0, shape: 0, value: 0, bytes: 0 };
    let rowsA = 0, rowsB = 0, identical = 0, different = 0, onlyA = 0, onlyB = 0;
    for (const [k, list] of A) { rowsA += list.length; const other = B.get(k) ?? []; for (let i = 0; i < list.length; i++) { if (i >= other.length) { onlyA += 1; continue; } if (list[i] === other[i]) identical += 1; else { different += 1; diff(JSON.parse(list[i]), JSON.parse(other[i]), '', acc); } } if (other.length > list.length) onlyB += other.length - list.length; }
    for (const [k, list] of B) { rowsB += list.length; if (!A.has(k)) onlyB += list.length; }
    sources.push({ stem, rowsA, rowsB, identical, different, onlyA, onlyB, maxAbs: acc.maxAbs, maxRel: acc.maxRel, numericLeaves: acc.numeric, shapeLeaves: acc.shape, valueLeaves: acc.value, byteLeaves: acc.bytes,
      fields: [...acc.fields].map(([path2, f]) => ({ path: arrayPath(path2), ...f })).sort((x, y) => y.count - x.count).slice(0, 5) });
  }
  const sum = (key) => sources.reduce((a, s) => a + s[key], 0);
  return { a: path.basename(dirA), b: path.basename(dirB), stems: sources.length, stemsDifferent: sources.filter((s) => s.different || s.onlyA || s.onlyB).length, rowsA: sum('rowsA'), rowsB: sum('rowsB'), identical: sum('identical'), different: sum('different'), onlyA: sum('onlyA'), onlyB: sum('onlyB'), sources };
}

/** The table of a comparison: `c` from compareBuilds; `f` formats numbers. */
export function identityMarkdown(c, title, f) {
  const exp = (x) => (x === 0 ? '0' : x.toExponential(1));
  const differing = c.sources.filter((x) => x.different || x.onlyA || x.onlyB);
  const L = [title, '',
    `Rows of the two builds matched by their identifying fields (source, window, case, variant, hours and the like) and compared in every field but \`build\` and the wall-clock timings (milliseconds of a fit, microseconds per state). Build ${c.a}: ${c.rowsA} rows; build ${c.b}: ${c.rowsB} rows; identical ${c.identical}; different ${c.different}; only in ${c.a} ${c.onlyA}; only in ${c.b} ${c.onlyB}. Row files compared ${c.stems}, with differences in ${c.stemsDifferent}.${c.stemsDifferent ? '' : ' Every row of every file is identical.'}`, ''];
  if (differing.length) L.push('| Rows file | Rows (' + c.a + ' / ' + c.b + ') | Identical | Different | Only in ' + c.a + ' / only in ' + c.b + ' | Largest change of a result field: absolute / relative | Fields that changed most often (rows) |', '| --- | --- | --: | --: | --- | --- | --- |',
    ...differing.map((x) => `| ${x.stem} | ${x.rowsA} / ${x.rowsB} | ${x.identical} | ${x.different} | ${x.onlyA} / ${x.onlyB} | ${x.numericLeaves ? `${exp(x.maxAbs)} / ${exp(x.maxRel)}` : 'none'} | ${x.fields.slice(0, 3).map((g) => `${g.path} (${g.count}${g.kind === 'bytes' ? ', byte count' : ''})`).join('; ')} |`), '');
  return L;
}

