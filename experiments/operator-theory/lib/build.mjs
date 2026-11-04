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
export const BUILD_NOTE = `modules ${PIN.modulesCommit.slice(0, 8)}: sdn-ap ${PIN.versions['propagator/sdn-ap']} (${PIN.wasmSha256['propagator/sdn-ap'].slice(0, 12)}), sgp4-xp ${PIN.versions['propagator/sgp4-xp']} (${PIN.wasmSha256['propagator/sgp4-xp'].slice(0, 12)})`;
