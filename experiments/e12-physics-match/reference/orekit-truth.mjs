// Orekit 13.1 truth ephemerides for E12: writes the cases to JSON, runs
// OrekitTruth.java (single-file launch, `nice -n 10`) and returns its states
// with the provenance of what produced them. The reference engine is Orekit
// (CS GROUP, Apache-2.0) with Hipparchus; its constants follow HPOP's
// (OrekitTruth.java header), so a difference between a case and HPOP, or
// between two cases, is a model difference. 'EGM2008' is the field HPOP
// embeds, written by propagator/hpop's make-gfc.mjs into
// runs/cache/e12-orekit-gfc/ once; 'EIGEN6S' is orekit-data's
// Potential/eigen-6s.gfc (a field HPOP does not have). The cases are
// synthetic: nothing here is operator data.
//
//   const { cases, provenance } = await orekitTruth(cases, { workDir });
//   cases:      [{ id, samples: [{ epoch, state: [x, y, z, vx, vy, vz] }], orekitVersion, notes }]
//               (GCRF, metres and m/s; epochs as requested)
//   provenance: { orekitVersion, orekitJar: {path, sha256}, hipparchus: [{path, sha256}],
//                 orekitData, gfc: {file: sha256}, java, javaSource: sha256, casesSha256 }
// Environment: OREKIT_DATA (default: the gmat09-authority orekit-data),
// SDN_MODULES_ROOT (for make-gfc.mjs), OREKIT_TRUTH_THREADS (default 2),
// OREKIT_JB2008_DIR (a directory with newer SOLFSMY.TXT/DTCFILE.TXT, for JB2008).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { modulesRoot } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const m2 = path.join(os.homedir(), '.m2', 'repository', 'org');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const newest = (dir, prefix) => fs.readdirSync(dir).filter((v) => v.startsWith(prefix)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);

// The Orekit 13.1.x jar and the Hipparchus modules its pom names.
function classpath() {
  const version = newest(path.join(m2, 'orekit', 'orekit'), '13.1.');
  const jar = path.join(m2, 'orekit', 'orekit', version, `orekit-${version}.jar`);
  const pom = fs.readFileSync(path.join(m2, 'orekit', 'orekit', version, `orekit-${version}.pom`), 'utf8');
  const hv = pom.match(/<orekit\.hipparchus\.version>([^<]+)</)[1];
  const hipparchus = ['core', 'geometry', 'ode', 'filtering', 'fitting', 'optim', 'stat'].map((n) => path.join(m2, 'hipparchus', `hipparchus-${n}`, hv, `hipparchus-${n}-${hv}.jar`));
  for (const f of [jar, ...hipparchus]) if (!fs.existsSync(f)) throw new Error(`missing jar ${f}`);
  return { version, jar, hipparchus };
}

// runs/cache/e12-orekit-gfc/EGM2008-hpop.gfc: HPOP's embedded EGM2008 to degree 70,
// GM 3.986004415e14, radius 6378136.3 m (as OrekitReference.java is run).
function gfcDir() {
  const dir = path.join(repoRoot, 'runs', 'cache', 'e12-orekit-gfc'), file = path.join(dir, 'EGM2008-hpop.gfc');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    const modules = modulesRoot({ repoRoot, configured: '../../main-packages/space-data-network-modules' });
    const r = spawnSync('nice', ['-n', '10', 'node', path.join(modules, 'propagator/hpop/tests/fixtures/orekit/make-gfc.mjs'), file, '70', '3.986004415e14', '6378136.3', 'egm2008'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`make-gfc.mjs failed: ${r.stderr}`);
  }
  return dir;
}

export async function orekitTruth(cases, { workDir }) {
  const orekitData = process.env.OREKIT_DATA ?? '/Users/tj/software/gmat09-authority/orekit-data/orekit-data-main';
  if (!fs.existsSync(path.join(orekitData, 'Potential', 'eigen-6s.gfc'))) throw new Error(`not an orekit-data directory: ${orekitData} (set OREKIT_DATA)`);
  const cp = classpath(), gfc = gfcDir();
  fs.mkdirSync(workDir, { recursive: true });
  const input = path.join(workDir, 'cases.json'), output = path.join(workDir, 'truth.json');
  fs.writeFileSync(input, JSON.stringify({ cases }));
  fs.rmSync(output, { force: true });
  const r = spawnSync('nice', ['-n', '10', 'java', `-XX:ActiveProcessorCount=${process.env.OREKIT_TRUTH_THREADS ?? 2}`, `-Dorekit.version=${cp.version}`, ...(process.env.OREKIT_JB2008_DIR ? [`-Dorekit.jb2008Dir=${process.env.OREKIT_JB2008_DIR}`] : []),
    '-cp', [cp.jar, ...cp.hipparchus].join(':'), path.join(here, 'OrekitTruth.java'), orekitData, gfc, input, output],
  { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (!fs.existsSync(output)) throw new Error(`OrekitTruth produced no output (status ${r.status}): ${r.stderr}`);
  const out = JSON.parse(fs.readFileSync(output, 'utf8'));
  const failed = out.cases.filter((c) => c.error);
  if (failed.length || r.status !== 0) throw new Error(`OrekitTruth: ${failed.map((c) => `${c.id}: ${c.error}`).join('; ') || r.stderr}`);
  if (out.cases.length !== cases.length || out.cases.some((c, k) => c.id !== cases[k].id)) throw new Error('OrekitTruth returned different cases than requested');
  return {
    cases: out.cases,
    provenance: {
      orekitVersion: cp.version, orekitJar: { path: cp.jar, sha256: sha256(cp.jar) },
      hipparchus: cp.hipparchus.map((f) => ({ path: f, sha256: sha256(f) })),
      orekitData, gfc: Object.fromEntries(['EGM2008-hpop.gfc'].map((f) => [f, sha256(path.join(gfc, f))]).concat([['eigen-6s.gfc', sha256(path.join(orekitData, 'Potential', 'eigen-6s.gfc'))]])),
      ...(process.env.OREKIT_JB2008_DIR ? { jb2008: Object.fromEntries(['SOLFSMY.TXT', 'DTCFILE.TXT'].map((f) => [f, sha256(path.join(process.env.OREKIT_JB2008_DIR, f))])) } : {}),
      java: spawnSync('java', ['-version'], { encoding: 'utf8' }).stderr.split('\n')[0],
      javaSource: sha256(path.join(here, 'OrekitTruth.java')), casesSha256: sha256(input),
    },
  };
}
