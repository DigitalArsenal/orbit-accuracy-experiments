"""Finite completion of the preregistered individual-body FFM subtractions."""
from pathlib import Path
import json,subprocess,os,hashlib,concurrent.futures,time,datetime,shutil
root=Path('/opt/data/sdn-archive/operator-theory/ap-gap');out=root/'resume-ffm';work=root/'ffm-bodies-resume3';work.mkdir(exist_ok=True)
deadline=datetime.datetime.fromisoformat('2026-11-03T04:30:00+00:00').timestamp()
files=list(out.glob('rows-*.jsonl')); original={f:[json.loads(l) for l in f.read_text().splitlines()] for f in files}
pending=[r for rows in original.values() for r in rows if not r.get('error') and ('NO_SUN72' not in r['arms'] or 'NO_MOON72' not in r['arms'])]
(work/'queue.json').write_text(json.dumps([{'key':r['key'],'group':r['group']} for r in pending],indent=2)+'\n')
backup=work/'before';backup.mkdir(exist_ok=True)
for f in files:shutil.copyfile(f,backup/f.name)
env=dict(os.environ,SDN_MODULES_ROOT='/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules')
def run(item):
 i,r=item
 if time.time()>=deadline:return None
 d=work/str(i);d.mkdir(exist_ok=True)
 cmd=['node','--max-old-space-size=3072','experiments/ap-gap/ablate.mjs','--wasm','/opt/data/sdn-archive/operator-theory/ap/b040/module.wasm','--method','ffm','--arm','NO_SUN,NO_MOON','--groups',r['group'],'--key',r['key'],'--out',str(d)]
 with (d/'worker.log').open('w') as log:
  p=subprocess.Popen(cmd,env=env,stdout=log,stderr=log);print('body',i,'PID',p.pid,flush=True)
  try:rc=p.wait(timeout=max(1,deadline-time.time()))
  except subprocess.TimeoutExpired:
   p.terminate()
   try:p.wait(timeout=3)
   except subprocess.TimeoutExpired:p.kill();p.wait()
   return None
 f=d/'rows-0.jsonl'
 if rc or not f.exists():return None
 row=json.loads(f.read_text().strip());assert row['key']==r['key']
 return i,row,d
index=[];completed={}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for result in pool.map(run,enumerate(pending)):
  if result is None:continue
  i,r,d=result;completed[r['key']]=r
  for mf in d.glob('manifest-*.json'):shutil.copyfile(mf,out/f'bodies-resume3-{i}-{mf.name}')
  if (d/'inputs-0.json').exists():shutil.copyfile(d/'inputs-0.json',out/f'inputs-{2000+i}.json')
  index.append({'key':r['key'],'path':str(d/'rows-0.jsonl'),'sha256':hashlib.sha256((d/'rows-0.jsonl').read_bytes()).hexdigest()})
  (work/'completion.json').write_text(json.dumps(index,indent=2)+'\n')
  print('completed',len(index),'of',len(pending),flush=True)
for f,rows in original.items():
 for r in rows:
  if r['key'] in completed:
   for arm,a in completed[r['key']]['arms'].items():
    assert arm not in r['arms'];r['arms'][arm]=a
 f.write_text(''.join(json.dumps(r,separators=(',',':'))+'\n' for r in rows))
print('merged',len(completed),'of',len(pending),flush=True)
