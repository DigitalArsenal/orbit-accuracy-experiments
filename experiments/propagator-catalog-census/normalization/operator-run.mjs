import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {parseArgs} from 'node:util';
import {unpackOem} from '../../supgp-omm/lib/records.mjs';
import {selection,explicitBlock,openOperatorNative} from './operator-native.mjs';
import {root,read,write,sha,sourceDir,outputDir,keyOf,bodyOf,storeBody,hashFile,dir,starDir,sp3Dir,identityFile,sesFile,resourceList,outcomePath,candidate,registration} from './operator-common.mjs';
const {values}=parseArgs({options:{modules:{type:'string'},index:{type:'string'},preflight:{type:'boolean',default:false}}});
if(!values.modules)throw Error('--modules required');
const iso=()=>new Date().toISOString();
async function worker(index){
  const r=resourceList()[index],key=keyOf(r),inputFile=path.join(outputDir,'outcomes',key+'.json'),input=read(inputFile),manifest=read(path.join(dir,'manifest.json'));
  const result={physicalId:manifest.physicalId,resource:r,inventorySha256:hashFile(inputFile),rawSha256:input.rawSha256,sourceStatus:input.status,objects:[],startedUtc:iso()};let native;
  try{
    assert.equal(input.status,'decoded_native_frame');let artifact=input.artifacts.find(a=>a.portId!=='descriptor'),artifactDir=outputDir;
    if(r.FORMAT==='starlink-meme'){
      const f=path.join(starDir,'outcomes',key+'.json'),s=read(f);assert.equal(s.status,'exact_source_fidelity');assert.equal(s.rawSha256,input.rawSha256);
      result.correctedSourceOutcomeSha256=hashFile(f);artifact=s.artifact;artifactDir=starDir;
    }
    assert.ok(artifact);const oem=unpackOem(bodyOf(artifactDir,artifact)),identities=read(identityFile).filter(x=>x.resourceKey===key),ses=read(sesFile).records.find(x=>x.resourceKey===key);
    result.sourceArtifactSha256=artifact.sha256;result.creationDate=oem.CREATION_DATE;result.originator=oem.ORIGINATOR;
    native=await openOperatorNative(values.modules,bodyOf(sp3Dir,read(path.join(sp3Dir,'earth-orientation.json')).records));
    assert.equal(oem.EPHEMERIS_DATA_BLOCK.length,input.blocks.length);
    for(let index=0;index<oem.EPHEMERIS_DATA_BLOCK.length;index++){
      const raw=oem.EPHEMERIS_DATA_BLOCK[index],source=input.blocks[index],identity=ses?.norad?{...identities.find(x=>x.index===index),norad:ses.norad,status:ses.status,supplement:'ses-identity-history.json'}:identities.find(x=>x.index===index);
      const object={index,sourceIdentity:source.identity,identity:identity??{status:'unresolved',norad:null},sourceFrame:source.frame,sourceTimeSystem:source.timeSystem,sourceComments:source.comments,
        sourceStates:source.states,sourceCovarianceRows:raw.COVARIANCE_MATRIX_LINES?.length??0,epochEncoding:raw.EPHEMERIS_DATA?.length?'native_declared_compact_start_step':'explicit_source_epochs',
        evidence:r.FORMAT==='ses-i11'?'native_IESS_412_operator_model_closure':'single_operator_forecast_model_closure'};result.objects.push(object);
      try{
        if(!source.velocityAvailable)throw Error('Source velocity unavailable; placeholder slots cannot be used');
        const block=explicitBlock(raw),s=selection(block);object.selection=s;assert.equal(block.EPHEMERIS_DATA_LINES.length,source.states);
        const states=[],failures=[];
        for(const i of s.indices)try{states.push(await native.convert(oem,block,i));}catch(e){failures.push({sourceIndex:i,sourceEpoch:block.EPHEMERIS_DATA_LINES[i].EPOCH,reason:e.message});}
        object.convertedStates=states.length;object.failedStates=failures.length;object.failures=failures;
        object.covarianceStatuses={};for(const t of states)object.covarianceStatuses[t.covarianceStatus]=(object.covarianceStatuses[t.covarianceStatus]??0)+1;
        object.artifact=storeBody(dir,Buffer.from(JSON.stringify({frame:'GCRF',timeSystem:'UTC',positionUnits:'km',velocityUnits:'km/s',covarianceUnits:'km and km/s component products',states})));
        object.status=failures.length?'state_conversion_gaps':states.some(t=>t.covarianceStatus==='conversion_failed')?'covariance_conversion_gaps':!s.fitAvailable||!Object.values(s.leads).some(l=>l.available)?'coverage_gap':'selected_states_converted';
      }catch(e){object.status='physical_conversion_failed';object.reason=e.message;}
    }
    result.status=result.objects.every(o=>o.status==='selected_states_converted')?'converted_all_objects':'object_gaps_retained';
  }catch(e){result.status='physical_conversion_failed';result.reason=String(e.stack??e);}
  finally{await native?.close();result.finishedUtc=iso();write(outcomePath(r),result);}
}
async function run(){
  const identity=registration(values.modules),all=resourceList();fs.mkdirSync(dir,{recursive:true});const lock=path.join(dir,'runner.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,command:process.argv}),{flag:'wx'});
  const progress={physicalId:identity.physicalId,total:all.length,mode:values.preflight?'one-per-source-format':'all-resources',completed:0,nativeCompleted:0,preservedResources:0,active:{},errors:[],startedUtc:iso()};
  const persist=()=>{progress.updatedUtc=iso();write(path.join(dir,'progress.json'),progress);};
  try{
    const mf=path.join(dir,'manifest.json');if(fs.existsSync(mf))assert.equal(read(mf).physicalId,identity.physicalId);else write(mf,{...identity,resources:all.length,modules:fs.realpathSync(values.modules),startedUtc:iso()});
    const seen=new Set(),jobs=[];
    for(let i=0;i<all.length;i++){
      const r=all[i],key=keyOf(r),inputFile=path.join(outputDir,'outcomes',key+'.json'),input=read(inputFile),eligible=candidate(r)&&input.status==='decoded_native_frame';
      if(values.preflight){const cls=r.SOURCE_ID+'/'+r.FORMAT;if(!eligible||seen.has(cls))continue;seen.add(cls);}
      const file=outcomePath(r);
      if(fs.existsSync(file)){const o=read(file);assert.equal(o.physicalId,identity.physicalId);assert.equal(o.inventorySha256,hashFile(inputFile));assert.ok(o.finishedUtc);progress.completed++;if(eligible)progress.nativeCompleted++;else progress.preservedResources++;continue;}
      if(eligible){jobs.push(i);continue;}
      write(file,{physicalId:identity.physicalId,resource:r,inventorySha256:hashFile(inputFile),rawSha256:input.rawSha256,sourceStatus:input.status,
        status:r.FORMAT==='sp3-gzip'?'separate_sp3_physical_run':'source_limitation_retained',reason:input.reason??'Source lacks a supported full-state operator arc',
        blocks:input.blocks??[],identities:input.identities??[],finishedUtc:iso()});progress.completed++;progress.preservedResources++;
    }
    progress.scheduled=jobs.length;persist();let cursor=0;
    await Promise.all(Array.from({length:4},async(_,slot)=>{while(cursor<jobs.length){const index=jobs[cursor++],r=all[index];await new Promise(resolve=>{
      const child=fork(new URL('./operator-run.mjs',import.meta.url),['--modules',values.modules,'--index',String(index)],{cwd:root,stdio:'inherit'});progress.active[slot]={pid:child.pid,key:keyOf(r),source:r.SOURCE_ID,startedUtc:iso()};persist();
      child.once('error',e=>progress.errors.push({key:keyOf(r),reason:e.message}));child.once('close',(code,signal)=>{const f=outcomePath(r),o=fs.existsSync(f)?read(f):null;if(code===0&&o?.physicalId===identity.physicalId&&o.finishedUtc){progress.completed++;progress.nativeCompleted++;}else progress.errors.push({key:keyOf(r),code,signal});delete progress.active[slot];persist();resolve();});
    });}}));
    if(progress.errors.length||(!values.preflight&&progress.completed!==all.length))throw Error('Incomplete resource accounting');progress.status=values.preflight?'preflight_complete':'complete_available_normalization';progress.completeResources=!values.preflight;
  }catch(e){progress.status='failed';progress.error=e.message;process.exitCode=1;}
  finally{progress.finishedUtc=iso();persist();fs.unlinkSync(lock);console.log(JSON.stringify(progress));}
}
if(values.index!==undefined)await worker(Number(values.index));else await run();
