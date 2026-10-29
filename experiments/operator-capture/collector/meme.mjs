// SpaceX MEME text to typed records. Parsing only: no network, no physics, no files.
// A record is 4 lines of 7 tokens: epoch and state (km, km/s), then the 21 UVW covariance values
// (lower triangle by rows). The header names the covariance axes on its 4th line.
import { sha } from './transport.mjs';

export const STEP = 60;                                  // the registered native step, seconds
export const REGISTERED_BYTES = 262144;                  // amendment A2: the prefix the registered products come from
export const REGISTERED_RECORDS = 8 * 3600 / STEP + 1;   // the first eight hours: 481 one-minute states
export const RETAINED_RECORDS = 16 * 3600 / STEP + 1;    // amendment A4: the sidecar keeps the first sixteen hours: 961 one-minute states
export const SAMPLE_EVERY = 10;                          // ten-minute spacing: every 10th native state
const EPOCH = /^(\d{4})(\d{3})(\d{2})(\d{2})(\d{2}(?:\.\d+)?)$/;
const utc = text => Date.parse(text.replace(' ', 'T') + 'Z');

/** The header of a MEME prefix, with its lines kept for `readRecords`. */
export function openMeme(bytes) {
  const lines = bytes.toString().split(/\n/);
  const created = /^created:(.+) UTC\r?$/.exec(lines[0])?.[1];
  const header = /^ephemeris_start:(.+) UTC ephemeris_stop:(.+) UTC step_size:(\d+)\r?$/.exec(lines[1]);
  if (!created || !header || lines[3].trim() !== 'UVW') throw new Error('unrecognized MEME header');
  const step = Number(header[3]);
  if (step !== STEP) throw new Error(`unregistered native step ${step}`);
  return { lines, step, createdUtc: created.replace(' ', 'T') + 'Z', startMs: utc(header[1]), stopMs: utc(header[2]) };
}

/** Records that lie fully inside the prefix. */
export const complete = meme => Math.floor((meme.lines.length - 5) / 4);

/** The first `count` records: { ms, stateKm, uvwCov }, and their text. */
export function readRecords(meme, count) {
  const { lines, startMs, step } = meme;
  const text = lines.slice(0, 4 + count * 4).join('\n') + '\n';
  const tokens = text.split('\n').slice(4).join(' ').trim().split(/\s+/);
  if (tokens.length !== count * 28) throw new Error('head record count mismatch');
  const points = [];
  for (let k = 0; k < tokens.length; k += 28) {
    const m = EPOCH.exec(tokens[k]);
    if (!m) throw new Error('invalid MEME epoch');
    const ms = Date.UTC(+m[1], 0, 1) + (+m[2] - 1) * 86400000 + (+m[3] * 3600 + +m[4] * 60 + +m[5]) * 1000;
    const stateKm = tokens.slice(k + 1, k + 7).map(Number);
    if (!stateKm.every(Number.isFinite)) throw new Error('nonfinite source state');
    points.push({ ms, stateKm, uvwCov: tokens.slice(k + 7, k + 28).map(Number) });
  }
  if (points.some((p, i) => p.ms !== startMs + i * step * 1000)) throw new Error('head grid incomplete');
  return { text, points };
}

/** The registered head of a fetched prefix (amendments A1-A3): the first 481 states of its first 262,144 bytes, with the source's
 *  range, hashes and tail. Whatever was fetched beyond those bytes never enters this record. */
export function registeredHead(file) {
  const buffer = file.bytes.subarray(0, REGISTERED_BYTES), meme = openMeme(buffer);
  if (complete(meme) < REGISTERED_RECORDS) throw new Error('eight hours exceed the fixed prefix budget');
  const { text, points } = readRecords(meme, REGISTERED_RECORDS), total = buffer.length;
  return { points: points.map(({ ms, stateKm }) => ({ ms, stateKm })), source: { name: file.name, url: file.url, norad: Number(file.name.split('_')[1]), createdUtc: meme.createdUtc,
    startUtc: new Date(meme.startMs).toISOString(), retrievedUtc: file.retrievedUtc, range: [0, total - 1], bytes: total, tailBytes: total - Buffer.byteLength(text),
    sha256: sha(buffer), headSha256: sha(text), etag: file.etag, rawPersisted: false } };
}

/** The ten-minute states of the first 16 hours of a fetched prefix, each with the operator's 21 UVW covariance values as the source
 *  gives them; a file that holds less than 16 hours gives all it holds. */
export function retainedPoints(file) {
  const meme = openMeme(file.bytes);
  const declared = Math.round((meme.stopMs - meme.startMs) / (meme.step * 1000)) + 1;
  if (!Number.isInteger(declared) || declared < 1) throw new Error('invalid MEME ephemeris span');
  const count = Math.min(declared, RETAINED_RECORDS);
  if (complete(meme) < count) throw new Error('sixteen hours exceed the fixed prefix budget');
  return readRecords(meme, count).points.filter((_, i) => i % SAMPLE_EVERY === 0);
}
