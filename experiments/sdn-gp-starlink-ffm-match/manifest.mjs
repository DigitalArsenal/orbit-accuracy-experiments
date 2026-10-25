// The run manifest of the committed tables: commands, hashes of the plan and config, repository and modules commits, each
// module's WASM SHA-256, package versions, runtime, the environment (EOP, space weather, kernel) and the hash of the
// derived truth set. Output: results/sdn-gp-starlink-ffm-match/manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config, dir, root, store, results, write, sha256 } from './common.mjs';
import { modulesRoot, openModule } from './lib/modules.mjs';
import { sdsVersion } from './lib/sds.mjs';
import { builds as sdngpBuilds } from './lib/sdngp-rows.mjs';

const git = (cwd, ...a) => { try { return execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
// the files of an A8 source (hac/<dir>, any depth): their count and one hash over the sorted (name, SHA-256) rows of their provenance records
function provenanceSet(dir) {
  const rows = [];
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.provenance.json')) { const p = JSON.parse(fs.readFileSync(f, 'utf8')); rows.push([p.file, p.sha256, p.retrieved_utc ?? p.retrievedUtc]); } } };
  walk(dir);
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return { files: rows.length, setSha256: sha256(JSON.stringify(rows.map((r) => r.slice(0, 2)))), firstRetrievedUtc: rows.map((r) => r[2]).sort()[0] ?? null, lastRetrievedUtc: rows.map((r) => r[2]).sort().at(-1) ?? null };
}

export function manifest() {
  const modules = modulesRoot();
  const wasm = (rel) => { const m = JSON.parse(fs.readFileSync(path.join(modules, rel, 'plugin-manifest.json'), 'utf8')); return { path: rel, version: m.version, wasmSha256: sha256(fs.readFileSync(path.join(modules, rel, 'dist/isomorphic/module.wasm'))) }; };
  const truthDir = path.join(store, 'truth');
  const truth = fs.existsSync(truthDir) ? fs.readdirSync(truthDir).filter((n) => /^\d+\.json$/.test(n)).sort((a, b) => Number(a.replace('.json', '')) - Number(b.replace('.json', ''))).map((n) => { const m = JSON.parse(fs.readFileSync(path.join(truthDir, n))); return [m.norad, m.truth.sha256]; }) : [];
  const env = path.join(store, 'environment/environment.json');
  const envJson = fs.existsSync(env) ? JSON.parse(fs.readFileSync(env, 'utf8')) : null;
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  return {
    experiment: config.experiment,
    commands: ['node experiments/sdn-gp-starlink-ffm-match/population.mjs', 'node experiments/sdn-gp-starlink-ffm-match/truth.mjs --workers N', 'node experiments/sdn-gp-starlink-ffm-match/baselines.mjs', 'node experiments/sdn-gp-starlink-ffm-match/bench.mjs', 'node experiments/sdn-gp-starlink-ffm-match/comspoc.mjs', 'node experiments/sdn-gp-starlink-ffm-match/covariance.mjs', 'node experiments/sdn-gp-starlink-ffm-match/fitlength.mjs --limit 100', 'node experiments/sdn-gp-starlink-ffm-match/fetch-kernels.mjs get <path> --dest spk/missions/<mission> (11 files, 5 s apart)', 'node experiments/sdn-gp-starlink-ffm-match/spk-windows.mjs', 'node experiments/sdn-gp-starlink-ffm-match/refit.mjs --cap 30 --workers 10', 'node experiments/sdn-gp-starlink-ffm-match/newer.mjs --shard k/4 (re-run as newer files arrive)', 'node experiments/sdn-gp-starlink-ffm-match/newer.mjs --truth refit30 --daily-only', 'node experiments/sdn-gp-starlink-ffm-match/m123.mjs --workers 10', 'node experiments/sdn-gp-starlink-ffm-match/m123-report.mjs', 'node experiments/sdn-gp-starlink-ffm-match/fetch-horizons.mjs', 'NODE_EXTRA_CA_CERTS=<archive>/hac/.ca/emsign-root-ca-g1.pem node experiments/sdn-gp-starlink-ffm-match/fetch-mast-tess.mjs', 'node experiments/sdn-gp-starlink-ffm-match/fetch-gnss-rapid.mjs --from 2026-10-11 --to 2026-10-22', 'node experiments/sdn-gp-starlink-ffm-match/gnss-rapid-convert.mjs --from 2026-10-11 --to 2026-10-22', 'node experiments/sdn-gp-starlink-ffm-match/baselines.mjs --source gnss-rapid,mgex-geo-rapid,mgex-igso-rapid', 'node experiments/sdn-gp-starlink-ffm-match/spk-windows.mjs --source heo-tess', 'node experiments/sdn-gp-starlink-ffm-match/comspoc-precise.mjs', 'node experiments/sdn-gp-starlink-ffm-match/fetch-slr.mjs --from 2026-10-08 --to 2026-10-24 --weeks 260912,260919,260926,261003', 'node experiments/sdn-gp-starlink-ffm-match/slr-convert.mjs', 'node experiments/sdn-gp-starlink-ffm-match/baselines.mjs --source slr-low-current,slr-high-current', 'node experiments/sdn-gp-starlink-ffm-match/sdngp-run.mjs --workers 8 [--pin <build>] (baselines.mjs --arm sdngp, spk-windows.mjs --arm sdngp, starlink-sdngp.mjs, starlink-lowering.mjs, fitlength.mjs --arm sdngp, span-windows.mjs --arm sdngp)', 'node experiments/sdn-gp-starlink-ffm-match/span-windows.mjs (SGP4 and XP of the COMSPOC-aligned fit-span windows; the SDN-AP arm runs inside sdngp-run.mjs)', 'node experiments/sdn-gp-starlink-ffm-match/lunar-maneuvers.mjs', 'SDNGP_SNAPSHOT=<build> node experiments/sdn-gp-starlink-ffm-match/segment-windows.mjs --shard k/8 (inside sdngp-run.mjs: the cislunar and heliocentric packs through the segment fits)', 'SDNGP_SNAPSHOT=<build> node experiments/sdn-gp-starlink-ffm-match/lunar-windows.mjs --shard k/8 (inside sdngp-run.mjs; the default-span rows are baselines.mjs, spk-windows.mjs and span-windows.mjs with --arm sdngp --span default)', 'node experiments/sdn-gp-starlink-ffm-match/horizons-packs.mjs', 'node experiments/sdn-gp-starlink-ffm-match/regime-windows.mjs', 'node experiments/sdn-gp-starlink-ffm-match/score-pack.mjs --pack <pack> --start <ISO> --fit-hours <h> --predicted <states.oem>', 'node experiments/sdn-gp-starlink-ffm-match/inventory.mjs', 'node experiments/sdn-gp-starlink-ffm-match/tables.mjs', 'node experiments/sdn-gp-starlink-ffm-match/manifest.mjs', 'node experiments/sdn-gp-starlink-ffm-match/run.mjs --check', 'node experiments/sdn-gp-starlink-ffm-match/events-truth.mjs --kind m22,m23,m28 --shard k/n', 'node experiments/sdn-gp-starlink-ffm-match/sdngp-run.mjs --pin <build> --only m22,m23,m28,m24', 'node experiments/sdn-gp-starlink-ffm-match/fetch-iss-oem.mjs (NASA ISS OEM archive, 748 files, 2 s apart)', 'node experiments/sdn-gp-starlink-ffm-match/iss-burns.mjs', 'node experiments/sdn-gp-starlink-ffm-match/sdngp-run.mjs --pin <build> --only m24a,m24p,m29,m30', 'node experiments/sdn-gp-starlink-ffm-match/m29-extract.mjs; node experiments/sdn-gp-starlink-ffm-match/m29-extract-cords.mjs [--shard k/n | --merge]', 'node experiments/sdn-gp-starlink-ffm-match/m30-truth.mjs (re-run as TIP and decay messages arrive)', 'node experiments/sdn-gp-starlink-ffm-match/m31-capture.mjs --workers k/n; node experiments/sdn-gp-starlink-ffm-match/m31-capture.mjs --summary', 'node experiments/sdn-gp-starlink-ffm-match/m32-truth.mjs', 'node experiments/sdn-gp-starlink-ffm-match/sdngp-run.mjs --pin <build> --only m31,m32', 'node experiments/sdn-gp-starlink-ffm-match/fetch-gnss-notices.mjs (GPS NANUs of 2026 and the QZSS NAQU page, 5 s apart)', 'node experiments/sdn-gp-starlink-ffm-match/m27-events.mjs', 'node experiments/sdn-gp-starlink-ffm-match/sdngp-run.mjs --pin <build> --only m27'],
    planSha256: sha256(fs.readFileSync(path.join(dir, 'PLAN.md'))), configSha256: sha256(fs.readFileSync(path.join(dir, 'config.json'))),
    repository: { commit: git(root, 'rev-parse', 'HEAD') }, modules: { commit: git(modules, 'rev-parse', 'HEAD'), artifacts: ['propagator/sgp4-xp', 'analysis/gp-error-model', 'analysis/od', 'propagator/ffm', 'files/orbit-products', 'foundation/time', 'foundation/frames'].map(wasm) },
    packages: { ...pkg.dependencies, lockfileSha256: sha256(fs.readFileSync(path.join(dir, 'package-lock.json'))), spacedatastandardsInstalled: sdsVersion },
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    environment: envJson && { environmentSha256: sha256(fs.readFileSync(env)), weatherSources: envJson.weatherSources, weatherExtension: envJson.weatherExtension, kernel: envJson.kernel, createdUtc: envJson.createdUtc },
    truthSet: { satellites: truth.length, setSha256: sha256(JSON.stringify(truth)) },
    // amendment A10: the FFM-1 truths of the maneuver and decay measurements (<store>/events/), one hash over the sorted (name, SHA-256) rows of each kind
    events: (() => {
      const d = path.join(store, 'events');
      if (!fs.existsSync(d)) return null;
      const kind = (k) => { const dd = path.join(d, k); if (!fs.existsSync(dd)) return null; const rows = fs.readdirSync(dd).filter((n) => n.endsWith('.json')).sort().map((n) => { const j = JSON.parse(fs.readFileSync(path.join(dd, n), 'utf8')); return [n, j.sha256 ?? null, j.wasmSha256 ?? null]; }); return { files: rows.length, setSha256: sha256(JSON.stringify(rows)), ffmWasmSha256: [...new Set(rows.map((r) => r[2]).filter(Boolean))] }; };
      return { m22: kind('m22'), m23: kind('m23'), m28: kind('m28') };
    })(),
    comspoc: (() => { const f = path.join(config.archive, 'hac/comspoc-spacebook/2026/2026-10-23/run.json'); if (!fs.existsSync(f)) return null; const r = JSON.parse(fs.readFileSync(f, 'utf8')); return { label: 'COMSPOC Spacebook XP (local scoring only)', startedUtc: r.started_utc, terms: r.terms, xpTleSha256: r.files.find((x) => x.file.endsWith('xp-tle.txt.gz'))?.sha256, syncopateObjects: fs.readdirSync(path.join(path.dirname(f), 'syncopate')).filter((n) => n.endsWith('.e.gz')).length }; })(),
    kernels: fs.existsSync(path.join(results, 'kernels.json')) ? JSON.parse(fs.readFileSync(path.join(results, 'kernels.json'), 'utf8')).rows.map((k) => ({ mission: k.mission, file: k.file, bytes: k.bytes, sha256: k.sha256, url: k.url, retrievedUtc: k.retrievedUtc })) : null,
    a8Sources: { jplHorizons: provenanceSet(path.join(config.archive, 'hac/jpl-horizons')), mastTess: provenanceSet(path.join(config.archive, 'hac/mast-tess')), gfzGnssRapid: provenanceSet(path.join(config.archive, 'hac/gfz-gnss-rapid')), ilrsCddis: provenanceSet(path.join(config.archive, 'hac/ilrs-cddis')) },
    // SDN-AP (amendment A9b): side B's module is built from its working tree and rebuilt in place, so each build run is named by the SHA-256 of its wasm; the module is closed and its wasm is not in this repository
    sdngp: { headlineBuild: sdngpBuilds().filter((x) => x.complete).at(-1)?.build ?? null, builds: sdngpBuilds().map((x) => ({ build: x.build, wasmSha256: x.wasmSha256, sourceCommit: x.sourceCommit, sourceUncommittedFiles: x.sourceDirtyFiles, firstUseUtc: x.firstUseUtc, complete: Boolean(x.complete), eventsFocus: (() => { const f = path.join(x.dir, 'events-focus.json'); if (x.complete || !fs.existsSync(f)) return null; const j = JSON.parse(fs.readFileSync(f, 'utf8')); return { sources: j.sources, rows: j.rows }; })() })) },
    // amendment A11: the sources of M24 on the archive, M29, M30 and M31 (hashes and counts only)
    a11: (() => {
      const iss = provenanceSet(path.join(config.archive, 'hac/nasa-iss-oem-archive'));
      const cordsFile = path.join(config.archive, 'hac/aerospace-cords/Reentry_History_Spreadsheet_05-22-26.csv');
      const swInfo = path.join(store, 'environment/space-weather-history.json');
      const setsDir = path.join(store, 'm29/sets');
      const sets = fs.existsSync(setsDir) ? fs.readdirSync(setsDir).filter((n) => /^\d+\.json$/.test(n)).sort((a, c) => Number(a.replace('.json', '')) - Number(c.replace('.json', ''))).map((n) => { const j = JSON.parse(fs.readFileSync(path.join(setsDir, n), 'utf8')); return [n, j.sets.length, j.sets[0]?.EPOCH ?? null, j.sets.at(-1)?.EPOCH ?? null, j.truth?.ms ?? j.tips?.at(-1)?.decayMs ?? null]; }) : [];
      const m31Dir = path.join(store, 'm31/truth');
      const m31 = fs.existsSync(m31Dir) ? fs.readdirSync(m31Dir).filter((n) => /^\d+\.json$/.test(n)).sort().map((n) => { const j = JSON.parse(fs.readFileSync(path.join(m31Dir, n), 'utf8')); return [j.norad, j.truth.sha256]; }) : [];
      const snapshots = (kind) => { // the dated files of every year folder of a kind
        const root = path.join(config.archive, 'spacetrack', kind);
        if (!fs.existsSync(root)) return null;
        const f = fs.readdirSync(root).filter((n) => /^\d{4}$/.test(n)).sort().flatMap((y) => fs.readdirSync(path.join(root, y)).filter((n) => n.endsWith('.json.gz')).sort().map((n) => `${y}/${n}`));
        return { files: f.length, first: f[0], last: f.at(-1) };
      };
      return {
        issArchive: iss, cords: fs.existsSync(cordsFile) ? { file: path.basename(cordsFile), bytes: fs.statSync(cordsFile).size, sha256: sha256(fs.readFileSync(cordsFile)) } : null,
        spaceWeatherHistory: fs.existsSync(swInfo) ? (({ rows, first, last, gfzRows, droppedDays, gfzFileSha256, checkAgainstSavedRows }) => ({ rows, first, last, gfzRows, droppedDays: droppedDays.length, gfzFileSha256, check: { rows: checkAgainstSavedRows.rows, fieldsEqual: checkAgainstSavedRows.fieldsEqual, fieldsCompared: checkAgainstSavedRows.fieldsCompared } }))(JSON.parse(fs.readFileSync(swInfo, 'utf8'))) : null,
        m29: { objects: sets.length, setCounts: sets.reduce((a, r) => a + r[1], 0), setSha256: sha256(JSON.stringify(sets)), 'space-track': { tip: snapshots('tip'), decay: snapshots('decay'), gpHistory: snapshots('gp_history/by-creation') } },
        m31: { satellites: m31.length, setSha256: sha256(JSON.stringify(m31)) },
        // amendment A14: the GNSS notices (hashes of the raw files kept in the archive, and of the outage windows committed under results/)
        notices: (() => { const f = path.join(results, 'gnss-notice-events.json'); if (!fs.existsSync(f)) return null; const j = JSON.parse(fs.readFileSync(f, 'utf8')); return { gpsNanu: j.gps.source, qzssNaqu: j.qzss.source, eventsSha256: sha256(fs.readFileSync(f)), beidou: 'not reachable (hac/gnss-notices/beidou-attempts.json)' }; })(),
        // amendment A12b: the FFM-1 truths of the synthetic batches (hash of each object's samples, in batch and object order)
        m32: (() => { const d = path.join(store, 'm32'); if (!fs.existsSync(d)) return null; const rows = fs.readdirSync(d).filter((n) => fs.existsSync(path.join(d, n, 'index.json'))).sort().map((n) => { const j = JSON.parse(fs.readFileSync(path.join(d, n, 'index.json'), 'utf8')); return [n, j.seed, j.sigmaMS, j.objects.map((o) => o.sha256)]; }); return { batches: rows.length, setSha256: sha256(JSON.stringify(rows)), ffmWasmSha256: [...new Set(fs.readdirSync(d).filter((n) => fs.existsSync(path.join(d, n, 'index.json'))).flatMap((n) => JSON.parse(fs.readFileSync(path.join(d, n, 'index.json'), 'utf8')).objects.map((o) => o.ffmWasmSha256)))] }; })(),
      };
    })(),
    populationQueueSha256: fs.existsSync(path.join(results, 'population.json')) ? JSON.parse(fs.readFileSync(path.join(results, 'population.json'))).queueSha256 : null,
  };
}
if (process.argv[1] === new URL(import.meta.url).pathname) { write(path.join(results, 'manifest.json'), manifest()); console.log('manifest written'); }
