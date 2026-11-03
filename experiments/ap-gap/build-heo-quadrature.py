"""Fourfold quadrature only for the newly added HEO terms."""
from pathlib import Path
import shutil,subprocess,hashlib,json,os
root=Path('/Users/tj/software/terrain-work/body-look/codex-apgap-d9/variants');source=root/'HEO20_HEAP';dest=root/'HEO20_Q4';p=dest/'propagator/sdn-ap'
if not dest.exists():
 shutil.copytree(source,dest,symlinks=True,ignore=shutil.ignore_patterns('dist','.build','.sdk-build','build.log'))
 f=p/'src/resonance.inc';s=f.read_text()
 s=s.replace('inline double hansen_G(int l, int p, int q, double e) {','inline double hansen_G(int l, int p, int q, double e, int oversample = 1) {')
 s=s.replace('const int kN = e < 0.01 ? 32 : e < 0.1 ? 64 : e < 0.8 ? 128 : (e < 0.95 ? 512 : 4096);','const int kN = oversample * (e < 0.01 ? 32 : e < 0.1 ? 64 : e < 0.8 ? 128 : (e < 0.95 ? 512 : 4096));')
 s=s.replace('inline void exact_G(int l, int p, int q, double e, double& G, double& dG) {','inline void exact_G(int l, int p, int q, double e, double& G, double& dG, int oversample = 1) {')
 start=s.index('inline void exact_G(');end=s.index('\nstruct ResCoef',start)
 block=s[start:end]
 for argument in ['e','e - 2.0 * h','e - h','e + h','e + 2.0 * h']:block=block.replace('hansen_G(l, p, q, '+argument+')','hansen_G(l, p, q, '+argument+', oversample)')
 s=s[:start]+block+s[end:];f.write_text(s)
 f=p/'src/tesseral.inc';s=f.read_text();assert s.count('res::exact_G(l,p,k-w,e,G,dG);')==1
 f.write_text(s.replace('res::exact_G(l,p,k-w,e,G,dG);','res::exact_G(l,p,k-w,e,G,dG,4);'))
with (dest/'build.log').open('w') as log:rc=subprocess.run(['node','build.mjs'],cwd=p,env=dict(os.environ,SPACE_DATA_NETWORK_MODULES_ROOT='/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules'),stdout=log,stderr=subprocess.STDOUT).returncode
wasm=p/'dist/isomorphic/module.wasm';v={'HEO20_Q4':{'returncode':rc,'path':str(wasm),'sha256':hashlib.sha256(wasm.read_bytes()).hexdigest() if rc==0 else None,'degree':20,'quadratureMultiplier':4,'changedSources':{str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [p/'src/resonance.inc',p/'src/tesseral.inc',p/'src/xp_theory.inc']}}}
(root/'heo-quadrature-manifest.json').write_text(json.dumps(v,indent=2)+'\n');print(rc,flush=True)
