"""One bounded batch; children never launch replacement workers."""
from pathlib import Path
import subprocess,os,json,sys,datetime,time
label,workers,*extra=sys.argv[1:];workers=int(workers);assert 1<=workers<=12
out=Path('/opt/data/sdn-archive/operator-theory/ap-gap')/label;out.mkdir(exist_ok=True)
env=dict(os.environ,SDN_MODULES_ROOT='/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules')
deadline=datetime.datetime.fromisoformat(json.loads(Path('experiments/ap-gap/resume-config.json').read_text())['deadline'].replace('Z','+00:00')).timestamp()-180
ps=[]
for k in range(workers):
 cmd=['node','--max-old-space-size=3072','experiments/ap-gap/ablate.mjs','--out',str(out),'--shard',f'{k}/{workers}',*extra]
 log=(out/f'worker-{k}.log').open('w');ps.append(subprocess.Popen(cmd,env=env,stdout=log,stderr=log))
print(label,'PIDs',*[p.pid for p in ps],flush=True)
for p in ps:
 try:p.wait(timeout=max(1,deadline-time.time()))
 except subprocess.TimeoutExpired:
  p.terminate()
  try:p.wait(timeout=3)
  except subprocess.TimeoutExpired:p.kill();p.wait()
result={'label':label,'pids':[p.pid for p in ps],'exits':[p.returncode for p in ps]}
(out/'batch-completion.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
if any(p.returncode for p in ps):sys.exit(1)
