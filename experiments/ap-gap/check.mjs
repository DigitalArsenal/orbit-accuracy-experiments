import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const config=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url)));
const root='/opt/data/sdn-archive/operator-theory/ap-gap';
const files=fs.readdirSync(root,{recursive:true}).filter(p=>/rows-\d+\.jsonl$/.test(p));
let rows=0,excluded=0,fixedArms=0,maxFixedAgom=0;
for(const file of files) for(const line of fs.readFileSync(path.join(root,file),'utf8').split('\n').filter(Boolean)) {
 const r=JSON.parse(line);rows++;
 for(const [name,a] of Object.entries(r.arms??{}))if(name.includes('FIXED')&&a.ok){if(!Number.isFinite(a.agom))throw new Error('missing fixed AGOM');fixedArms++;maxFixedAgom=Math.max(maxFixedAgom,Math.abs(a.agom));}
 if(config.EXCLUDE_NORADS.includes(Number(r.norad))||new RegExp(config.EXCLUDE_NAME_PATTERN,'i').test(r.name??''))excluded++;
}
if(excluded)throw new Error(`${excluded} excluded rows`);
const errors=[];
for(const trial of [1,2]) {
 const out=path.join(root,`check-${Date.now()}-${trial}`);
 const run=spawnSync(process.execPath,['experiments/ap-gap/ablate.mjs','--wasm',config.baselineWasm,'--out',out,'--groups','GD','--key','GD|LAGEOS 1|2025-10-11','--arm','AP'],{encoding:'utf8',timeout:180000});
 if(run.status!==0)throw new Error(`repeat failed: ${run.stderr}`);
 const r=JSON.parse(fs.readFileSync(path.join(out,'rows-0.jsonl'),'utf8').trim());
 const e=r.arms.AP72?.days?.[3]?.e*1000;
 if(!Number.isFinite(e))throw new Error('no finite forward day-3 error');errors.push(e);
}
const repeatDeltaM=Math.abs(errors[0]-errors[1]);
const status=JSON.parse(fs.readFileSync(new URL('../../results/ap-gap/status.json',import.meta.url)));
const result={rows,excludedRows:excluded,fixedArms,maxFixedAgom,forwardDay3M:errors,repeatDeltaM,repeatToleranceM:0.001,methodsComplete:status.methodsComplete,methodsRequired:5};
fs.writeFileSync(path.join(root,'check-result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(repeatDeltaM>0.001||maxFixedAgom>1e-15||status.methodsComplete!==5){console.error('FAIL: repeatability or full methods coverage incomplete');process.exitCode=1;}
