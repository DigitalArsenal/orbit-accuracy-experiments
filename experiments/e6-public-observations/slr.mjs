// ILRS laser ranging inputs (PLAN.md §4.5): CRD normal-point files
// (ILRS CRD v1/v2, ilrs.gsfc.nasa.gov/data_and_products/formats/crd.html)
// and the weekly ILRS combined station solutions (SINEX). Text parsing
// only: times to UTC instants, two-way flight times to ranges (c t / 2),
// station positions plus their published eccentricities.
import { gunzipSync } from 'node:zlib';

export const C = 299792458;

// Every pass of a CRD file: [{station, target {name, norad}, rangeType,
// wavelengthM, troposphereApplied, comApplied, points: [{bounceMs, rangeM,
// tofS, rmsPs, met {pressureHpa, temperatureK, humidity}}]}]. The bounce
// instant is derived from the record's epoch event (0 receive, 1 bounce,
// 2 transmit); seconds of day are on the pass's start date, the next day
// for those half a day or more below its start time.
export function parseCrd(text) {
  const passes = [];
  let pass = null, dayMs = 0, lastSod = -1, wavelengthM = null, target = null, station = null, met = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const f = line.split(/\s+/);
    const rec = f[0].toLowerCase();
    if (rec === 'h2') station = { name: f[1], code: f[2] };
    else if (rec === 'h3') target = { name: f[1], ilrsId: f[2], norad: Number(f[4]) };
    else if (rec === 'h4') {
      dayMs = Date.UTC(Number(f[2]), Number(f[3]) - 1, Number(f[4]));
      // Seconds of day are on the start date until they fall more than half a
      // day below the start time (a pass across midnight).
      lastSod = Number(f[5]) * 3600 + Number(f[6]) * 60 + Number(f[7]); met = null;
      pass = { station: station?.code, stationName: station?.name, target, dataType: Number(f[1]), troposphereApplied: f[15] === '1', comApplied: f[16] === '1', systemDelayApplied: f[18] === '1', rangeType: Number(f[20]), points: [], wavelengthM };
      passes.push(pass);
    } else if (rec === 'c0') { wavelengthM = Number(f[2]) * 1e-9; if (pass) pass.wavelengthM = wavelengthM; }
    else if (rec === '20' && pass) met = { pressureHpa: Number(f[2]), temperatureK: Number(f[3]), humidity: Number(f[4]) };
    else if (rec === '11' && pass && pass.dataType === 1) {
      const sod = Number(f[1]), tof = Number(f[2]), event = Number(f[4]);
      const t = dayMs + sod * 1000 + (sod < lastSod - 43200 ? 86400000 : 0);
      const bounceMs = event === 2 ? t + tof * 500 : event === 0 ? t - tof * 500 : event === 1 ? t : null;
      if (bounceMs === null || !(tof > 0)) continue;
      pass.points.push({ bounceMs, tofS: tof, rangeM: C * tof / 2, rmsPs: Number(f[7]), returns: Number(f[6]), met });
    } else if (rec === 'h8') pass = null;
  }
  return passes.filter((p) => p.points.length);
}

// A weekly ILRS SINEX: {epoch (ms), sites: Map code -> {latDeg, lonDeg, heightM, itrf [m] (marker plus eccentricity)}}.
export function parseSinex(gz) {
  const text = gunzipSync(gz).toString('latin1');
  const block = (name) => { const m = new RegExp(`\\+${name}[^\\n]*\\n([\\s\\S]*?)\\n-${name}`).exec(text); return m ? m[1].split('\n').filter((l) => !l.startsWith('*')) : []; };
  const sites = new Map();
  for (const l of block('SITE/ID')) {
    const code = l.slice(1, 5).trim();
    const lon = l.slice(44, 55).trim().split(/\s+/), lat = l.slice(56, 67).trim().split(/\s+/);
    const latDeg = (lat[0].startsWith('-') ? -1 : 1) * (Math.abs(Number(lat[0])) + Number(lat[1]) / 60 + Number(lat[2]) / 3600);
    const lonDeg = (lon[0].startsWith('-') ? -1 : 1) * (Math.abs(Number(lon[0])) + Number(lon[1]) / 60 + Number(lon[2]) / 3600);
    sites.set(code, { latDeg, lonDeg: lonDeg > 180 ? lonDeg - 360 : lonDeg, heightM: Number(l.slice(68, 75)), itrf: [null, null, null], eccentricity: [0, 0, 0] });
  }
  for (const l of block('SITE/ECCENTRICITY')) {
    const s = sites.get(l.slice(1, 5).trim());
    if (s && l.slice(42, 45) === 'XYZ') s.eccentricity = l.slice(46).trim().split(/\s+/).slice(0, 3).map(Number);
  }
  let epochMs = null;
  for (const l of block('SOLUTION/ESTIMATE')) {
    const f = l.trim().split(/\s+/);
    const axis = { STAX: 0, STAY: 1, STAZ: 2 }[f[1]];
    if (axis === undefined) continue;
    const s = sites.get(f[2]);
    if (!s) continue;
    s.itrf[axis] = Number(f[8]);
    const [yy, doy, sec] = f[5].split(':').map(Number);
    epochMs = Date.UTC(2000 + yy, 0, 1) + (doy - 1) * 86400000 + sec * 1000;
  }
  for (const s of sites.values()) if (s.itrf.every((v) => v !== null)) s.itrf = s.itrf.map((v, i) => v + s.eccentricity[i]);
  return { epochMs, sites: new Map([...sites].filter(([, s]) => s.itrf.every((v) => Number.isFinite(v)))) };
}
