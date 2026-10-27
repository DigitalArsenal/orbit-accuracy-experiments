import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import * as fb from 'flatbuffers';
import {FRM,frmResultStatus} from 'spacedatastandards.org/lib/js/FRM/main.js';
import {loadModule} from '../../../harness/modules.mjs';
import {unpackOem} from '../../supgp-omm/lib/records.mjs';
import {root,read,write,sha,bodyOf,outputDir,keyOf,hashFile,sourceDir} from './common.mjs';
const {values}=parseArgs({options:{modules:{type:'string'}}});if(!values.modules)throw Error('--modules required');
const modules=path.resolve(values.modules),dir=path.join(root,'runs/propagator-catalog-census/sp3-physical-20261027'),manifest=read(path.join(dir,'manifest.json'));
for(const [file,hash]of Object.entries(manifest.moduleFiles))assert.equal(hashFile(path.join(modules,file)),hash);
for(const [file,hash]of Object.entries(manifest.sourceHashes))assert.equal(hashFile(path.join(root,file)),hash);
assert.equal(hashFile(path.join(modules,'foundation/frames/dist/isomorphic/module.wasm')),'486acaa334705b97d3a975b8a3d90f4bfd2428af77c6b5086c970ed1f24e27a4');
const authority=path.join(modules,'foundation/frames/tests/eop_harness.mjs'),H=await import(pathToFileURL(authority).href),frames=await loadModule(modules,'foundation/frames');
let matrixError;
try{const r=await frames.invoke('transform_frame_position',H.invokeRequest(undefined,[H.eop()]).inputs),result=FRM.getRootAsFRM(new fb.ByteBuffer(r.outputs[0].payload)).FRAME_TRANSFORM_RESULT();assert.equal(result.STATUS(),frmResultStatus.OK);
  const m=result.ROTATION_DCM(),actual=[m.M11(),m.M12(),m.M13(),m.M21(),m.M22(),m.M23(),m.M31(),m.M32(),m.M33()];
  matrixError=Math.max(...actual.map((x,i)=>Math.abs(x-H.sofaMatrix[i])));assert.ok(matrixError<1e-12,'SOFA Earth Attitude section 5.6 printed matrix, fixed native criterion');
}finally{await frames.destroy();}
const all=read(path.join(sourceDir,'queue.json')).sources.flatMap(s=>s.resources).filter(r=>r.FORMAT==='sp3-gzip');assert.equal(all.length,134);
const hashes=[],rows=[],seen=new Set();let states=0,covarianceRows=0,predictedSamples=0,maneuverSamples=0;
for(const resource of all){
  const key=keyOf(resource),file=path.join(dir,'outcomes',key+'.json'),result=read(file),original=read(path.join(outputDir,'outcomes',key+'.json'));
  assert.equal(result.physicalId,manifest.physicalId);assert.equal(result.inventorySha256,hashFile(path.join(outputDir,'outcomes',key+'.json')));assert.deepEqual(resource,result.resource);hashes.push([key,hashFile(file)]);
  assert.equal(result.objects.length,original.blocks.length,'No source objects disappear');
  for(const object of result.objects){
    rows.push({source:resource.SOURCE_ID,product:resource.RESOURCE_ID,...object});if(!object.artifact)continue;
    const bytes=bodyOf(dir,object.artifact),b=unpackOem(bytes).EPHEMERIS_DATA_BLOCK[0];assert.equal(b.OBJECT.NORAD_CAT_ID,object.norad);assert.equal(b.EPHEMERIS_DATA_LINES.length,object.states);assert.equal(b.COVARIANCE_MATRIX_LINES.length,object.covarianceRows);
    assert.equal(object.sourceStates,object.states+object.omittedStates);assert.match(b.COMMENT,/SP3 records' standard deviations|SP3 header accuracy/);assert.doesNotMatch(b.COMMENT,/placeholder/);
    states+=object.states;covarianceRows+=object.covarianceRows;seen.add(object.norad);predictedSamples+=object.predictedOrbitSamples;maneuverSamples+=object.maneuverFlagSamples;
    if(object.quality){const q=JSON.parse(bodyOf(dir,object.quality).toString());assert.equal(q.length,object.states);for(let i=0;i<q.length;i++)assert.equal(q[i].epochUtc,b.EPHEMERIS_DATA_LINES[i].EPOCH);}
  }
}
const tally=xs=>Object.fromEntries([...xs.reduce((m,k)=>m.set(k,(m.get(k)??0)+1),new Map())].sort());
const result={schema:'direct-sp3-physical-verification',physicalId:manifest.physicalId,resourceAccounting:'PASS',nativeFrameAuthority:'PASS',
  physicalComparison:'NOT_YET_EVALUATED',covarianceCalibration:'NOT_EVALUATED',
  provenance:{manifestSha256:hashFile(path.join(dir,'manifest.json')),verifierSha256:hashFile(new URL(import.meta.url)),authorityHarnessSha256:hashFile(authority),outcomeHashesSha256:sha(JSON.stringify(hashes)),eopSha256:manifest.eopSha256},
  authority:{url:'https://www.iausofa.org/s/sofa_pn_c.pdf',section:'5.6 X,Y-series method',maximumMatrixError:matrixError,maximumAcceptedError:1e-12},
  counts:{resources:all.length,sourceObjectRows:rows.length,uniqueConvertedNumericIds:seen.size,states,covarianceRows,predictedSamples,maneuverSamples,statuses:tally(rows.map(x=>x.status))},
  failures:rows.filter(x=>!x.artifact).map(({source,product,sourceObjectId,norad,status,reason})=>({source,product,sourceObjectId,norad,status,reason})),
  eop:read(path.join(dir,'earth-orientation.json')),
  limitations:['SOFA conformance and exact source accounting verify the conversion path; they do not validate a fitted propagator or calibrated uncertainty.',
    'SP3 accuracy declarations are retained as the native module interprets them; reference-covariance realism is not established by format compliance.',
    'Predicted orbit samples and EOP rows remain labeled; no prediction is relabeled as an observation.',
    'Missing source uncertainty is a retained conversion gap, not a synthetic covariance or a discarded object.']};
write(path.join(root,'results/propagator-catalog-census/normalization/sp3-physical.json'),result);console.log(JSON.stringify({authority:result.authority,counts:result.counts,failures:result.failures}));
