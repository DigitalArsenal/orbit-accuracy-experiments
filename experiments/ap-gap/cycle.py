"""Run bounded batches in registered order, preserving partial output."""
import subprocess, os, json, time
from pathlib import Path
root=Path('/opt/data/sdn-archive/operator-theory/ap-gap')
env=dict(os.environ,SDN_MODULES_ROOT='/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules')
base='/opt/data/sdn-archive/operator-theory/ap/b040/module.wasm'
def batch(label,groups,method='ap',arm=None,wasm=base,extra=None):
 out=root/label;out.mkdir(exist_ok=True);ps=[]
 for k in range(12):
  cmd=['node','--max-old-space-size=3072','experiments/ap-gap/ablate.mjs','--wasm',wasm,'--out',str(out),'--groups',groups,'--method',method,'--shard',f'{k}/12']
  if arm:cmd+=['--arm',arm]
  if extra:cmd+=extra
  log=(out/f'worker-{k}.log').open('w');ps.append(subprocess.Popen(cmd,env=env,stdout=log,stderr=log))
 print(label,'PIDs',*[p.pid for p in ps],flush=True)
 print(label,'exits',[p.wait() for p in ps],flush=True)
 if time.time()>1793677729:raise SystemExit('registered time box')
if __name__=='__main__':
 batch('resume-heo','HX,HE')
 subprocess.run(['python3','experiments/ap-gap/build-variants.py'],check=True)
 manifest=json.loads(Path('/Users/tj/software/terrain-work/body-look/codex-apgap-d9/variants/manifest.json').read_text())
 for name,v in manifest.items():
  if name!='AGOM_FIXED' and v['returncode']==0:batch('resume-'+name,'GD,IG,GE,LS,DO,HX,HE',arm='AP',wasm=v['path'])
 batch('resume-ffm','GD,IG,GE,LS,DO,HX,HE',method='ffm')
 subprocess.run(['python3','experiments/ap-gap/build-ussf.py'],check=True)
 u=json.loads(Path('/Users/tj/software/terrain-work/body-look/codex-apgap-d9/ussf/manifest.json').read_text())
 extra=['--ap-fixed',manifest['AGOM_FIXED']['path']] if manifest.get('AGOM_FIXED',{}).get('returncode')==0 else []
 if u.get('FIXED',{}).get('returncode')==0:extra+=['--ussf-fixed',u['FIXED']['path']]
 batch('resume-gn','GN',method='gn',extra=extra)
 batch('resume-frame','GN,IG,GE',arm='FRAME,RESONANCE')
 subprocess.run(['node','experiments/ap-gap/events.mjs'],env=env,check=True)
