// Verify the complete retained fidelity run. The runner already compared every
// native output value against its source token; this check rehashes all source
// and output bytes and proves the full resource/state denominator independently.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,read,write,sha,sourceDir,outputDir,keyOf,bodyOf,hashFile} from './common.mjs';
import {unpackOem} from '../../supgp-omm/lib/records.mjs';
const dir=path.join(root,'runs/propagator-catalog-census/starlink-covariance-20261027');
const manifestFile=path.join(dir,'manifest.json'),manifest=read(manifestFile),progress=read(path.join(dir,'progress.json'));
assert.ok(!fs.existsSync(path.join(dir,'runner.lock')),'Fidelity batch still running');
assert.equal(manifest.preflight,false);assert.equal(progress.completeAvailablePopulation,true);
assert.equal(hashFile(path.join(sourceDir,'queue.json')),manifest.queueSha256);
for(const [file,h]of Object.entries(manifest.sourceHashes))assert.equal(hashFile(path.join(root,file)),h,`Pinned source ${file}`);
const all=read(path.join(sourceDir,'queue.json')).sources.find(s=>s.source_id==='spacex-starlink').resources;
assert.equal(all.length,manifest.population);assert.equal(all.length,progress.completed);
const totals={resources:0,sourceBytes:0,artifactBytes:0,states:0,covarianceRows:0,covarianceValues:0,stateValues:0},statuses={},hashes=[],failures=[];
for(const resource of all){
  const key=keyOf(resource),file=path.join(dir,'outcomes',key+'.json'),r=read(file),sourceFile=path.join(sourceDir,'outcomes',key+'.json');
  assert.equal(r.amendmentId,manifest.amendmentId);assert.deepEqual(r.resource,resource);assert.equal(r.inputReceiptSha256,hashFile(sourceFile));
  const receipt=read(sourceFile).receipt;assert.equal(r.rawSha256,receipt.sha256??null);
  hashes.push([key,hashFile(file)]);totals.resources++;statuses[r.status]=(statuses[r.status]??0)+1;
  if(receipt.state==='downloaded')totals.sourceBytes+=bodyOf(sourceDir,receipt).length;
  if(r.status==='exact_source_fidelity'){
    const bytes=bodyOf(dir,r.artifact),o=unpackOem(bytes);totals.artifactBytes+=bytes.length;
    assert.equal(o.EPHEMERIS_DATA_BLOCK.length,1);const b=o.EPHEMERIS_DATA_BLOCK[0];
    assert.equal(b.EPHEMERIS_DATA_LINES.length,r.states);assert.equal(b.COVARIANCE_MATRIX_LINES.length,r.covarianceRows);
    assert.equal(b.OBJECT.NORAD_CAT_ID,r.norad);assert.equal(b.REFERENCE_FRAME.NAME,r.frame);assert.equal(b.COV_REFERENCE_FRAME?.NAME??null,r.covarianceFrame);
    assert.equal(b.TIME_SYSTEM,11);assert.equal(b.EPHEMERIS_DATA_LINES[0].EPOCH,r.first);assert.equal(b.EPHEMERIS_DATA_LINES.at(-1).EPOCH,r.last);
    assert.equal(r.stateValues,6*r.states);assert.equal(r.covarianceValues,21*r.covarianceRows);
    // Independently retained raw native-inventory source count; no reliance on
    // the full fidelity runner's progress file or a uniform epoch grid.
    const old=read(path.join(outputDir,'outcomes',key+'.json'));
    assert.equal(old.rawSha256,r.rawSha256);assert.equal(old.blocks.reduce((n,x)=>n+x.states,0),r.states);
    for(const k of ['states','covarianceRows','covarianceValues','stateValues'])totals[k]+=r[k];
  }else failures.push({key,status:r.status,reason:r.reason??null});
  if(totals.resources%1000===0)console.log(JSON.stringify({verified:totals.resources,total:all.length}));
}
for(const [k,v]of Object.entries(progress.totals))assert.equal(totals[k],v);
assert.deepEqual(statuses,progress.statuses);
const result={schema:'starlink-native-source-fidelity-verification',status:failures.length?'FAILURES_RETAINED':'PASS_SOURCE_FIDELITY',completeAvailablePopulation:true,
  provenance:{amendmentId:manifest.amendmentId,manifestSha256:hashFile(manifestFile),moduleCommit:manifest.moduleCommit,moduleFiles:manifest.moduleFiles,
    sourceHashes:manifest.sourceHashes,verifierSha256:hashFile(new URL(import.meta.url)),outcomeHashesSha256:sha(JSON.stringify(hashes))},
  totals,statuses,failures,scientificValidation:{propagatorAccuracy:'NOT_EVALUATED_BY_THIS_CHECK',covarianceCalibration:'NOT_EVALUATED',collisionProbability:'NOT_EVALUATED'},
  limitations:['Every source value was checked by the pinned full runner. This verifier rehashes all source and output bytes and reconciles independent native-inventory counts.',
    'Source EME2000 states, UTC epochs and declared UVW covariance are preserved. Physical frame/covariance normalization and publication chronology remain separate admission requirements.',
    'Parser fidelity does not establish covariance realism, independent reference truth, or calibrated collision probability.']};
write(path.join(root,'results/propagator-catalog-census/normalization/starlink-fidelity.json'),result);
console.log(JSON.stringify({status:result.status,totals,statuses}));
