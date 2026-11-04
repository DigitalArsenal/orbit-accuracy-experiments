// The AP build the site shows: AP7.md passed 2026-11-03. Its store under <archive>/operator-theory/ap, its arm name in the laser and provider
// stores, and its module. Whiteroom XP is the same module with its forces off, so it comes from this build too. The registered verdicts of
// AP4.md to AP7.md keep their own stores.
export const BUILD = 'b0411', AP_ARM = 'A-APm', AP_VERSION = '0.4.11';
export const AP_MODULE = { commit: 'a0f33bc545d76f47d679c7854c6963fb8efcf799', sha256: 'e4edacb03daff4eaba47263010c27009a6d888259c0d8f028605cebf4d655610' };
// The build every flight of this experiment runs from 2026-11-04 (one $OCM in): space-data-network-modules ea824356, propagator/sdn-ap 0.5.1
// (fit emits one $OCM carrying its weather rows; propagate takes that $OCM and a $PCF OUTPUT.EPOCHS; 0.5.0 plus the ephemeris source's $PVN
// carried onto the record) and propagator/sgp4-xp 0.2.1 (the Space Force library; 0.2.1 flies whole integrator steps). Each wasm and manifest by
// git show at the commit, SHA-256 checked; never a working tree. The other modules stay at XM's and XM3's builds (their build.json).
export const PIN = {
  modulesCommit: 'ea824356587f54149f876cd3b2b5d8134af682d3',
  wasmSha256: {
    'propagator/sdn-ap': 'd29acd2b5d921446f7da8dbf51f45ba53d59dc7685e677616dcd81944981efdb',
    'propagator/sgp4-xp': '816fd137d76197f2af93501d7d71c527383f7589ab698d5d1d3544782cd2feef',
  },
  versions: { 'propagator/sdn-ap': '0.5.1', 'propagator/sgp4-xp': '0.2.1' },
};
// S1-STEP-FREE.md's FFM flight (amendment 2): propagator/ffm 2.2.0, RK78 carrying Fehlberg's 8th-order solution (2.0.4 to 2.1.0 carried the 7th), by its dist SHA-256
// at the modules commit it lands in on main; analysis/estimation stays XM3's 0.7.0.
export const FFM_220 = { module: 'propagator/ffm', version: '2.2.0', modulesCommit: null, wasmSha256: 'd635a3d57a2c9ca91d111f74aad38b9d748d6c16199b22c6922af21c92fe2153' };
export const BUILD_NOTE = `modules ${PIN.modulesCommit.slice(0, 8)}: sdn-ap ${PIN.versions['propagator/sdn-ap']} (${PIN.wasmSha256['propagator/sdn-ap'].slice(0, 12)}), sgp4-xp ${PIN.versions['propagator/sgp4-xp']} (${PIN.wasmSha256['propagator/sgp4-xp'].slice(0, 12)})`;
// The builds behind the compare tables' columns (results/ap-truth/compare/table.json and xp-versions.json name the same ones), each wasm by SHA-256:
// key module@sha256[0, 12]. SGP4 is fitted by analysis/gp-error-model and flown by propagator/sgp4; FFM fitted by analysis/estimation, flown by propagator/ffm.
const record = (module, version, commit, sha256) => ({ key: `${module}@${sha256.slice(0, 12)}`, module, version, commit, sha256 });
const XM_COMMIT = 'fbda894501f32210b77c74b53bcad036ce7a1b07', XM3_COMMIT = '9a05d899b95242b358939ab1d68a776170a6b167';
const AP0411 = record('propagator/sdn-ap', AP_VERSION, AP_MODULE.commit, AP_MODULE.sha256);
const AP051 = record('propagator/sdn-ap', PIN.versions['propagator/sdn-ap'], PIN.modulesCommit, PIN.wasmSha256['propagator/sdn-ap']);
const XPU021 = record('propagator/sgp4-xp', PIN.versions['propagator/sgp4-xp'], PIN.modulesCommit, PIN.wasmSha256['propagator/sgp4-xp']);
/** propagator/sgp4-xp 0.1.1, the build every Space Force XP figure ran before 2026-11-04 (xp-versions.json), for XP-ARM-0-2-1.md's attribution only. */
export const USSF_011 = { modulesCommit: '1b905d16f68fc56e7da66c6392315970f9e7e6d0', wasmSha256: 'f61b15c4fd658817e3e43c7818da18c4d08d453ad28e9d704b0cd11b616b7deb', version: '0.1.1' };
const XPU011 = record('propagator/sgp4-xp', USSF_011.version, USSF_011.modulesCommit, USSF_011.wasmSha256);
const SGP4 = [record('analysis/gp-error-model', '0.11.0', XM_COMMIT, '8e13eddbd5ccc3e0ee121f3b851e8314e426715cf5517823aa8d925566ef0e19'), record('propagator/sgp4', '1.4.1', XM_COMMIT, '2fe246b716c78a4b947cd95e70e126b7a738cbbb9775e5196f07b1fe551f4643')];
const FFM = [record('analysis/estimation', '0.7.0', XM3_COMMIT, '7a555ca5b3ed0b021dd5b7986bd73dd8f8dc5125a2aa7943e3b3e983320d6bcd'), record('propagator/ffm', '2.0.4', XM3_COMMIT, 'c36f1b14fc233e88725d57724c3bae7ad025cfdd9d8d4520c3bcccd0f8a816b2')];
/** Each column's builds, by the rows a cell reads: precise-orbit cells fly AP 0.5.1 (ap/b051); next-file AP is 0.4.11's (no later run of those pairs);
 *  the Space Force XP is 0.2.1's except the held SpaceX cells, carried with 0.1.1's. Center is the operator's own file: no module. */
export const COLUMN_BUILDS = {
  next: { SGP4, XP: [AP0411], XPU: [XPU021], AP: [AP0411], FFM20: FFM, FFM40: FFM, FFMfull: FFM, Center: [] },
  truth: { SGP4, XP: [AP0411], XPU: [XPU021], AP: [AP051], FFM20: FFM, FFM40: FFM },
  held: { SGP4, XP: [AP0411], XPU: [XPU011], AP: [AP0411], FFM20: FFM, FFM40: FFM, FFMfull: FFM, Center: [] },
};
/** Every record above by key: { module, version, commit, sha256 }. */
export const BUILD_RECORDS = Object.fromEntries([AP0411, AP051, XPU021, XPU011, ...SGP4, ...FFM].map(({ key, ...b }) => [key, b]));
