// The open-DCA $DCL of PLAN.md (arm X3): analysis/density-calibration `calibrate_log_density` (E13's frozen method:
// the S3 NRLMSISE-00 rescale, the R1/R2 random-walk fit, 6 h latency, 30-day causal history, 48 h forecast decay as
// hourly nodes) on the archived NRLMSISE-00 energy arcs of E13's calibration Doves (S3's rescaled arcs), selected and
// mapped as the module's own open-dca E2E selects them, issued at a given time: the cutoff (condition O, the nowcast)
// or the cutoff + 78 h (condition M, the hindcast). Answers are cached per issue time under <store>/dcl. Selection and
// mapping only; the solve is the module's.
import fs from 'node:fs';
import path from 'node:path';
import { config, root, store, sha256, HOUR, DAY, write } from '../common.mjs';
import { DCL, flatbuffers } from './sds.mjs';

const D = config.dca;
let arcs = null, provenance = null, counts = null;

function loadArcs() {
  if (arcs) return arcs;
  const sample = new Set(JSON.parse(fs.readFileSync(path.join(root, D.sample), 'utf8')).calibration);
  provenance = [];
  arcs = [];
  counts = { read: 0, notNrlmsise00: 0, notCalibration: 0, nonPositive: 0, sigma: 0, hours: 0 };
  for (const file of D.arcs) {
    const bytes = fs.readFileSync(file);
    provenance.push({ file, sha256: sha256(bytes) });
    for (const line of bytes.toString('utf8').trim().split('\n')) {
      const a = JSON.parse(line);
      counts.read += 1;
      const B = a.cdAreaOverMass ?? a.cdAreaOverMassN, sigmaB = a.sigmaB ?? a.sigmaLnB * a.cdAreaOverMassN;
      const utcB = a.utcB ?? new Date(Date.parse(a.utcA) + (a.ttB - a.ttA)).toISOString();
      if (a.atmosphere !== 'NRLMSISE00') { counts.notNrlmsise00 += 1; continue; }
      if (!sample.has(a.hwid)) { counts.notCalibration += 1; continue; }
      if (!(B > 0)) { counts.nonPositive += 1; continue; }
      if (!(sigmaB / B <= D.maximumRelativeSigma)) { counts.sigma += 1; continue; }
      if (a.hours < D.arcHours[0] || a.hours > D.arcHours[1]) { counts.hours += 1; continue; }
      arcs.push({ dove: a.hwid, startMs: Date.parse(a.utcA), endMs: Date.parse(utcB), y: Math.log(B), B, sigma: sigmaB / B });
    }
  }
  arcs.sort((p, q) => p.endMs - q.endMs);
  return arcs;
}
export const arcProvenance = () => { loadArcs(); return { files: provenance, counts, kept: arcs.length }; };

/** The request issued at `issueMs`: the arcs that end by issue - latency and start no earlier than 30 days before that. */
function request(issueMs) {
  const cutoff = issueMs - D.latencyHours * HOUR;
  const chosen = loadArcs().filter((a) => a.endMs <= cutoff && a.startMs >= cutoff - D.historyDays * DAY);
  const t = (name, fields) => Object.assign(new DCL[`${name}T`](), fields);
  const value = t('DCL', { CREATED_AT_MS: BigInt(issueMs), ATMOSPHERE: t('ATM', { MODEL: DCL.AtmosphericModelFamily.NRLMSIS00E }),
    OBJECTS: chosen.map((a) => t('dclObject', { ID: a.dove, FIRST_MS: BigInt(a.startMs), LAST_MS: BigInt(a.endMs), LN_B: a.y, LN_B_SIGMA: a.sigma, BALLISTIC_COEFFICIENT_M2_KG: a.B, OK: true })) });
  const b = new flatbuffers.Builder(1 << 16);
  DCL.DCL.finishDCLBuffer(b, value.pack(b));
  return { bytes: b.asUint8Array().slice(), arcs: chosen.length, doves: new Set(chosen.map((a) => a.dove)).size, newestArcEndMs: chosen.length ? Math.max(...chosen.map((a) => a.endMs)) : null };
}

/** The $DCL issued at `issueMs` (whole milliseconds): { ok, dcl (Uint8Array), arcs, doves, supportedToMs, nodes, model, firstNodeMs,
 *  lastNodeMs, stepHours } or { ok: false, error, arcs }. */
export async function dclAt(m, issueMs) {
  const file = path.join(store, 'dcl', `${issueMs}.json`);
  if (fs.existsSync(file)) {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    return c.ok ? { ...c, dcl: new Uint8Array(Buffer.from(c.dcl, 'base64')) } : c;
  }
  const req = request(issueMs);
  if (!req.arcs) { const out = { ok: false, error: 'no arc in the causal history', arcs: 0 }; write(file, out); return out; }
  const r = await m.calibrate(req.bytes);
  let out;
  if (r.ok) {
    const d = DCL.DCL.getRootAsDCL(new flatbuffers.ByteBuffer(r.dcl)).unpack();
    const nodes = d.CORRECTION.NODE_TIMES_MS.map(Number);
    out = { ok: true, dcl: Buffer.from(r.dcl).toString('base64'), arcs: req.arcs, doves: req.doves, newestArcEndMs: req.newestArcEndMs, supportedToMs: Number(d.SETTINGS.TO_MS),
      nodes: nodes.length, firstNodeMs: nodes[0], lastNodeMs: nodes.at(-1), model: DCL.AtmosphericModelFamily[d.ATMOSPHERE.MODEL], status: DCL.dclStatus[d.STATUS], sha256: sha256(r.dcl) };
  } else out = { ok: false, error: r.error, arcs: req.arcs, doves: req.doves };
  write(file, out);
  return out.ok ? { ...out, dcl: r.dcl } : out;
}

/** The node times and values of a $DCL: { t: [ms], s: [ln scale] } (P4's checks of the forecast decay). */
export function dclNodes(bytes) {
  const d = DCL.DCL.getRootAsDCL(new flatbuffers.ByteBuffer(new Uint8Array(bytes))).unpack();
  return { t: d.CORRECTION.NODE_TIMES_MS.map(Number), s: [...d.CORRECTION.NODE_LOG_DENSITY_SCALE_DIMENSIONLESS] };
}
