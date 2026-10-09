// Readers for the operators' ephemeris files. Text in, numbers out, exactly
// as the file states them (units converted to m and m/s only); no frame or
// time-scale conversion happens here. Earth-fixed files are transcribed,
// unchanged, into SP3-c text for files/orbit-products.
import { inflateRawSync } from 'node:zlib';

// "2026-09-09T11:13:16.000Z"-style ISO text for calendar fields on the
// file's own scale (no conversion: Date is used as a calendar only).
const isoOf = (ms) => new Date(ms).toISOString();
const calendar = (y, mo, d, h, mi, s) => Date.UTC(y, mo - 1, d, h, mi, 0) + Math.round(s * 1e6) / 1e3;

// ── SpaceX MEME ──
// created:<UTC>; ephemeris_start/stop, step; "UVW"; then per epoch one state
// line "yyyydddhhmmss.sss x y z vx vy vz" (km, km/s, EME2000, UTC) and 21
// lower-triangle covariance entries (UVW, km and km/s) over three lines.
export function readMeme(text) {
  const lines = text.split(/\r?\n/);
  const created = /^created:(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) UTC/.exec(lines[0])?.[1];
  if (!created) throw new Error('MEME: no created line');
  const epochs = [], states = [], covariances = [];
  const tokens = lines.slice(4).join(' ').trim().split(/\s+/);
  for (let i = 0; i + 28 <= tokens.length; i += 28) {
    const t = tokens[i];
    const m = /^(\d{4})(\d{3})(\d\d)(\d\d)(\d\d(?:\.\d+)?)$/.exec(t);
    if (!m) throw new Error(`MEME: bad epoch ${t}`);
    const ms = Date.UTC(Number(m[1]), 0, 1) + (Number(m[2]) - 1) * 86400000 + Number(m[3]) * 3600000 + Number(m[4]) * 60000 + Math.round(Number(m[5]) * 1000);
    epochs.push(isoOf(ms));
    states.push(tokens.slice(i + 1, i + 7).map((v) => Number(v) * 1000));
    covariances.push(tokens.slice(i + 7, i + 28).map(Number));
  }
  return { created: `${created.replace(' ', 'T')}Z`, timeScale: 'UTC', frame: 'EME2000', epochs, states, covariances, covarianceAxes: 'UVW', covarianceUnits: 'km, km/s' };
}

// ── CCSDS OEM (KVN) ──  Data lines in km and km/s; one segment kept per
// object (the segments of these files are consecutive).
export function readOem(text) {
  const created = /CREATION_DATE\s*=\s*(\S+)/.exec(text)?.[1];
  const frame = /REF_FRAME\s*=\s*(\S+)/.exec(text)?.[1];
  const timeScale = /TIME_SYSTEM\s*=\s*(\S+)/.exec(text)?.[1];
  const name = /OBJECT_NAME\s*=\s*(.+)/.exec(text)?.[1].trim();
  const epochs = [], states = [];
  let data = false;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (l.startsWith('META_STOP')) { data = true; continue; }
    if (l.startsWith('META_START') || l.startsWith('COVARIANCE_START')) { data = false; continue; }
    if (!data || !l || l.startsWith('COMMENT')) continue;
    const f = l.split(/\s+/);
    if (f.length < 7 || !/^\d{4}-\d\d-\d\dT/.test(f[0])) continue;
    epochs.push(isoOf(Date.parse(/Z$/.test(f[0]) ? f[0] : `${f[0]}Z`)));
    states.push(f.slice(1, 7).map((v) => Number(v) * 1000));
  }
  return { created: created ? isoOf(Date.parse(`${created}Z`)) : null, frame, timeScale, name, epochs, states };
}

// One stored or deflated member of a zip, by the central directory.
export function unzipMembers(zip) {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) --end;
  if (end < 0) throw new Error('zip: no central directory');
  const out = [];
  for (let at = zip.readUInt32LE(end + 16), k = zip.readUInt16LE(end + 10); k > 0; --k) {
    const method = zip.readUInt16LE(at + 10), size = zip.readUInt32LE(at + 20), n = zip.readUInt16LE(at + 28);
    const name = zip.toString('latin1', at + 46, at + 46 + n), local = zip.readUInt32LE(at + 42);
    at += 46 + n + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    const data = zip.subarray(local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)).subarray(0, size);
    out.push({ name, bytes: method === 8 ? inflateRawSync(data) : Buffer.from(data) });
  }
  return out;
}

// ── Planet ──  planet.states: HWID, seconds since J2000 TT, position (m) and
// velocity (m/s) in J2000, two ballistic coefficients. The epoch is returned
// as ISO text on TT (J2000 TT = 2000-01-01T12:00:00 TT).
export function readPlanetStates(text) {
  const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
  return text.split(/\r?\n/).map((l) => l.trim().split(/\s+/)).filter((f) => f.length >= 8 && /^[0-9a-f]{4}$/i.test(f[0])).map((f) => ({
    hwid: f[0].toLowerCase(), epochTT: isoOf(j2000 + Math.round(Number(f[1]) * 1e6) / 1e3), state: f.slice(2, 8).map(Number),
  }));
}

// planet_mc.tle: "0 <name> <HWID>", line 1, line 2 -> {hwid, norad, epoch (ISO UTC), elements}.
export function readTle(text, hwidFromName = true) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const out = [];
  for (let i = 0; i + 2 < lines.length + 1; ++i) {
    if (!lines[i].startsWith('1 ') || !lines[i + 1]?.startsWith('2 ')) continue;
    const l1 = lines[i], l2 = lines[i + 1], name = lines[i - 1]?.startsWith('0 ') ? lines[i - 1].slice(2).trim() : null;
    const yy = Number(l1.slice(18, 20)), day = Number(l1.slice(20, 32));
    const year = yy < 57 ? 2000 + yy : 1900 + yy;
    const epochMs = Date.UTC(year, 0, 1) + (day - 1) * 86400000;
    const exp = (field) => { const s = field.trim(); if (!s) return 0; const m = /^([+-]?)(\d+)([+-]\d)$/.exec(s); return m ? Number(`${m[1]}0.${m[2]}`) * 10 ** Number(m[3]) : Number(s); };
    out.push({
      hwid: hwidFromName && name ? name.split(/\s+/).at(-1).toLowerCase() : null,
      norad: Number(l1.slice(2, 7)),
      epoch: new Date(Math.round(epochMs * 1000) / 1000).toISOString().replace('Z', ''),
      epochMs,
      elements: {
        MEAN_MOTION: Number(l2.slice(52, 63)), ECCENTRICITY: Number(`0.${l2.slice(26, 33).trim()}`), INCLINATION: Number(l2.slice(8, 16)),
        RA_OF_ASC_NODE: Number(l2.slice(17, 25)), ARG_OF_PERICENTER: Number(l2.slice(34, 42)), MEAN_ANOMALY: Number(l2.slice(43, 51)), BSTAR: exp(l1.slice(53, 61)),
      },
    });
  }
  return out;
}

// ── SP3-c transcription of Earth-fixed positions ──
// rows: [{ms (calendar ms on the stated scale), position [m]}]; one satellite
// id (e.g. "L01"); scale "UTC". Positions are written in km, unchanged.
export function sp3Text(id, rows, scale, comment) {
  const pad = (v, w) => String(v).padStart(w), fix = (v, w, d) => Number(v).toFixed(d).padStart(w);
  const stamp = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()} ${pad(d.getUTCMonth() + 1, 2)} ${pad(d.getUTCDate(), 2)} ${pad(d.getUTCHours(), 2)} ${pad(d.getUTCMinutes(), 2)} ${fix(d.getUTCSeconds() + d.getUTCMilliseconds() / 1000, 11, 8)}`;
  };
  const t0 = rows[0].ms, step = (rows[1].ms - t0) / 1000;
  const gps = (t0 - Date.UTC(1980, 0, 6)) / 1000, week = Math.floor(gps / 604800);
  const lines = [`#cP${stamp(t0)} ${pad(rows.length, 7)} ORBIT ITRF  FIT  E4 `,
    `## ${pad(week, 4)} ${fix(gps - week * 604800, 15, 8)} ${fix(step, 14, 8)} ${pad(Math.floor(t0 / 86400000) + 40587, 5)} ${fix((t0 % 86400000) / 86400000, 15, 13)}`,
    `+    1   ${id}${'  0'.repeat(16)}`, ...Array(4).fill(`+        ${'  0'.repeat(17)}`), ...Array(5).fill(`++       ${'  0'.repeat(17)}`),
    `%c L  cc ${scale.padEnd(3)} ccc cccc cccc cccc cccc ccccc ccccc ccccc ccccc`, '%c cc cc ccc ccc cccc cccc cccc cccc ccccc ccccc ccccc ccccc',
    '%f  0.0000000  0.000000000  0.00000000000  0.000000000000000', '%f  0.0000000  0.000000000  0.00000000000  0.000000000000000',
    '%i    0    0    0    0      0      0      0      0         0', '%i    0    0    0    0      0      0      0      0         0',
    ...comment.map((c) => `/* ${c}`.slice(0, 80)), '/* '];
  for (const r of rows) {
    lines.push(`*  ${stamp(r.ms)}`);
    lines.push(`P${id}${r.position.map((x) => fix(x / 1000, 14, 6)).join('')}${fix(999999.999999, 14, 6)}`);
  }
  lines.push('EOF');
  return Buffer.from(`${lines.join('\n')}\n`);
}

// ── Intelsat ECF ── "yyyy/mm/dd hh:mm:ss.sss X Y Z" (m, Earth-fixed, UTC).
export function readIntelsat(text) {
  const rows = [];
  for (const l of text.split(/\r?\n/)) {
    const m = /^(\d{4})\/(\d\d)\/(\d\d)\s+(\d\d):(\d\d):(\d\d(?:\.\d+)?)\s+(\S+)\s+(\S+)\s+(\S+)/.exec(l.trim());
    if (m) rows.push({ ms: calendar(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]), position: [+m[7], +m[8], +m[9]] });
  }
  return { title: text.split(/\r?\n/)[0].trim(), rows };
}

// ── ILRS CPF v2 ── H1 production date and hour; H2 NORAD number, interval,
// reference frame (0: ITRF), time scale UTC; "10" records: MJD, seconds of
// day, leap flag, position (m).
export function readCpf(text) {
  const lines = text.split(/\r?\n/);
  const h1 = lines.find((l) => /^H1 /i.test(l))?.trim().split(/\s+/);
  const h2 = lines.find((l) => /^H2 /i.test(l))?.trim().split(/\s+/);
  if (!h1 || !h2) throw new Error('CPF: no H1/H2');
  const created = isoOf(Date.UTC(Number(h1[4]), Number(h1[5]) - 1, Number(h1[6]), Number(h1[7])));
  const frame = Number(h2[19]);
  const rows = [];
  for (const l of lines) {
    const f = l.trim().split(/\s+/);
    if (f[0] !== '10' || f[1] !== '0') continue;
    rows.push({ ms: (Number(f[2]) - 40587) * 86400000 + Math.round(Number(f[3]) * 1e6) / 1e3, position: f.slice(5, 8).map(Number) });
  }
  return { created, target: h1[10], norad: Number(h2[3]), frame, rows };
}
