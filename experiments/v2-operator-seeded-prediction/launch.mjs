// Retained process: align the first prospective cycle to UTC 00/08/16.
// The commissioning E2E runs collect.mjs --once separately.
import fs from 'node:fs';
import path from 'node:path';
import {store,write,iso,sleep} from './common.mjs';
const first=Date.parse(process.argv[2]);
if(!Number.isFinite(first))throw new Error('UTC first-cycle instant required');
const pidFile=path.join(store,'collector.pid'),statusFile=path.join(store,'collector.status.json');
if(fs.existsSync(pidFile)) {
  const pid=+fs.readFileSync(pidFile,'utf8');
  try{process.kill(pid,0);throw new Error(`collector already live PID ${pid}`);}catch(e){if(e.code!=='ESRCH')throw e;fs.unlinkSync(pidFile);}
}
fs.writeFileSync(pidFile,String(process.pid),{flag:'wx'});
let stop=false;const stopping=()=>{stop=true;};
process.on('SIGTERM',stopping);process.on('SIGINT',stopping);
try {
  write(statusFile,{state:'scheduled',pid:process.pid,firstCycleUtc:iso(first),startedUtc:iso(Date.now())});
  fs.appendFileSync(path.join(store,'collector.log'),`${iso(Date.now())} scheduled PID ${process.pid} first cycle ${iso(first)}\n`);
  while(Date.now()<first&&!stop&&!fs.existsSync(path.join(store,'collector.stop')))await sleep(Math.min(30000,first-Date.now()));
}finally{
  process.off('SIGTERM',stopping);process.off('SIGINT',stopping);
  if(fs.existsSync(pidFile)&&+fs.readFileSync(pidFile,'utf8')===process.pid)fs.unlinkSync(pidFile);
}
if(!stop&&!fs.existsSync(path.join(store,'collector.stop')))await import('./collect.mjs');
else write(statusFile,{state:'stopped-before-first-cycle',pid:process.pid,at:iso(Date.now())});
