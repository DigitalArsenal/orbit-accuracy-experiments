"""Finish an explicit finite list of pending windows; no worker spawns workers."""
from pathlib import Path
import json,subprocess,os,hashlib,concurrent.futures,shutil
root=Path('/opt/data/sdn-archive/operator-theory/ap-gap');out=root/'resume-ffm'
def rows(d):return [json.loads(l) for f in (root/d).glob('rows-*.jsonl') for l in f.read_text().splitlines()]
done={r['key'] for r in rows('resume-ffm')}
pending=[r for r in rows('resume-CONTROL') if r['key'] not in done]
(root/'ffm-tail').mkdir(exist_ok=True)
(root/'ffm-tail/queue.json').write_text(json.dumps([{'key':r['key'],'group':r['group']} for r in pending],indent=2)+'\n')
env=dict(os.environ,SDN_MODULES_ROOT='/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules')
def run(item):
 i,r=item;d=root/'ffm-tail'/str(i);d.mkdir(exist_ok=True)
 cmd=['node','--max-old-space-size=3072','experiments/ap-gap/ablate.mjs','--wasm','/opt/data/sdn-archive/operator-theory/ap/b040/module.wasm','--method','ffm','--groups',r['group'],'--key',r['key'],'--out',str(d)]
 with (d/'worker.log').open('w') as log:
  p=subprocess.Popen(cmd,env=env,stdout=log,stderr=log);print('tail',i,'PID',p.pid,flush=True);rc=p.wait()
 return i,r,d,rc
index=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
 for i,r,d,rc in pool.map(run,enumerate(pending)):
  f=d/'rows-0.jsonl'
  if rc or not f.exists():raise RuntimeError(f'tail {i} failed ({rc})')
  row=json.loads(f.read_text().strip());assert row['key']==r['key']
  shard=int(hashlib.sha256(r['key'].encode()).hexdigest()[:8],16)%12
  with (out/f'rows-{shard}.jsonl').open('a') as target:target.write(json.dumps(row,separators=(',',':'))+'\n')
  for mf in d.glob('manifest-*.json'):shutil.copyfile(mf,out/f'tail-{i}-{mf.name}')
  shutil.copyfile(d/'inputs-0.json',out/f'inputs-{100+i}.json')
  index.append({'key':r['key'],'file':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'targetShard':shard})
  (out/'tail-index.json').write_text(json.dumps(index,indent=2)+'\n')
  print('merged',i,r['key'],flush=True)
print('completed tail',len(pending),flush=True)
