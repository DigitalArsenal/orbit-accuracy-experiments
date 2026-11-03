from pathlib import Path
import shutil,os,subprocess,hashlib,json
m=Path('/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules')
s=Path('/Users/tj/software/terrain-work/body-look/codex-apgap-d9/ussf');manifest={}
for name in ['CONTROL','FIXED']:
 p=s/name/'propagator/sgp4-xp'
 if not p.exists():
  shutil.copytree(m/'propagator/sgp4-xp',p,ignore=shutil.ignore_patterns('node_modules','dist','.git','third_party'))
  (p/'node_modules').symlink_to(m/'node_modules',target_is_directory=True)
  (p/'third_party').symlink_to(m/'propagator/sgp4-xp/third_party',target_is_directory=True)
  (p.parents[1]/'foundation').symlink_to(m/'foundation',target_is_directory=True)
  (p.parents[1]/'node_modules').symlink_to(m/'node_modules',target_is_directory=True)
  if name=='FIXED':
   f=p/'src/fit.hpp';x=f.read_text();assert 'if (xp_) active.push_back(7);' in x;f.write_text(x.replace('if (xp_) active.push_back(7);','/* AGOM held at zero seed */'))
 temp=s/name/'tmp';temp.mkdir(exist_ok=True)
 with (s/name/'build.log').open('w') as log:rc=subprocess.run(['node','build.mjs'],cwd=p,env=dict(os.environ,TMPDIR=str(temp)),stdout=log,stderr=subprocess.STDOUT).returncode
 wasm=p/'dist/isomorphic/module.wasm';manifest[name]={'returncode':rc,'path':str(wasm),'sha256':hashlib.sha256(wasm.read_bytes()).hexdigest() if wasm.exists() else None,'fitSha256':hashlib.sha256((p/'src/fit.hpp').read_bytes()).hexdigest()}
 (s/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(name,rc,flush=True)
 if rc:break
 if name=='CONTROL' and manifest[name]['sha256']!=hashlib.sha256((m/'propagator/sgp4-xp/dist/isomorphic/module.wasm').read_bytes()).hexdigest():
  manifest[name]['controlMismatch']=True;(s/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('CONTROL differs from prescribed wasm; fixed comparison withheld',flush=True);break
