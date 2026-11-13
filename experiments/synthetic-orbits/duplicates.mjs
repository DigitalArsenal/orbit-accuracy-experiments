// Repeated identities are errors. Explicit newest mode selects the greatest CREATION_DATE.
// Missing dates and ties are refused because stream order is not a creation time.
export function putUnique(map, id, value, creation, newest = false) {
  if (!id) throw new Error('record lacks HEADER.MESSAGE_ID');
  const old = map.get(id);
  if (old) {
    if (!newest) throw new Error(`duplicate record identity: ${id}`);
    const time = (s) => typeof s === 'string' ? Date.parse(/[Zz]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`) : NaN;
    const a = time(old.creation), b = time(creation);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) throw new Error(`duplicate record identity has missing or tied creation time: ${id}`);
    if (a > b) return;
  }
  map.set(id, { ...value, creation });
}
