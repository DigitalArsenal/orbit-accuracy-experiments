// Evidence/accounting verification is distinct from the scientific verdict.
// A reproduced strict discrepancy stays a discrepancy, never a numerical pass.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {wire} from '../../propagator-published-truth/wire.mjs';
import {loadArc} from '../arcs.mjs';
import {outcomeFile} from '../run.mjs';
import {aggregate} from './report.mjs';
import {openEngines} from './engine.mjs';
import {root,read,write,hashFile,settings,sourceDir,outputDir,registration} from './common.mjs';
const {values}=parseArgs({options:{modules:{type:'string'},oracle:{type:'string'}}});
if(!values.modules||!values.oracle)throw Error('--modules and --oracle required');
const identity=registration(values.modules,values.oracle),manifest=read(path.join(outputDir,'manifest.json'));
assert.equal(identity.extensionId,manifest.extensionId,'extension source/input provenance');
const actual=aggregate(),published=read(path.join(root,'results/propagator-catalog-census/oracle/summary.json'));
assert.deepEqual(actual,published,'reproduced aggregate differs');
assert.ok(actual.completeAvailableExtension,'incomplete extension accounting');
assert.equal(actual.counts.sourceObjects,57413,'frozen denominator');
const census=read(path.join(sourceDir,'census.json')),representatives=new Map();let unresolved=0,strict=0;
for(const object of census.objects){
  const file=outcomeFile(outputDir,object.key),out=read(file);
  assert.ok(out.finishedUtc,`unfinished ${object.key}`);
  if(!out.agreement)continue;
  assert.ok(out.geometryVerification?.passed,'native geometry contract not checked');
  assert.equal(out.referenceCovariance,'unavailable');
  const inputFile=path.join(outputDir,'inputs',path.basename(file)),input=read(inputFile);
  assert.equal(input.extensionId,identity.extensionId);assert.equal(input.key,object.key);
  assert.deepEqual(input.lines,out.input.lines);assert.deepEqual(input.minutes,out.input.minutes);
  assert.equal(out.scoreSamples,input.minutes.length);
  for(const [name,arm] of Object.entries(out.arms)){
    assert.equal(arm.ok,out.failures[name].length===0,`failure accounting ${object.key}`);
    if(arm.ok)for(const day of Object.values(arm.days))assert.equal(day.covarianceStatus,'unavailable');
  }
  strict+=out.agreement.exceedances.length;
  if(out.agreement.exceedances.length){
    const diagnostic=read(path.join(outputDir,'diagnostics',path.basename(file)));
    assert.equal(diagnostic.rows.length,out.agreement.exceedances.length);
    assert.ok(diagnostic.strictExceedancesRemainReported);
    unresolved+=diagnostic.rows.filter(r=>r.classification==='unexplained-strict-exceedance'||!r.classification).length;
  }
  if(!representatives.has(object.lineage))representatives.set(object.lineage,{object,out});
}
const W=await wire(values.modules),engines=await openEngines(values.modules,values.oracle,W),replayed=[];
try{
  await engines.verifyGeometry();
  for(const {object,out} of representatives.values()){
    const prior=read(outcomeFile(sourceDir,object.key)),arc=loadArc(object,census,prior.selection,W);
    const fresh=await engines.compare(object,arc,prior.arms['xp-native'],()=>{});
    for(const key of ['arms','failures','agreement','fit','input','referenceCovariance'])assert.deepEqual(fresh[key],out[key],`${object.lineage} reference replay ${key}`);
    replayed.push({lineage:object.lineage,outcomeSha256:hashFile(outcomeFile(outputDir,object.key))});
  }
}finally{await engines.close();}
const result={extensionId:identity.extensionId,completeAccounting:true,aggregateReproduced:true,replayed,
  strictExceedingSamples:strict,unexplainedStrictExceedingSamples:unresolved,
  strictConformanceVerdict:strict?'STRICT_EXCEEDANCES_RETAINED':'WITHIN_REGISTERED_BOUND',
  completeCatalog:false,covarianceCalibration:'NOT_ESTABLISHED_BY_THIS_EXTENSION'};
write(path.join(outputDir,'verification.json'),result);console.log(JSON.stringify(result));
