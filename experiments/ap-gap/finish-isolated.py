"""Re-shard only unfinished isolated-force windows after the prior workers exit."""
from pathlib import Path
import subprocess,os,json,hashlib,shutil
root=Path('/opt/data/sdn-archive/operator-theory/ap-gap');original=root/'resume-ffm-isolated';tail=root/'ffm-isolated-tail';tail.mkdir(exist_ok=True)
files=sorted(original.glob('rows-*.jsonl'));done=[json.loads(l)['key'] for f in files for l in f.read_text().splitlines()];assert len(done)==len(set(done))
(tail/'skip.json').write_text(json.dumps(sorted(done),indent=2)+'\n')
backup=tail/'before';backup.mkdir(exist_ok=True)
for f in files:shutil.copyfile(f,backup/f.name)
cmd=['python3','experiments/ap-gap/run-batch.py','ffm-isolated-tail', '12','--wasm','/opt/data/sdn-archive/operator-theory/ap/b040/module.wasm','--method','ffm','--groups','GD,IG,GE,LS,DO,HX,HE','--arm','NO_SHADOW,ZONAL20','--isolated-ffm','/Users/tj/software/terrain-work/body-look/codex-apgap-d9/ffm-variants/manifest.json','--skip-keys',str(tail/'skip.json')]
rc=subprocess.run(cmd).returncode
new=[]
for f in sorted(tail.glob('rows-*.jsonl')):
 for l in f.read_text().splitlines():
  r=json.loads(l);assert r['key'] not in done;done.append(r['key']);new.append(r)
  shard=int(hashlib.sha256(r['key'].encode()).hexdigest()[:8],16)%3
  with (original/f'rows-{shard}.jsonl').open('a') as dst:dst.write(json.dumps(r,separators=(',',':'))+'\n')
for f in tail.glob('manifest-*.json'):shutil.copyfile(f,original/('tail-'+f.name))
for f in tail.glob('inputs-*.json'):shutil.copyfile(f,original/('inputs-'+str(3000+int(f.stem.split('-')[1]))+'.json'))
(tail/'merge.json').write_text(json.dumps({'priorWindows':len(done)-len(new),'addedWindows':len(new),'totalUniqueWindows':len(set(done)),'batchExit':rc},indent=2)+'\n')
print('merged',len(new),'total',len(done),flush=True)
if rc:raise SystemExit(rc)
