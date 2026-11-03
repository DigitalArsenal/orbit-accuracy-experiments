"""Pinned native FFM subtractions; source copies and binaries stay in scratch."""
from pathlib import Path
import subprocess,shutil,hashlib,json,os,tarfile,io,concurrent.futures,re
modules=Path('/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules')
scratch=Path('/Users/tj/software/terrain-work/body-look/codex-apgap-d9/ffm-variants');scratch.mkdir(exist_ok=True)
commit='9a05d899b95242b358939ab1d68a776170a6b167'
paths=['propagator/ffm','foundation/frames','higherpop/third_party/erfa','third_party/hwm14','third_party/nrlmsise00','scripts/lib','scripts/emsdk-pin.json']
base=scratch/'source'
if not base.exists():
 base.mkdir();data=subprocess.check_output(['git','archive',commit,*paths],cwd=modules)
 with tarfile.open(fileobj=io.BytesIO(data)) as archive:archive.extractall(base,filter='data')
def build(name):
 dest=scratch/name;p=dest/'propagator/ffm'
 if not dest.exists():
  shutil.copytree(base,dest)
  (p/'node_modules').symlink_to(modules/'propagator/ffm/node_modules',target_is_directory=True)
  (dest/'node_modules').symlink_to(modules/'node_modules',target_is_directory=True)
  if name=='NO_SHADOW':
   f=p/'lib/shadow.h';s=f.read_text();needle='double sunRadius = SUN_RADIUS_KM) {';assert s.count(needle)==1
   f.write_text(s.replace(needle,needle+'\n    return S(1.0); // registered shadow-only subtraction'))
  if name=='ZONAL20':
   f=p/'lib/egm2008_data.h';s=f.read_text();count=[0]
   def replace(m):
    if int(m[1])<=20:return m[0]
    count[0]+=1;return '{ '+m[1]+', 0, 0.0, 0.0}'
   s=re.sub(r'\{\s*(\d+),\s*0,\s*[^,{}]+,\s*[^,{}]+\}',replace,s);assert count[0]==50,count
   f.write_text(s)
 manifest_file=scratch/(name+'.json');wasm=p/'dist/isomorphic/module.wasm'
 with (dest/'build.log').open('w') as log:
  rc=subprocess.run(['node','build.mjs'],cwd=p,env=os.environ,stdout=log,stderr=subprocess.STDOUT).returncode
 changed={str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in (p/'lib').glob('*') if f.is_file() and (base/'propagator/ffm'/f.relative_to(p)).is_file() and f.read_bytes()!=(base/'propagator/ffm'/f.relative_to(p)).read_bytes()}
 item={'sourceCommit':commit,'returncode':rc,'path':str(wasm),'sha256':hashlib.sha256(wasm.read_bytes()).hexdigest() if rc==0 else None,'changedSources':changed}
 manifest_file.write_text(json.dumps(item,indent=2)+'\n');print(name,rc,item['sha256'],flush=True);return name,item
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:manifest=dict(pool.map(build,['CONTROL','NO_SHADOW','ZONAL20']))
(scratch/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
