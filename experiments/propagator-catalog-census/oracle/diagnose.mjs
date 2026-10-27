// Diagnose every strict >1 m result using the already-published conformance
// classifications. Raw strict exceedances and accuracy results stay unchanged.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {read,write,sha,hashFile,outputDir,settings,iso} from './common.mjs';
const {values}=parseArgs({options:{modules:{type:'string'},oracle:{type:'string'}}});
if(!values.modules||!values.oracle)throw Error('--modules and --oracle required');
process.env.SDN_AP_ORACLE_WASM_DIR=path.join(values.modules,'propagator/sgp4-xp/third_party/ussf-sgp4');
const imported=file=>import(pathToFileURL(file).href);
const {openModule}=await imported(path.join(values.modules,'propagator/sdn-ap/test/lib/module.mjs'));
const {elementsOf}=await imported(path.join(values.modules,'propagator/sdn-ap/test/lib/tle.mjs'));
const {openOracle}=await imported(path.join(values.oracle,'oracle.mjs'));
const module=await openModule(),first=await openOracle({version:settings.oracleVersion}),second=await openOracle({version:'9.1.1.0'});
const distance=(a,b)=>1000*Math.hypot(...a.map((x,i)=>x-b[i]));
const ok=s=>s&&s.error===0&&[...s.r,...s.v].every(Number.isFinite);
const sourceHash=hashFile(new URL(import.meta.url)),manifest=read(path.join(outputDir,'manifest.json'));
try{
  let analyzed=0;
  for(const file of fs.readdirSync(path.join(outputDir,'outcomes')).filter(f=>f.endsWith('.json')).sort()){
    const outcome=read(path.join(outputDir,'outcomes',file));if(!outcome.agreement?.exceedances.length)continue;
    const input=read(path.join(outputDir,'inputs',file));
    if(input.extensionId!==manifest.extensionId||outcome.extensionId!==manifest.extensionId)throw Error('Foreign diagnostic input');
    const inputHash=sha(JSON.stringify(input)),destination=path.join(outputDir,'diagnostics',file);
    if(fs.existsSync(destination)){
      const previous=read(destination);if(previous.sourceHash!==sourceHash||previous.inputHash!==inputHash)throw Error('Changed diagnostic source/input');
      analyzed++;continue;
    }
    const reference=await first.propagate(input.lines,input.minutes),alternate=await second.propagate(input.lines,input.minutes),elements=elementsOf(input.lines),runs={};
    for(const [name,policy,dragFree] of [['nominal',0,false],['shadowA',1,false],['shadowB',2,false],['dragFree',0,true]]){
      module.x.sdnap_shadow_policy(policy);module.init([{...elements,...(dragFree?{bterm:0}:{})}]);
      runs[name]=input.minutes.map(t=>{const s=module.atMinutes([t]);return{error:s.status[0],r:[s.x[0],s.y[0],s.z[0]],v:[s.vx[0],s.vy[0],s.vz[0]]};});
    }
    const heavy=input.minutes.some((t,i)=>!ok(reference?.[i])||!ok(runs.nominal[i])||
      (ok(runs.dragFree[i])&&distance(runs.nominal[i].r,runs.dragFree[i].r)>1e6));
    const rows=outcome.agreement.exceedances.map(({index:i,epoch,distanceM})=>{
      const n=runs.nominal[i],a=runs.shadowA[i],b=runs.shadowB[i],d=runs.dragFree[i],r=reference?.[i],s=alternate?.[i];
      if(!ok(n)||!ok(r))return{index:i,epoch,status:'reference_replay_unavailable'};
      const actual=distance(n.r,r.r);
      if(Math.abs(actual-distanceM)>Math.max(1e-6,1e-12*distanceM))throw Error('Strict difference failed deterministic replay');
      const dragDisplacementM=ok(d)?distance(n.r,d.r):null;
      const shadowWidthM=ok(a)&&ok(b)?distance(a.r,b.r):null;
      const inside=ok(a)&&ok(b)&&r.r.every((x,k)=>x>=Math.min(a.r[k],b.r[k])-.001&&x<=Math.max(a.r[k],b.r[k])+.001);
      const alternateDifferenceM=ok(s)?distance(n.r,s.r):null;
      const classification=heavy&&dragDisplacementM!==null&&actual<=1e-4*dragDisplacementM?'published-heavy-drag-class':
        shadowWidthM>0&&(inside||actual<=shadowWidthM)?'published-rounding-limited-shadow-class':
        alternateDifferenceM!==null&&alternateDifferenceM<=1?'published-reference-build-split':'unexplained-strict-exceedance';
      return{index:i,epoch,strictDifferenceM:actual,classification,dragDisplacementM,shadowWidthM,insideShadowEnvelope:inside,
        alternateDifferenceM,referenceBuildDifferenceM:ok(s)?distance(r.r,s.r):null};
    });
    write(destination,{key:outcome.key,lineage:outcome.lineage,extensionId:manifest.extensionId,inputHash,sourceHash,
      criterionSource:'propagator/sdn-ap/test/conformance.e2e.mjs at cb22348f2c674e8920716af09f7ca2a6a87f5f28',
      oracleVersions:[settings.oracleVersion,'9.1.1.0'],rows,createdUtc:iso(Date.now()),strictExceedancesRemainReported:true});
    analyzed++;
  }
  console.log(JSON.stringify({analyzed,extensionId:manifest.extensionId,sourceHash}));
}finally{await first.close();await second.close();module.destroy();await module.harness.destroy?.();}
