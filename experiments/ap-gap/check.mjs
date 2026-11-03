import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {coverage,quadrature} from './coverage.mjs';
const config=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url)));
const root='/opt/data/sdn-archive/operator-theory/ap-gap';
const results=new URL('../../results/ap-gap/',import.meta.url);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const files=fs.readdirSync(root,{recursive:true}).filter(p=>/rows-\d+\.jsonl$/.test(p));
let rows=0,excluded=0,fixedArms=0,maxFixedAgom=0,maxURebuildDeltaM=0;
const all=[];
for(const file of files)for(const line of fs.readFileSync(path.join(root,file),'utf8').split('\n').filter(Boolean)){
 const r=JSON.parse(line);rows++;
 if(/^resume-[^/]+\/rows-\d+\.jsonl$/.test(file))all.push({...r,batch:file.split('/')[0]});
 for(const [name,a] of Object.entries(r.arms??{})){
  if(name==='U_REBUILT24'&&a.ok)maxURebuildDeltaM=Math.max(maxURebuildDeltaM,a.rebuildDeltaM??Infinity);
  if(name.includes('FIXED')&&a.ok){assert(Number.isFinite(a.agom),'missing fixed AGOM');fixedArms++;maxFixedAgom=Math.max(maxFixedAgom,Math.abs(a.agom));}
 }
 if(config.EXCLUDE_NORADS.includes(Number(r.norad))||new RegExp(config.EXCLUDE_NAME_PATTERN,'i').test(r.name??''))excluded++;
}
assert(excluded===0,`${excluded} excluded rows`);
assert(hash(config.baselineWasm)===config.baselineSha256,'AP baseline changed');
const status=JSON.parse(fs.readFileSync(new URL('status.json',results)));
const events=JSON.parse(fs.readFileSync(path.join(root,'events/labels.json')));
const measured=coverage(all,events);
assert(JSON.stringify(measured.methodStatus)===JSON.stringify(status.methodStatus),'coverage claims disagree with raw attempts');
assert(JSON.stringify(quadrature(all))===JSON.stringify(status.quadrature),'quadrature claim disagrees');
assert(measured.methodsComplete===status.methodsComplete,'completion count disagrees');
assert(measured.methodsComplete===5||status.missing.length>0,'partial coverage must state missing work');
for(const f of status.rowFiles)assert(hash(f.path)===f.sha256,'aggregate row hash changed: '+f.path);
for(const f of status.inputManifests)assert(hash(f.path)===f.sha256,'input manifest changed: '+f.path);
assert(hash(status.provenance.eventLabels.path)===status.provenance.eventLabels.sha256,'event labels changed');
for(const f of status.provenance.files)assert(hash(f.path)===f.sha256,'report source changed: '+f.path);
const ffm=JSON.parse(fs.readFileSync(new URL('ffm-builds.json',results))).variants;
const heo=JSON.parse(fs.readFileSync(new URL('heo-heap-builds.json',results))).variants;
for(const v of [...Object.values(ffm),...Object.values(heo)])assert(v.returncode===0&&hash(v.path)===v.sha256,'variant artifact mismatch');
assert(ffm.CONTROL.sha256==='c36f1b14fc233e88725d57724c3bae7ad025cfdd9d8d4520c3bcccd0f8a816b2','FFM control differs from AP6');
const run=(label,key,options)=>{
 const out=path.join(root,`check-${Date.now()}-${label}`);
 const child=spawnSync(process.execPath,['experiments/ap-gap/ablate.mjs','--wasm',config.baselineWasm,'--out',out,'--groups',key.split('|')[0],'--key',key,...options],{encoding:'utf8',timeout:300000});
 assert(child.status===0,`${label} failed: ${child.stderr}`);
 const file=path.join(out,'rows-0.jsonl');assert(fs.existsSync(file),`${label} produced no row (including expired deadline)`);
 const parsed=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);assert(parsed.length===1&&parsed[0].key===key,'unexpected check rows');
 return parsed[0];
};
const baseline=[];
for(const trial of [1,2]){const r=run('baseline-'+trial,'GD|LAGEOS 1|2025-10-11',['--arm','AP']);const e=r.arms.AP72?.days?.[3]?.e*1000;assert(Number.isFinite(e),'nonfinite baseline forward error');baseline.push(e);}
const repeatDeltaM=Math.abs(baseline[0]-baseline[1]);
const reproduced=[];
const iso=all.filter(r=>r.batch==='resume-ffm-isolated');
for(const name of ['NO_SHADOW','ZONAL20']){
 const group=name==='NO_SHADOW'?'GD':'LS';
 const reference=iso.filter(r=>r.group===group&&Number.isFinite(r.arms[name+'72']?.days?.[3]?.e)).sort((a,b)=>a.key.localeCompare(b.key))[0];
 assert(reference,`no successful ${name} ${group} reference`);
 const r=run(name,reference.key,['--method','ffm','--arm',name,'--isolated-ffm','/Users/tj/software/terrain-work/body-look/codex-apgap-d9/ffm-variants/manifest.json']);
 const e=r.arms[name+'72']?.days?.[3]?.e*1000;assert(Number.isFinite(e),`nonfinite ${name} forward error`);
 reproduced.push({arm:name,key:reference.key,forwardDay3M:e,referenceDay3M:reference.arms[name+'72'].days[3].e*1000,deltaM:Math.abs(e-reference.arms[name+'72'].days[3].e*1000)});
}
for(const degree of [12,20]){
 const name='HEO'+degree,reference=all.find(r=>r.batch==='resume-'+name+'-heap'&&r.key==='HX|THEMIS A|2013-02-11');
 assert(Number.isFinite(reference?.arms.AP72?.days?.[3]?.e),`no ${name} finite reference`);
 const r=run(name,reference.key,['--wasm',heo[name+'_HEAP'].path,'--arm','AP']);
 const e=r.arms.AP72?.days?.[3]?.e*1000;assert(Number.isFinite(e),`nonfinite ${name} forward error`);
 reproduced.push({arm:name,key:reference.key,forwardDay3M:e,referenceDay3M:reference.arms.AP72.days[3].e*1000,deltaM:Math.abs(e-reference.arms.AP72.days[3].e*1000)});
}
const maxVariantRepeatDeltaM=Math.max(...reproduced.map(r=>r.deltaM));
assert(repeatDeltaM<=0.001&&maxVariantRepeatDeltaM<=0.001,'forward repeatability exceeds 0.001 m');
assert(fixedArms>0&&maxFixedAgom<=1e-15,'fixed AGOM check failed');
assert(maxURebuildDeltaM<=0.001,'Space Force rebuild control differs');
const result={verdict:'PASS_SCOPED',rows,excludedRows:excluded,fixedArms,maxFixedAgom,maxURebuildDeltaM,forwardDay3M:baseline,repeatDeltaM,repeatToleranceM:0.001,reproduced,maxVariantRepeatDeltaM,verifiedRowFiles:status.rowFiles.length,verifiedInputManifests:status.inputManifests.length,...measured,unresolvedGroups:status.diagnoses.filter(d=>d.cause==='Unresolved').map(d=>d.group),reason:'Numeric and provenance checks passed for the measured report. Coverage and unresolved physical causes are stated explicitly; this is not unread-window confirmation.'};
fs.writeFileSync(path.join(root,'check-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
