// Counts-only reader for one NEW capture cycle (E13b amendment A4). It prints counts and labels, never a state or a covariance value, and it
// refuses a cycle that started before the installed release: past cycles are never opened.
//   node count-cycle.mjs <cycle-id>        (OPERATOR_CAPTURE_ROOT names the capture root)
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {sidecarCounts} from './sidecar.mjs';

const tally=values=>Object.fromEntries([...values.reduce((m,v)=>m.set(v,(m.get(v)??0)+1),new Map())].sort((a,b)=>a[0]-b[0]));
const median=values=>values.length?[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]:null;
export function countCycle(captureRoot,id){
  const installedUtc=JSON.parse(fs.readFileSync(path.join(captureRoot,'_collector','active.json'))).registration?.installedUtc;
  const started=Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/,'T$1:$2:$3.$4Z'));
  if(!(started>=Date.parse(installedUtc)))throw new Error(`refused: cycle ${id} did not start after the installed release (${installedUtc??'unrecorded'}); past cycles are never read`);
  const dir=path.join(captureRoot,'cycles',id),names=fs.readdirSync(dir);
  const ids=pattern=>new Set(names.filter(n=>pattern.test(n)).map(n=>n.split('.')[0]));
  const json=ids(/^\d+\.json\.gz$/),ocm=ids(/^\d+\.ocm$/),paired=[...json].filter(n=>ocm.has(n));
  const counts=[...ocm].map(n=>sidecarCounts(fs.readFileSync(path.join(dir,n+'.ocm')))),hours=counts.map(c=>c.hours);
  const samples=[...json].map(n=>JSON.parse(gunzipSync(fs.readFileSync(path.join(dir,n+'.json.gz')))).samples.length);
  const summary=JSON.parse(fs.readFileSync(path.join(dir,'summary.json')));
  return {cycle:id,files:{json:json.size,sidecars:ocm.size,paired:paired.length,jsonOnly:json.size-paired.length,sidecarOnly:ocm.size-paired.length},
    recordsPerFile:{sidecarStates:tally(counts.map(c=>c.states)),registeredSamples:tally(samples)},
    covariancePerState:tally(counts.map(c=>c.covariancePerState)),
    hoursRetained:{min:Math.min(...hours),median:median(hours),max:Math.max(...hours),filesBelow16:hours.filter(h=>h<16).length},
    labels:{covFrame:tally(counts.map(c=>c.covFrame)),covOrdering:tally(counts.map(c=>c.covOrdering)),trajFrame:tally(counts.map(c=>c.trajFrame)),identifier:tally(counts.map(c=>c.identifier))},
    ledger:Object.fromEntries(['status','listed','files','failures','sidecars','sidecarFailures','limit'].map(k=>[k,summary[k]??null]))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
  const id=process.argv[2];if(!id)throw new Error('usage: node count-cycle.mjs <cycle-id>');
  console.log(JSON.stringify(countCycle(process.env.OPERATOR_CAPTURE_ROOT??'/opt/data/sdn-archive/operator-capture',id),null,1));
}
