import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {wire} from '../../propagator-published-truth/wire.mjs';
import {loadArc} from '../arcs.mjs';
import {environment} from '../environment.mjs';
import {outcomeFile} from '../run.mjs';
import {openEngine} from './engine.mjs';
import {aggregate} from './report.mjs';
import {root,read,write,sha,hashFile,settings,sourceDir,outputDir,outcomePath,registration} from './common.mjs';
const {values}=parseArgs({options:{modules:{type:'string'},ffm:{type:'string'}}});
if(!values.modules||!values.ffm)throw Error('--modules and --ffm required');
const identity=registration(values.modules,values.ffm),manifest=read(path.join(outputDir,'manifest.json'));
assert.equal(identity.amendmentId,manifest.amendmentId);
const report=aggregate();assert.ok(report.completeAvailableArm);assert.equal(report.counts.sourceObjects,57413);
assert.deepEqual(report,read(path.join(root,'results/propagator-catalog-census/ffm-bounded/summary.json')));
const census=read(path.join(sourceDir,'census.json')),representatives=new Map(),classes=new Set(),lineages=new Set();let attempted=0,metadata=0;
for(const object of census.objects){
  const out=read(outcomePath(object.key)),prior=read(outcomeFile(sourceDir,object.key));assert.ok(out.finishedUtc);assert.equal(out.method??out.arm?.method??settings.arm,settings.arm);
  if(!out.arm){assert.equal(out.status,prior.status);assert.ok(!prior.arms?.ffm);metadata++;continue;}attempted++;
  assert.ok(prior.arms?.ffm,'Original admitted arc');
  if(out.fitSha256){const f=path.join(outputDir,'fits',sha(object.key).slice(0,32)+'.json');assert.equal(hashFile(f),out.fitSha256);const fit=read(f);
    if(out.arm.ok){assert.ok(fit.fit.converged&&!fit.failed&&!fit.stoppedBy);assert.ok(Number.isFinite(Date.parse(fit.epoch)));
      assert.ok([...fit.state,...fit.parameters,...fit.fit.covariance].every(Number.isFinite));assert.ok(fit.parameters.every(x=>x>=0));assert.ok(fit.fit.iterations<=settings.maximumIterations);
      assert.deepEqual(out.arm.fit.boundStatus,fit.fit.boundStatus);assert.equal(out.arm.fit.activeConstraint,fit.fit.boundStatus.some(x=>x!==0));}
  }else assert.ok(!out.arm.ok,'Success requires hashed fit provenance');
  if(out.arm.ok)for(const [day,d]of Object.entries(out.arm.days)){assert.ok(out.leads[day].available);assert.equal(d.samples,out.leads[day].samples);assert.ok(Number.isFinite(d.rmsM)&&d.rmsM>=0);assert.ok(d.ricRmsM.every(Number.isFinite));}
  const cls=`${prior.arms.ffm.ok?'success':prior.arms.ffm.reason} -> ${out.arm.ok?'success':out.arm.reason}`;
  if(!lineages.has(object.lineage)||!classes.has(cls))representatives.set(object.key,{object,out,prior});classes.add(cls);lineages.add(object.lineage);
}
assert.equal(attempted,11414);assert.equal(metadata,45999);
const W=await wire(values.modules),envFor=await environment({modules:values.modules,dir:sourceDir},W),engine=await openEngine(values.modules,values.ffm,W),replayed=[],seen=new Set();
try{for(const {object,out,prior}of representatives.values()){
  if(seen.has(object.key))continue;seen.add(object.key);const arc=loadArc(object,census,prior.selection,W);assert.equal(arc.status,'eligible');let fresh,product;
  try{fresh=await engine.predict(object,arc,envFor(arc),p=>{product=p;});}catch(e){fresh={ok:false,status:'fit_or_propagation_failed',method:settings.arm,reason:e.message};}
  if(out.fitSha256)assert.deepEqual(product,read(path.join(outputDir,'fits',sha(object.key).slice(0,32)+'.json')),'Deterministic fitted solution');
  const {timing:oldTime,...oldResult}=out.arm,{timing:newTime,...newResult}=fresh;assert.deepEqual(newResult,oldResult,`Native replay ${object.key}`);
  replayed.push({key:object.key,outcomeSha256:hashFile(outcomePath(object.key))});
}}finally{await engine.close();}
const result={amendmentId:identity.amendmentId,completeAccounting:true,aggregateReproduced:true,attempted,metadata,replayed,
  numericalOutcome:'Scientific failures and unavailable results retained; evidence verification is not an accuracy or calibration pass',completeCatalog:false};
write(path.join(outputDir,'verification.json'),result);console.log(JSON.stringify(result));
