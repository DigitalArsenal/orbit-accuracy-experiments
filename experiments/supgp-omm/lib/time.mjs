// Time helpers shared by the pass. UTC text in, milliseconds out, and back; no time-scale conversion happens here.
export const parseUtc = (text) => Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`);
export const snapToSecond = (ms) => Math.round(ms / 1000) * 1000;
// A SupGP set's EPOCH on the second: CelesTrak's epochs sit on the operator's state grid, with microsecond noise.
export const setEpochMs = (row) => snapToSecond(parseUtc(row.epoch));
// ISO 8601 UTC with six decimals and a Z, the form the modules read and write.
export const isoZ = (ms) => new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
// The same without the Z ($OEM epochs).
export const isoMicro = (ms) => new Date(ms).toISOString().replace(/Z$/, '000');
