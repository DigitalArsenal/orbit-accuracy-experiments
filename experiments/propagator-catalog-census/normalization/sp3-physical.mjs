import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import * as fb from 'flatbuffers';
import {EOP,DataType} from 'spacedatastandards.org/lib/js/EOP/main.js';
import {createBrowserModuleHarness} from 'space-data-module-sdk/host/browser-module';
import {encodeHttpResponse} from 'space-data-module-sdk/runtime-contracts';
import {loadModule} from '../../../harness/modules.mjs';
import {unpackOem} from '../../supgp-omm/lib/records.mjs';
import {root,read,write,sha,sourceDir,outputDir,keyOf,bodyOf,storeBody,hashFile} from './common.mjs';
const {values}=parseArgs({options:{modules:{type:'string'},preflight:{type:'boolean'}}});if(!values.modules)throw Error('--modules required');
const modules=path.resolve(values.modules),moduleCommit='cb22348f2c674e8920716af09f7ca2a6a87f5f28';
const moduleFiles={
  'analysis/reference-states/dist/isomorphic/module.wasm':'77e16becd0167651219e11f1caaceacf352be535b8de56640ebe108cd7c3492f',
  'analysis/reference-states/plugin-manifest.json':'bf09040b75017643e58b89b1e8f4da28db577f98bbb7a06dba94678db2997a15',
  'data-source/eop-parser/dist/isomorphic/module.wasm':'03afedc590707a1d592edd0841f367b835498c97e5508526553e01b0d89997c1',
  'data-source/eop-parser/plugin-manifest.json':'4233ae0a5e586840e5f8d2d37f9cf15739eda286c2e4dabfed758c2650f3c449'
};
assert.equal(execFileSync('git',['-C',modules,'rev-parse','HEAD']).toString().trim(),moduleCommit);
for(const [f,h]of Object.entries(moduleFiles))assert.equal(hashFile(path.join(modules,f)),h);
const identityDir=path.join(root,'runs/propagator-catalog-census/direct-identity-20261027'),identityFile=path.join(identityDir,'reconciled-identities.json');
const identitySha256=hashFile(identityFile);assert.equal(identitySha256,'d42519075746a901b66656fa60bc3a555ae7f0011ca89c1c1518a12a13237f69');
const envDir=path.join(root,'runs/propagator-catalog-census/direct-environment-20261027'),envReceipt=read(path.join(envDir,'receipts/iers-finals.json'));
assert.equal(envReceipt.state,'downloaded');assert.equal(envReceipt.sha256,'95a61292c957fa74ed624bd4f7a84b1b984077e412b43ed39b99e092f38de9da');
const sourceHashes={};for(const f of ['normalization/sp3-physical.mjs','normalization/PHYSICAL-NORMALIZATION.md','normalization/common.mjs','normalization/config.json','direct/common.mjs','direct/config.json'].map(f=>'experiments/propagator-catalog-census/'+f).concat(['harness/modules.mjs','experiments/supgp-omm/lib/records.mjs','package-lock.json'])){
  const bytes=fs.readFileSync(path.join(root,f));assert.ok(execFileSync('git',['-C',root,'show',`HEAD:${f}`],{maxBuffer:16<<20}).equals(bytes),`Committed ${f}`);sourceHashes[f]=sha(bytes);
}
const inventory=read(path.join(outputDir,'manifest.json')),identity={moduleCommit,moduleFiles,sourceHashes,identitySha256,inventoryId:inventory.normalizationId,eopSha256:envReceipt.sha256,eopReceiptSha256:hashFile(path.join(envDir,'receipts/iers-finals.json'))},physicalId=sha(JSON.stringify(identity));
const dir=path.join(root,'runs/propagator-catalog-census',values.preflight?'sp3-physical-preflight-20261027':'sp3-physical-20261027');
fs.mkdirSync(dir,{recursive:true});const lock=path.join(dir,'runner.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,command:process.argv}),{flag:'wx'});
const all=read(path.join(sourceDir,'queue.json')).sources.flatMap(s=>s.resources).filter(r=>r.FORMAT==='sp3-gzip');assert.equal(all.length,134);
const seen=new Set(),selected=values.preflight?all.filter(r=>{const k=r.SOURCE_ID+'/'+(/OPS(FIN|RAP|ULT)/.exec(r.RESOURCE_ID)?.[1]??'POD');if(seen.has(k))return false;seen.add(k);return true;}):all;
const byResource=new Map();for(const row of read(identityFile)){if(!byResource.has(row.resourceKey))byResource.set(row.resourceKey,[]);byResource.get(row.resourceKey).push(row);}
const type=code=>({schemaName:code+'.fbs',fileIdentifier:'$'+code,rootTypeName:code,wireFormat:'flatbuffer'}),epoch=t=>Date.parse(/[zZ]$/.test(t)?t:t+'Z');
const referenceWasm=fs.readFileSync(path.join(modules,'analysis/reference-states/dist/isomorphic/module.wasm')),referenceManifest=read(path.join(modules,'analysis/reference-states/plugin-manifest.json'));
let parser=null;
try{
  const manifestFile=path.join(dir,'manifest.json');if(fs.existsSync(manifestFile))assert.equal(read(manifestFile).physicalId,physicalId);
  write(manifestFile,{...identity,physicalId,population:all.length,selected:selected.length,preflight:!!values.preflight});
  parser=await loadModule(modules,'data-source/eop-parser');
  const response=await parser.invoke('parse_finals2000a',[{portId:'response',typeRef:{schemaName:'HttpResponse.fbs',fileIdentifier:'HRSP',rootTypeName:'HttpResponse',wireFormat:'flatbuffer'},
    payload:encodeHttpResponse({url:envReceipt.url,status:200,body:bodyOf(envDir,envReceipt),headers:envReceipt.headers,retrievedMs:Date.parse(envReceipt.retrievedUtc)})}]);
  const stream=Buffer.from(response.outputs.find(x=>x.portId==='records').payload),eopRows=[];
  for(let at=0;at<stream.length;){const n=stream.readUInt32LE(at);assert.ok(n>8&&at+4+n<=stream.length);const bytes=stream.subarray(at,at+4+n),r=EOP.getRootAsEOP(new fb.ByteBuffer(bytes.subarray(4))).unpack();
    assert.equal(r.DATA_SET_CID,'f01551220'+envReceipt.sha256);eopRows.push({mjd:r.MJD,quality:DataType[r.DATA_TYPE],bytes});at+=4+n;}
  write(path.join(dir,'earth-orientation.json'),{receipt:envReceipt,rows:eopRows.length,firstMjd:eopRows[0].mjd,lastMjd:eopRows.at(-1).mjd,
    observations:eopRows.filter(r=>r.quality==='OBSERVED').length,predictions:eopRows.filter(r=>r.quality==='PREDICTED').length,
    nativeIssueEpoch:'Not emitted on HTTP input by this pinned parser; HTTP Last-Modified retained separately, never inferred from retrieval.',
    records:storeBody(dir,stream),meta:response.outputs.filter(x=>x.portId==='meta').map(x=>storeBody(dir,Buffer.from(x.payload)))});
  let completed=0;const statuses={};
  for(const resource of selected){
    const key=keyOf(resource),inventoryFile=path.join(outputDir,'outcomes',key+'.json'),input=read(inventoryFile),file=path.join(dir,'outcomes',key+'.json');let result;
    if(fs.existsSync(file)){result=read(file);assert.equal(result.physicalId,physicalId);assert.equal(result.inventorySha256,hashFile(inventoryFile));}
    else{
      result={physicalId,resource,inventorySha256:hashFile(inventoryFile),rawSha256:input.rawSha256,objects:[]};
      try{
        assert.equal(input.status,'decoded_native_frame');const mapped=byResource.get(key),satellites={};
        for(const row of mapped){if(!row.norad){result.objects.push({index:row.index,sourceObjectId:row.input?.objectId,status:'identity_unavailable',reason:row.status});continue;}
          const id=row.input.objectId;assert.ok(id&&!satellites[id]);satellites[id]={norad:row.norad,objectId:row.evidence.at(-1)?.candidates?.[0]?.cospar??id,name:row.evidence.at(-1)?.candidates?.[0]?.name??id};}
        const start=Math.min(...input.blocks.map(b=>epoch(b.first))),stop=Math.max(...input.blocks.map(b=>epoch(b.last))),lo=Math.floor(start/86400000)+40586,hi=Math.ceil(stop/86400000)+40588;
        const rows=eopRows.filter(r=>r.mjd>=lo&&r.mjd<=hi);assert.ok(rows.length&&rows[0].mjd<=lo+1&&rows.at(-1).mjd>=hi-1,'EOP bracketing');
        result.earthOrientation={firstMjd:rows[0].mjd,lastMjd:rows.at(-1).mjd,rows:rows.length,observations:rows.filter(r=>r.quality==='OBSERVED').length,predictions:rows.filter(r=>r.quality==='PREDICTED').length,sha256:envReceipt.sha256};
        const ephemeris=input.artifacts.find(a=>a.portId!=='descriptor'),descriptor=input.artifacts.find(a=>a.portId==='descriptor');assert.ok(ephemeris&&descriptor);
        const inputs=[{portId:'ephemeris',payload:bodyOf(outputDir,ephemeris),typeRef:type('OEM')},{portId:'descriptor',payload:bodyOf(outputDir,descriptor),typeRef:type('NCD')},
          {portId:'earth_orientation',payload:Buffer.concat(rows.map(r=>r.bytes)),typeRef:type('EOP')}];
        const flags=JSON.parse(bodyOf(outputDir,input.sidecarArtifact).toString()).sp3Flags;
        async function convert(selectedSatellites){const host=await createBrowserModuleHarness({wasmSource:referenceWasm,manifest:referenceManifest,surface:'direct',hostOptions:{config:{product:resource.RESOURCE_ID,source:resource.URL,satellites:selectedSatellites}}});try{return await host.invoke({methodId:'reference_states',inputs});}finally{await host.destroy();}}
        function retain(response,requested){
          if(response.statusCode!==0){for(const [id,who]of Object.entries(requested))result.objects.push({sourceObjectId:id,norad:who.norad,status:'physical_conversion_failed',reason:response.errorMessage,errorCode:response.errorCode});return;}
          const emitted=new Set();
          for(const output of response.outputs.filter(x=>x.portId==='reference')){
            const bytes=Buffer.from(output.payload),o=unpackOem(bytes);assert.equal(o.EPHEMERIS_DATA_BLOCK.length,1);const b=o.EPHEMERIS_DATA_BLOCK[0],id=Object.keys(requested).find(k=>requested[k].norad===b.OBJECT.NORAD_CAT_ID);assert.ok(id&&!emitted.has(id));emitted.add(id);
            assert.equal(b.REFERENCE_FRAME.NAME,'GCRF');assert.equal(b.COV_REFERENCE_FRAME.NAME,'GCRF');assert.equal(b.TIME_SYSTEM,11);
            const source=input.blocks.find(x=>x.identity.objectId===id),lines=b.EPHEMERIS_DATA_LINES;assert.ok(lines.length<=source.states);assert.equal(b.COVARIANCE_MATRIX_LINES.length,lines.length);
            let prior=-Infinity;for(let i=0;i<lines.length;i++){const l=lines[i],ms=epoch(l.EPOCH);assert.ok(ms>prior);prior=ms;assert.ok([l.X,l.Y,l.Z,l.X_DOT,l.Y_DOT,l.Z_DOT].every(Number.isFinite));assert.equal(b.COVARIANCE_MATRIX_LINES[i].EPOCH,l.EPOCH);}
            const sourceFlags=flags.filter(f=>f.objectId===id&&!f.missingPosition);assert.equal(sourceFlags.length,source.states);
            const completeFlags=source.states===lines.length;
            const quality=completeFlags?lines.map((l,i)=>({epochUtc:l.EPOCH,...sourceFlags[i]})):null;
            result.objects.push({sourceObjectId:id,norad:b.OBJECT.NORAD_CAT_ID,status:completeFlags?'converted_with_source_flags':'converted_quality_mapping_unavailable',
              sourceStates:source.states,states:lines.length,omittedStates:source.states-lines.length,first:b.START_TIME,last:b.STOP_TIME,frame:'GCRF',timeSystem:'UTC',
              covarianceRows:b.COVARIANCE_MATRIX_LINES.length,uncertaintyAndConversionBasis:b.COMMENT,sourceVelocityAvailable:source.velocityAvailable,
              predictedOrbitSamples:sourceFlags.filter(f=>f.orbitPrediction==='P').length,maneuverFlagSamples:sourceFlags.filter(f=>f.maneuver==='M').length,
              quality:quality?storeBody(dir,Buffer.from(JSON.stringify(quality))):null,artifact:storeBody(dir,bytes),admission:'No propagator score yet; source product class, chronology and coverage gate still required.'});
          }
          for(const [id,who]of Object.entries(requested))if(!emitted.has(id))result.objects.push({sourceObjectId:id,norad:who.norad,status:'native_object_omitted',reason:'No output for an explicitly requested identity'});
        }
        const converted=await convert(satellites);
        if(converted.statusCode===0)retain(converted,satellites);
        else{result.wholeProductFailure={errorCode:converted.errorCode,reason:converted.errorMessage};for(const [id,who]of Object.entries(satellites))retain(await convert({[id]:who}),{[id]:who});}
        assert.equal(result.objects.length,input.blocks.length,'Every object retained');result.status=result.objects.every(x=>x.status==='converted_with_source_flags')?'converted_all_objects':'object_gaps_retained';
      }catch(e){result.status='physical_conversion_failed';result.reason=String(e.stack??e);}
      write(file,result);
    }
    completed++;statuses[result.status]=(statuses[result.status]??0)+1;const p={physicalId,completed,total:selected.length,population:all.length,statuses,completeResources:!values.preflight&&completed===all.length,updatedUtc:new Date().toISOString()};write(path.join(dir,'progress.json'),p);console.log(JSON.stringify(p));
  }
}finally{await parser?.destroy();fs.unlinkSync(lock);}
