"""Rebuild the prescribed Space Force wrapper from its artifact commit, then hold AGOM."""
from pathlib import Path
import os,subprocess,hashlib,json,sys,io,tarfile
m=Path('/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules')
s=Path('/Users/tj/software/terrain-work/body-look/codex-apgap-d9/ussf');manifest={}
commit='1b905d16f68fc56e7da66c6392315970f9e7e6d0'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
previous=s/'manifest.json'
if previous.exists():
 saved=json.loads(previous.read_text())
 valid=all(k in saved and saved[k]['returncode']==0 and Path(saved[k]['path']).exists() and sha(Path(saved[k]['path']))==saved[k]['sha256'] and sha(s/k/'propagator/sgp4-xp/src/fit.hpp')==saved[k]['fitSha256'] for k in ['CONTROL','FIXED'])
 if valid and all(saved[k].get('sourceCommit')==commit for k in ['CONTROL','FIXED']):
  print('Reusing verified CONTROL and FIXED artifacts',flush=True);sys.exit(0)
paths=['propagator/sgp4-xp/'+p for p in ['src','build.mjs','engine-source.mjs','generate-sds-headers.mjs','join-ussf.mjs','wasm-sections.mjs','package.json','package-lock.json','plugin-manifest.json']]+['foundation/frames/src','foundation/frames/erfa-amalgamation.mjs']
archive=subprocess.check_output(['git','archive',commit,*paths],cwd=m)
for name in ['CONTROL','FIXED']:
 dest=s/name;p=dest/'propagator/sgp4-xp';dest.mkdir(parents=True,exist_ok=True)
 marker=dest/'source-commit'
 if not marker.exists():
  for link in [p/'node_modules',dest/'node_modules',dest/'foundation']:
   if link.is_symlink():link.unlink()
  with tarfile.open(fileobj=io.BytesIO(archive)) as t:t.extractall(dest,filter='data')
  if not (p/'third_party').exists():(p/'third_party').symlink_to(m/'propagator/sgp4-xp/third_party',target_is_directory=True)
  if not (dest/'higherpop').exists():(dest/'higherpop').symlink_to(m/'higherpop',target_is_directory=True)
  if name=='FIXED':
   f=p/'src/fit.hpp';x=f.read_text();assert 'if (xp_) active.push_back(7);' in x;f.write_text(x.replace('if (xp_) active.push_back(7);','/* AGOM held at zero seed */'))
  marker.write_text(commit+'\n')
 if not (p/'node_modules').exists():
  with (dest/'deps.log').open('w') as log:
   rc=subprocess.run(['node','/Users/tj/software/spacedatanetwork-stack/tools/deps-bundle/deps-bundle.mjs','attach',str(p)],stdout=log,stderr=subprocess.STDOUT).returncode
  if rc:raise SystemExit('dependency attachment failed: '+str(dest/'deps.log'))
 temp=dest/'tmp';temp.mkdir(exist_ok=True)
 with (dest/'build.log').open('w') as log:rc=subprocess.run(['node','build.mjs'],cwd=p,env=dict(os.environ,TMPDIR=str(temp)),stdout=log,stderr=subprocess.STDOUT).returncode
 wasm=p/'dist/isomorphic/module.wasm';manifest[name]={'sourceCommit':commit,'returncode':rc,'path':str(wasm),'sha256':sha(wasm) if wasm.exists() else None,'fitSha256':sha(p/'src/fit.hpp')}
 (s/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(name,rc,flush=True)
 if rc:break
 if name=='CONTROL' and manifest[name]['sha256']!=sha(m/'propagator/sgp4-xp/dist/isomorphic/module.wasm'):
  manifest[name]['controlMismatch']=True;(s/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('CONTROL differs from prescribed wasm; retain a separate numerical rebuild control',flush=True)
