// FFM's environment for C3-small's arcs. Cal/val keeps C2's file (PLAN.md section 6): B1's environment (sdn-ap-baselines environment.json: the IERS finals rows of 2026-10-09 and
// the GFZ-built space weather), sliced to the arc as B1's forArc slices it, with G1's saved rows inside their span. The 05-09 gap is B1's dropped day: no fill. The kernel is DE440s,
// SHA-256 checked. Condition O is C2's lib/weather-o.mjs logic in lib/weather-o.mjs here. Encoding only: data preparation, no orbit computation.
import fs from 'node:fs';
import path from 'node:path';
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { root, sha256, DAY } from '../common.mjs';

const { kernelFrame } = await import(path.join(root, 'harness/prw.mjs'));
const B1_ENV = '/opt/data/sdn-archive/sdn-ap-baselines/environment/environment.json';
const G1_ENV = '/opt/data/sdn-archive/sdn-gp-starlink-ffm-match/environment/environment.json';
const KERNEL = '/opt/data/sdn-archive/hac/naif-kernels/spk/planets/de440s.bsp';
const KERNEL_SHA = 'c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2';
const PRW_TYPE = { schemaName: 'PRW.fbs', fileIdentifier: '$PRW', rootTypeName: 'PRW', wireFormat: 'flatbuffer' };
const dateOf = (t) => new Date(t).toISOString().slice(0, 10);
const input = (portId, payload) => ({ portId, typeRef: PRW_TYPE, payload });
const encode = (arm, value) => { const b = new flatbuffers.Builder(1 << 20); b.finishSizePrefixed(Object.assign(new P.PRWT(), { [arm]: value }).pack(b), '$PRW'); return b.asUint8Array().slice(); };
const rowsOf = (b64, arm) => P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(Buffer.from(b64, 'base64')))).unpack()[arm].ROWS;

/** The inputs with one PRW table's rows edited (P3's tests only). */
export function editPort(inputs, portId, arm, edit) {
  return inputs.map((i) => {
    if (i.portId !== portId) return i;
    const Table = arm === 'EARTH_ORIENTATION' ? P.PRWEarthOrientationT : P.PRWSpaceWeatherTableT;
    const rows = rowsOf(Buffer.from(i.payload).toString('base64'), arm).map(edit);
    return { ...i, payload: encode(arm, Object.assign(new Table(), { ROWS: rows })) };
  });
}

/** { inputsFor(fromMs, toMs), provenance }: the FFM inputs (kernel, earth_orientation, space_weather) of one arc. */
export function openEnvironment(opened) {
  const read = (f, label) => (opened ? opened.read(f, label) : fs.readFileSync(f));
  const rawB1 = read(B1_ENV, 'B1 environment'), rawG1 = read(G1_ENV, 'G1 saved environment');
  const b1 = JSON.parse(rawB1), g1 = JSON.parse(rawG1);
  const kernelBytes = read(KERNEL, 'DE440s');
  if (sha256(kernelBytes) !== KERNEL_SHA) throw new Error(`${KERNEL} is not the registered kernel`);
  const kernel = kernelFrame(kernelBytes);
  const finals = rowsOf(b1.inputs.earth_orientation_finals, 'EARTH_ORIENTATION'), weather = rowsOf(b1.inputs.space_weather, 'SPACE_WEATHER'), saved = rowsOf(g1.inputs.earth_orientation, 'EARTH_ORIENTATION');
  return {
    provenance: { b1: sha256(rawB1), g1: sha256(rawG1), kernel: KERNEL_SHA, finalsFile: b1.provenance.earthOrientation.finalsFile, gfzFile: b1.provenance.spaceWeather.gfzFile, droppedDays: b1.provenance.spaceWeather.droppedDays },
    /** B1's forArc: one Earth-orientation series per arc, two days either side; the rows of the arc's days. */
    inputsFor(fromMs, toMs) {
      const mjd = (t) => t / DAY + 40587, lo = fromMs - 2 * DAY, hi = toMs + 2 * DAY;
      const inSaved = mjd(lo) - 1 >= saved[0].MJD && mjd(hi) + 1 <= saved.at(-1).MJD;
      const e = (inSaved ? saved : finals).filter((r) => r.MJD >= mjd(lo) - 1 && r.MJD <= mjd(hi) + 1);
      const w = weather.filter((r) => r.DATE >= dateOf(lo) && r.DATE <= dateOf(hi));
      return [kernel, input('earth_orientation', encode('EARTH_ORIENTATION', Object.assign(new P.PRWEarthOrientationT(), { ROWS: e }))), input('space_weather', encode('SPACE_WEATHER', Object.assign(new P.PRWSpaceWeatherTableT(), { ROWS: w })))];
    },
  };
}
