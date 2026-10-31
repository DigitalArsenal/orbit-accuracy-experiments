// XP2F data preparation (PLAN.md, Dates): the RSGA bulletins of 2024 and 2025 as XM's parser reads them. XM's lib/weather.mjs parseRsga takes every number as
// digits with nothing after the slash; 93 bulletins of the extension hold a space there or an Ap that is not a number. This writes each bulletin to
// <store>/rsga/normalized under its own name: unchanged where XM's parser reads it; otherwise its three Afr/Ap lines rewritten by the registered rule and
// nothing else. Data preparation only: dates and values, no physics.
//   Space after the slash: removed.
//   Observed or Estimated Ap not a number: the previous day's bulletin's Estimated (for an Observed day) or Predicted (for an Estimated day) Ap of the same day; absent, the line's Afr stands in for Ap.
//   Predicted Ap not a number: that item's Afr stands in for Ap.
//   Afr not a number where Ap is one: the digits of Ap stand in the Afr slot (XM's parser does not read Afr).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const isNum = (s) => /^\d+$/.test(s);
const OBS = /^(Observed Afr\/Ap\s+\d{2} \w{3}\s+)(.*)$/m, EST = /^(Estimated Afr\/Ap\s+\d{2} \w{3}\s+)(.*)$/m, PRE = /^(Predicted Afr\/Ap\s+\d{2} \w{3}-\d{2} \w{3}\s+)(.*)$/m;
const splitPair = (t) => { const k = t.indexOf('/'); return [t.slice(0, k).trim(), t.slice(k + 1).trim()]; };
const dayOf = (line, re) => /Afr\/Ap\s+(\d{2} \w{3})/.exec(line)?.[1];

/** One bulletin's rewrite: { text, actions: [{ line, from, to, how }] }. `previous` is the previous day's bulletin's normalized text, or null. */
export function normalizeText(text, previous, parseRsga) {
  if (parseRsga(text)) return { text, actions: [] };
  const actions = [];
  let out = text;
  const prevAp = (kind, day) => {
    if (!previous) return null;
    if (kind === 'Observed') { const m = EST.exec(previous); if (m && dayOf(m[0]) === day) { const [, ap] = splitPair(m[2]); return isNum(ap) ? ap : null; } return null; }
    const m = PRE.exec(previous); if (!m) return null;
    const mm = /Predicted Afr\/Ap\s+(\d{2}) (\w{3})-/.exec(m[0]); if (`${mm[1]} ${mm[2]}` !== day) return null;       // the bulletin's first predicted day
    const [, ap] = splitPair(m[2].split('-')[0]); return isNum(ap) ? ap : null;
  };
  for (const [kind, re] of [['Observed', OBS], ['Estimated', EST]]) {
    const m = re.exec(out);
    if (!m) continue;
    const [afrRaw, apRaw] = splitPair(m[2]), day = dayOf(m[0]);
    let ap = apRaw, how = null;
    if (!isNum(ap)) {
      const p = prevAp(kind, day);
      if (p !== null) { ap = p; how = kind === 'Observed' ? 'the previous bulletin\'s Estimated Ap' : 'the previous bulletin\'s Predicted Ap'; }
      else if (isNum(afrRaw)) { ap = afrRaw; how = 'Afr stands in for Ap'; }
      else { actions.push({ line: m[0], unresolved: true }); continue; }
    } else if (/\/\s/.test(m[2])) how = 'space removed';
    const afr = isNum(afrRaw) ? afrRaw : ap;
    if (!isNum(afrRaw) && !how) how = 'Ap in the Afr slot';
    const to = `${m[1]}${afr}/${ap}`;
    if (to !== m[0]) { actions.push({ line: m[0], to, how: how ?? 'space removed' }); out = out.replace(m[0], to); }
  }
  const m = PRE.exec(out);
  if (m) {
    const items = m[2].split('-').map(splitPair);
    let how = null;
    const rebuilt = items.map(([afr, ap]) => { if (isNum(afr) && isNum(ap)) return `${afr}/${ap}`; if (isNum(afr)) { how = 'Afr stands in for Ap'; return `${afr}/${afr}`; } if (isNum(ap)) { how ??= 'Ap in the Afr slot'; return `${ap}/${ap}`; } how = 'unresolved'; return `${afr}/${ap}`; }).join('-');
    const to = `${m[1]}${rebuilt}`;
    if (to !== m[0]) { actions.push({ line: m[0], to, how: how ?? 'space removed' }); out = out.replace(m[0], to); }
  }
  return { text: out, actions };
}

/** Extracts the registered bundles (SHA-256 checked) and writes the normalized bulletins with normalization.json: the per-bulletin record and the counts. */
export function prepareRsga({ bundles, store, parseRsga }) {
  const raw = path.join(store, 'rsga/raw'), out = path.join(store, 'rsga/normalized');
  fs.mkdirSync(raw, { recursive: true }); fs.mkdirSync(out, { recursive: true });
  const names = new Map();
  for (const [year, b] of Object.entries(bundles)) {
    const bytes = fs.readFileSync(b.file);
    if (sha256(bytes) !== b.sha256) throw new Error(`${b.file} is ${sha256(bytes)}, registered ${b.sha256}`);
    execFileSync('tar', ['xzf', b.file, '-C', raw]);
    const dir = path.join(raw, `${year}_RSGA`);
    for (const n of fs.readdirSync(dir)) if (/^\d{8}RSGA\.txt$/.test(n)) names.set(n, path.join(dir, n));
  }
  const records = [];
  let previous = null, previousDay = null;
  for (const n of [...names.keys()].sort()) {
    const day = Date.parse(`${n.slice(0, 4)}-${n.slice(4, 6)}-${n.slice(6, 8)}T00:00:00Z`);
    const text = fs.readFileSync(names.get(n), 'utf8');
    const prev = previousDay === day - 86400000 ? previous : null;
    const r = normalizeText(text, prev, parseRsga);
    fs.writeFileSync(path.join(out, n), r.text);
    records.push({ name: n, sha256Raw: sha256(Buffer.from(text)), sha256Normalized: sha256(Buffer.from(r.text)), parsed: !!parseRsga(r.text), actions: r.actions });
    previous = r.text; previousDay = day;
  }
  return records;
}

/** The counts the plan names, for one span of bulletin days. */
export function countsOf(records, fromName, toName) {
  const r = records.filter((x) => x.name >= fromName && x.name <= toName);
  const changed = r.filter((x) => x.actions.length);
  const hows = (x) => x.actions.map((a) => a.how ?? 'unresolved');
  const apNotNumber = changed.filter((x) => hows(x).some((h) => h !== 'space removed' && h !== 'Ap in the Afr slot'));
  return {
    bulletins: r.length, changed: changed.length,
    spacesOnly: changed.filter((x) => hows(x).every((h) => h === 'space removed')).length,
    apNotNumber: apNotNumber.length,
    afrInAfrSlot: changed.filter((x) => hows(x).includes('Ap in the Afr slot')).length,
    afrStandsInForAp: r.flatMap((x) => x.actions.filter((a) => a.how === 'Afr stands in for Ap').map((a) => ({ bulletin: x.name, line: a.line, to: a.to }))),
    unparsedAfter: r.filter((x) => !x.parsed).map((x) => x.name),
  };
}
