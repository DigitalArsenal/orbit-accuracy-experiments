"""One finer convergence check after the registered fourfold check failed."""
from pathlib import Path
import shutil,subprocess,hashlib,json,os
root=Path('/Users/tj/software/terrain-work/body-look/codex-apgap-d9/variants');source=root/'HEO20_Q4';dest=root/'HEO20_Q16';p=dest/'propagator/sdn-ap'
if not dest.exists():
 shutil.copytree(source,dest,symlinks=True,ignore=shutil.ignore_patterns('dist','.build','.sdk-build','build.log'))
 f=p/'src/tesseral.inc';s=f.read_text();assert s.count('res::exact_G(l,p,k-w,e,G,dG,4);')==1;f.write_text(s.replace('res::exact_G(l,p,k-w,e,G,dG,4);','res::exact_G(l,p,k-w,e,G,dG,16);'))
with (dest/'build.log').open('w') as log:rc=subprocess.run(['node','build.mjs'],cwd=p,env=dict(os.environ,SPACE_DATA_NETWORK_MODULES_ROOT='/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules'),stdout=log,stderr=subprocess.STDOUT).returncode
wasm=p/'dist/isomorphic/module.wasm';v={'HEO20_Q16':{'returncode':rc,'path':str(wasm),'sha256':hashlib.sha256(wasm.read_bytes()).hexdigest() if rc==0 else None,'degree':20,'quadratureMultiplier':16,'changedSources':{str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [p/'src/resonance.inc',p/'src/tesseral.inc',p/'src/xp_theory.inc']}}}
(root/'heo-refinement-manifest.json').write_text(json.dumps(v,indent=2)+'\n');print(rc,flush=True)
