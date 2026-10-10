// Derived records only: our OMM at full precision, exact statistics, convergence, gate, the chosen
// version and its provenance (URL, times, ETag, sha256 of the raw bytes). Raw operator bytes never
// reach this module.
//
//   <root>/<runId>/run.json                  settings, module and checkout provenance, snapshots, timings
//   <root>/<runId>/<group>/rows.jsonl        one row per SupGP set (paired or not, with the reason)
//   <root>/<runId>/<group>/omm.fbs           size-prefixed $OMM records of the converged fits; a row names its offset and length
//   <root>/<runId>/<group>/summary.json      the group's table line
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor({ root, runId, persist = true }) {
    this.persist = persist;
    this.dir = path.join(root, runId);
    this.groups = new Map();
    if (persist) fs.mkdirSync(this.dir, { recursive: true });
  }

  group(name) {
    if (!this.groups.has(name)) {
      const dir = path.join(this.dir, name);
      if (this.persist) fs.mkdirSync(dir, { recursive: true });
      this.groups.set(name, { dir, ommOffset: 0 });
    }
    return this.groups.get(name);
  }

  // omm: Buffer | null. The row gains {omm: {file, offset, length}} when there is one.
  writeRow(group, row, omm) {
    const g = this.group(group);
    if (omm && omm.length) {
      row.omm = { file: `${group}/omm.fbs`, offset: g.ommOffset, length: omm.length };
      if (this.persist) fs.appendFileSync(path.join(g.dir, 'omm.fbs'), omm);
      g.ommOffset += omm.length;
    }
    if (this.persist) fs.appendFileSync(path.join(g.dir, 'rows.jsonl'), `${JSON.stringify(row)}\n`);
  }

  writeJson(relative, value) {
    if (!this.persist) return;
    fs.mkdirSync(path.dirname(path.join(this.dir, relative)), { recursive: true });
    fs.writeFileSync(path.join(this.dir, relative), `${JSON.stringify(value, null, 1)}\n`);
  }
}
