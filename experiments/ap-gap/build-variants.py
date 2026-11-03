"""Build isolated experimental AP copies; never modify the modules checkout."""
from pathlib import Path
import shutil, subprocess, os, hashlib, json
modules=Path('/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules')
scratch=Path('/Users/tj/software/terrain-work/body-look/codex-apgap-d9/variants')
variants=['CONTROL','H03','H05','H07','NOFRAME','CLASS0','CLASS1','CLASS2','CLASS3','CLASS4']
manifest={}
for name in variants:
 p=scratch/name/'propagator/sdn-ap'
 if not p.exists():
  shutil.copytree(modules/'propagator/sdn-ap',p,ignore=shutil.ignore_patterns('node_modules','.build','dist','.git'))
  (p/'node_modules').symlink_to(modules/'propagator/sdn-ap/node_modules',target_is_directory=True)
  (p.parents[1]/'foundation').symlink_to(modules/'foundation',target_is_directory=True)
  r=p/'src/resonance.inc'; x=r.read_text()
  if name.startswith('H'):x=x.replace('constexpr double kSeriesE = 0.3;',f'constexpr double kSeriesE = {int(name[1:])/10:.1f};')
  if name.startswith('CLASS'):x=x.replace('inline int band_of(double n) {',f'inline int band_of(double n) {{ return {name[-1]};')
  r.write_text(x)
  r=p/'src/xp_theory.inc';x=r.read_text()
  if name=='NOFRAME':x=x.replace('s.ctx.ap_frame = t.tesseral > 0 || t.zonal > 0;','s.ctx.ap_frame = 0;')
  r.write_text(x)
 env=dict(os.environ,SPACE_DATA_NETWORK_MODULES_ROOT=str(modules))
 log=scratch/name/'build.log'
 with log.open('w') as f:
  rc=subprocess.run(['node','build.mjs'],cwd=p,env=env,stdout=f,stderr=subprocess.STDOUT).returncode
 wasm=p/'dist/isomorphic/module.wasm'
 manifest[name]={'returncode':rc,'path':str(wasm),'sha256':hashlib.sha256(wasm.read_bytes()).hexdigest() if wasm.exists() else None,'sources':{str(q.relative_to(p)):hashlib.sha256(q.read_bytes()).hexdigest() for q in (p/'src').glob('*') if q.is_file()}}
 (scratch/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(name,rc,manifest[name]['sha256'],flush=True)
 if rc:break
