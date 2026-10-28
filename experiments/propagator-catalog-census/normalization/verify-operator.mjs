// Complete byte/epoch/source audit plus native replays. This verifies the
// normalization contract, not forecast accuracy or covariance calibration.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {unpackOem} from '../../supgp-omm/lib/records.mjs';
import {explicitBlock,selection,openOperatorNative} from './operator-native.mjs';
import {root,read,write,sha,outputDir,keyOf,bodyOf,hashFile,dir,starDir,sp3Dir,resourceList,outcomePath,registration} from './operator-common.mjs';
const {values}=parseArgs({options:{modules:{type:'string'}}});if(!values.modules)throw Error('--modules required');
const identity=registration(values.modules);assert.equal(read(path.join(dir,'manifest.json')).physicalId,identity.physicalId);
assert.equal(read(path.join(dir,'progress.json')).completeResources,true);
const epoch=s=>Date.parse(/[zZ]$/.test(s)?s:s+'Z'),all=resourceList(),hashes=[],sources={},replay=[],seen=new Set();
let resources=0,states=0,covariances=0,covarianceComponents=0;
for(const r of all){
  const key=keyOf(r),file=outcomePath(r),out=read(file),inventoryFile=path.join(outputDir,'outcomes',key+'.json'),inventory=read(inventoryFile);
  assert.equal(out.physicalId,identity.physicalId);assert.deepEqual(out.resource,r);assert.equal(out.inventorySha256,hashFile(inventoryFile));assert.equal(out.rawSha256,inventory.rawSha256);assert.ok(out.finishedUtc);
  hashes.push([key,hashFile(file)]);const source=sources[r.SOURCE_ID]??={resources:0,statuses:{},objects:{},states:0,covariances:0,covarianceStatuses:{},fitAvailable:0,leads:{1:0,3:0,7:0},unresolvedIdentity:0,provisionalIdentity:0};source.resources++;source.statuses[out.status]=(source.statuses[out.status]??0)+1;
  if(out.objects?.length){
    let artifact=inventory.artifacts.find(a=>a.portId!=='descriptor'),sourceDirectory=outputDir;
    if(r.FORMAT==='starlink-meme'){const sfile=path.join(starDir,'outcomes',key+'.json'),s=read(sfile);assert.equal(out.correctedSourceOutcomeSha256,hashFile(sfile));assert.equal(s.rawSha256,out.rawSha256);artifact=s.artifact;sourceDirectory=starDir;}
    assert.equal(out.sourceArtifactSha256,artifact.sha256);const oem=unpackOem(bodyOf(sourceDirectory,artifact));assert.equal(out.objects.length,oem.EPHEMERIS_DATA_BLOCK.length);
    for(const object of out.objects){
      source.objects[object.status]=(source.objects[object.status]??0)+1;if(!(object.identity?.norad>0))source.unresolvedIdentity++;
      if(object.identity?.status==='operator_crosswalk_unverified')source.provisionalIdentity++;
      const block=explicitBlock(oem.EPHEMERIS_DATA_BLOCK[object.index]);assert.equal(block.EPHEMERIS_DATA_LINES.length,object.sourceStates);
      if(!object.selection){assert.equal(object.status,'physical_conversion_failed');continue;}
      const expected=selection(block);assert.deepEqual(object.selection,expected);if(expected.fitAvailable)source.fitAvailable++;
      for(const d of [1,3,7])if(expected.leads[d].available)source.leads[d]++;
      const a=JSON.parse(bodyOf(dir,object.artifact));assert.equal(a.frame,'GCRF');assert.equal(a.timeSystem,'UTC');assert.equal(a.positionUnits,'km');assert.equal(a.velocityUnits,'km/s');
      assert.equal(a.states.length,object.convertedStates);assert.equal(object.failedStates,object.failures.length);
      const accounted=[...a.states.map(x=>x.sourceIndex),...object.failures.map(x=>x.sourceIndex)].sort((a,b)=>a-b);assert.deepEqual(accounted,expected.indices);
      const covByTime=new Map(block.COVARIANCE_MATRIX_LINES.map(c=>[epoch(c.EPOCH),c])),statuses={};let last=-Infinity;
      for(const s of a.states){
        const original=block.EPHEMERIS_DATA_LINES[s.sourceIndex];assert.equal(s.sourceEpoch,original.EPOCH);assert.equal(s.ms,epoch(original.EPOCH));assert.equal(s.ms,epoch(s.epoch));assert.ok(s.ms>last);last=s.ms;
        assert.equal(s.r.length,3);assert.equal(s.v.length,3);assert.ok([...s.r,...s.v].every(Number.isFinite));statuses[s.covarianceStatus]=(statuses[s.covarianceStatus]??0)+1;
        const originalCov=covByTime.get(s.ms);
        if(s.covarianceStatus==='native_gcrf_full_matrix'){
          assert.ok(originalCov);assert.equal(s.covariance.length,36);assert.ok(s.covariance.every(Number.isFinite));
          // These supplied inertial/orbital axes rotate position orthogonally.
          // Their position trace is invariant, independently of native math.
          const before=originalCov.CX_X+originalCov.CY_Y+originalCov.CZ_Z,after=s.covariance[0]+s.covariance[7]+s.covariance[14];
          assert.ok(Math.abs(before-after)<=Math.max(1e-20,Math.abs(before)*1e-12),'Position covariance trace changed under rotation');
          // Scale roundoff by the covariance's component standard deviations,
          // not a cross entry that can cancel arbitrarily close to zero.
          for(let i=0;i<6;i++)for(let j=0;j<6;j++){
            const scale=Math.sqrt(Math.abs(s.covariance[i*6+i]*s.covariance[j*6+j]));
            assert.ok(Math.abs(s.covariance[i*6+j]-s.covariance[j*6+i])<=64*Number.EPSILON*scale,'Covariance asymmetry exceeds correlation-scale roundoff');
          }
          covariances++;covarianceComponents+=36;source.covariances++;
        }else{assert.equal(s.covariance,null);if(s.covarianceStatus==='source_unavailable')assert.ok(!originalCov);else{assert.equal(s.covarianceStatus,'conversion_failed');assert.ok(s.covarianceFailure);}}
        if(['ECEF','ITRF','FIXED_EARTH'].includes(object.sourceFrame)){assert.ok(s.earthOrientation);assert.equal(s.earthOrientation.rows,s.earthOrientation.observations+s.earthOrientation.predictions);}
        else assert.equal(s.earthOrientation,null);
      }
      assert.deepEqual(statuses,object.covarianceStatuses);for(const[k,v]of Object.entries(statuses))source.covarianceStatuses[k]=(source.covarianceStatuses[k]??0)+v;
      states+=a.states.length;source.states+=a.states.length;
      const cls=r.SOURCE_ID+'/'+r.FORMAT+'/'+object.status;if(!seen.has(cls)){seen.add(cls);replay.push({r,out,object,oem,block,states:a.states});}
    }
  }else assert.ok(['separate_sp3_physical_run','source_limitation_retained','physical_conversion_failed'].includes(out.status));
  resources++;if(resources%500===0)console.log(JSON.stringify({resources,total:all.length,states,covariances}));
}
assert.equal(resources,11771);
const native=await openOperatorNative(values.modules,bodyOf(sp3Dir,read(path.join(sp3Dir,'earth-orientation.json')).records)),replayed=[];
try{for(const r of replay){for(const old of r.states)assert.deepEqual(await native.convert(r.oem,r.block,old.sourceIndex),old,'Native selected-state replay');replayed.push({source:r.r.SOURCE_ID,key:keyOf(r.r),status:r.object.status,states:r.states.length});}}finally{await native.close();}
const result={physicalId:identity.physicalId,verdict:'PASS_NORMALIZATION_CONTRACT',resources,states,covariances,covarianceComponents,sources,replayed,
  outcomeHashesSha256:sha(JSON.stringify(hashes)),verificationSourceSha256:hashFile(new URL(import.meta.url)),scientificAdmission:'Not an accuracy, empirical calibration or collision-risk pass. Retained gaps and provisional identities remain explicit.'};
write(path.join(dir,'verification.json'),result);write(path.join(root,'results/propagator-catalog-census/normalization/operator-physical.json'),result);console.log(JSON.stringify({verdict:result.verdict,resources,states,covariances,replayed}));
