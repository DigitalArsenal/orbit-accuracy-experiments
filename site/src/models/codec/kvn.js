// CCSDS KVN text as rows, and each keyword's SDS field. Tokenizing and
// lookup only: values stay the text the message printed.

// rows: [{block, key, value, units}] and data lines [{block, values: [text]}].
export function readKvn(text) {
  const rows = [], data = [];
  let block = 'HEADER';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const start = /^(\w+)_START$/.exec(line), stop = /^(\w+)_STOP$/.exec(line);
    if (start) { block = start[1]; continue; }
    if (stop) { block = block === 'META' ? 'HEADER_AFTER' : 'BODY'; continue; }
    if (line.startsWith('COMMENT')) { rows.push({ block, key: 'COMMENT', value: line.replace(/^COMMENT\s*=?\s*/, ''), units: '' }); continue; }
    const kv = /^([A-Z0-9_]+)\s*=\s*(.*?)\s*(\[[^\]]*\])?\s*$/.exec(line);
    if (kv) { rows.push({ block, key: kv[1], value: kv[2], units: kv[3] ? kv[3].slice(1, -1) : '' }); continue; }
    data.push({ block, values: line.split(/\s+/) });
  }
  return { rows, data };
}

// The SDS table each KVN block fills, by schema.
const BLOCK_TABLES = {
  OCM: { HEADER: ['Header'], META: ['Metadata'], TRAJ: ['OCM', 'StateVector', 'Metadata'], PHYS: ['PhysicalProperties'], PERT: ['Perturbations'],
    MAN: ['Maneuver'], OD: ['OrbitDetermination'], USER: ['UserDefinedParameters'], COV: ['OCM'] },
};
const PARENT = { Header: 'HEADER', Metadata: 'METADATA', PhysicalProperties: 'PHYSICAL_PROPERTIES', Perturbations: 'PERTURBATIONS',
  OrbitDetermination: 'ORBIT_DETERMINATION', Maneuver: 'MANEUVER_DATA[]', UserDefinedParameters: 'USER_DEFINED_PARAMETERS[]', StateVector: 'STATE_VECTOR', OCM: '' };

// The SDS field path a keyword lands in, with its schema documentation.
export function sdsField(schema, code, block, key) {
  const order = [...(BLOCK_TABLES[code]?.[block] ?? []), ...Object.keys(schema.tables)];
  for (const table of order) {
    const field = schema.tables[table]?.find((f) => f.name === key);
    if (field) return { path: [PARENT[table] ?? table, field.name].filter(Boolean).join('.'), doc: field.doc, type: field.type };
  }
  if (block === 'USER') return { path: 'USER_DEFINED_PARAMETERS[].PARAM_NAME / PARAM_VALUE', doc: 'User-defined parameter.', type: 'string' };
  return null;
}

// An SDS record's leaf fields as [path, value] rows (object API instances).
export function flatten(value, prefix = '', out = []) {
  if (value === null || value === undefined || value === '' ) return out;
  if (Array.isArray(value)) {
    if (!value.length) return out;
    if (value.every((v) => typeof v === 'number')) { out.push([prefix, value.length > 8 ? `${value.slice(0, 6).map(fmt).join(' ')} … (${value.length})` : value.map(fmt).join(' ')]); return out; }
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  if (value === 0 || value === false) return out;
  out.push([prefix, typeof value === 'number' ? fmt(value) : String(value)]);
  return out;
}
const fmt = (x) => (typeof x === 'number' ? (Number.isInteger(x) ? String(x) : Number(x.toPrecision(12)).toString()) : String(x));
