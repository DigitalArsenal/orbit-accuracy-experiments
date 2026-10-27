import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {decodeHttpRequest,decodeFlowNotice,encodeHttpResponse} from 'space-data-module-sdk/runtime-contracts';
import {loadModule} from '../../../harness/modules.mjs';
import {unpackOem} from '../../supgp-omm/lib/records.mjs';
import {root,read,write,sha,sourceDir,keyOf,bodyOf,storeBody,hashFile} from './common.mjs';
const {values}=parseArgs({options:{modules:{type:'string'},preflight:{type:'boolean'}}});
if(!values.modules)throw Error('--modules required');
const modules=path.resolve(values.modules),relative='data-source/spacex-starlink-source',moduleCommit='cc64880aee735ed7b3cdf36d7a3d1fabbbf463c4';
const moduleFiles={[`${relative}/dist/isomorphic/module.wasm`]:'7b88f0791df66e042d2d0d1e96b5fdd5cd437986e2e62f2907c2610d598458f8',[`${relative}/plugin-manifest.json`]:'9871aff37275edf78e25b1b9bae32dea508257700e9884f91cf012bac6e25fb9'};
assert.equal(execFileSync('git',['-C',modules,'rev-parse','HEAD']).toString().trim(),moduleCommit);
for(const [f,h]of Object.entries(moduleFiles))assert.equal(hashFile(path.join(modules,f)),h);
const sourceHashes={};
for(const f of ['experiments/propagator-catalog-census/normalization/starlink-covariance.mjs','experiments/propagator-catalog-census/normalization/RECONCILIATION.md',
  'experiments/propagator-catalog-census/normalization/common.mjs','experiments/propagator-catalog-census/normalization/config.json',
  'experiments/propagator-catalog-census/direct/common.mjs','experiments/propagator-catalog-census/direct/config.json','harness/modules.mjs','experiments/supgp-omm/lib/records.mjs','package-lock.json']){
  const bytes=fs.readFileSync(path.join(root,f));assert.ok(execFileSync('git',['-C',root,'show',`HEAD:${f}`],{maxBuffer:16<<20}).equals(bytes),`Committed source ${f}`);sourceHashes[f]=sha(bytes);
}
const queueSha256=hashFile(path.join(sourceDir,'queue.json'));assert.equal(queueSha256,'a894aba45e241f5f0820cb29b58c7ae71472e5e47dd5b25df869b0960cc9806a');
const identity={moduleCommit,moduleFiles,sourceHashes,queueSha256,stage:'source-state-epoch-covariance-fidelity'},amendmentId=sha(JSON.stringify(identity));
const dir=path.join(root,'runs/propagator-catalog-census',values.preflight?'starlink-covariance-preflight-20261027':'starlink-covariance-20261027');
fs.mkdirSync(dir,{recursive:true});const lock=path.join(dir,'runner.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,command:process.argv}),{flag:'wx'});
const resources=read(path.join(sourceDir,'queue.json')).sources.find(s=>s.source_id==='spacex-starlink').resources;
const selected=values.preflight?[resources[0],resources[Math.floor(resources.length/2)],resources.at(-1)]:resources;
const covFields=['CX_X','CY_X','CY_Y','CZ_X','CZ_Y','CZ_Z','CX_DOT_X','CX_DOT_Y','CX_DOT_Z','CX_DOT_X_DOT','CY_DOT_X','CY_DOT_Y','CY_DOT_Z','CY_DOT_X_DOT','CY_DOT_Y_DOT','CZ_DOT_X','CZ_DOT_Y','CZ_DOT_Z','CZ_DOT_X_DOT','CZ_DOT_Y_DOT','CZ_DOT_Z_DOT'];
const stateFields=['X','Y','Z','X_DOT','Y_DOT','Z_DOT'];
const hr=(portId,url,body,context)=>({portId,typeRef:{schemaName:'HttpResponse.fbs',fileIdentifier:'HRSP',rootTypeName:'HttpResponse',wireFormat:'flatbuffer'},payload:encodeHttpResponse({url,status:200,body,context,retrievedMs:0})});
function sourceRows(bytes){
  const lines=bytes.toString().split(/\r?\n/),frame=lines[3].trim(),rows=[];
  for(const line of lines.slice(4)){
    if(!line.trim())continue;const a=line.trim().split(/\s+/);
    if(/^\d{13}(?:\.\d+)?$/.test(a[0])){
      assert.equal(a.length,7);const t=a[0],date=new Date(Date.UTC(+t.slice(0,4),0,+t.slice(4,7))).toISOString().slice(0,10);
      rows.push({epoch:`${date}T${t.slice(7,9)}:${t.slice(9,11)}:${t.slice(11)}Z`,state:a.slice(1).map(Number),cov:[]});
    }else{assert.ok(rows.length);rows.at(-1).cov.push(...a.map(Number));}
  }
  assert.ok(rows.length);for(const row of rows){assert.ok([...row.state,...row.cov].every(Number.isFinite));assert.ok(row.cov.length===0||row.cov.length===21);}
  return{frame,rows};
}
const module=await loadModule(modules,relative);let completed=0;const statuses={},totals={states:0,covarianceRows:0,covarianceValues:0,stateValues:0};
try{
  const manifestFile=path.join(dir,'manifest.json');if(fs.existsSync(manifestFile))assert.equal(read(manifestFile).amendmentId,amendmentId);
  write(manifestFile,{...identity,amendmentId,population:resources.length,selected:selected.length,preflight:!!values.preflight});
  for(const resource of selected){
    const key=keyOf(resource),file=path.join(dir,'outcomes',key+'.json'),inputFile=path.join(sourceDir,'outcomes',key+'.json'),inputReceiptSha256=hashFile(inputFile);let result;
    if(fs.existsSync(file)){result=read(file);assert.equal(result.amendmentId,amendmentId);assert.equal(result.inputReceiptSha256,inputReceiptSha256);if(result.artifact)bodyOf(dir,result.artifact);}
    else{
      const input=read(inputFile);result={amendmentId,resource,inputReceiptSha256,rawSha256:input.receipt.sha256??null};
      if(input.receipt.state!=='downloaded')Object.assign(result,{status:'download_unavailable',reason:input.receipt.error});
      else try{
        const bytes=bodyOf(sourceDir,input.receipt),expected=sourceRows(bytes);
        const requests=(await module.invoke('select_objects',[hr('manifest','https://api.starlink.com/public-files/ephemerides/MANIFEST.txt',Buffer.from(resource.RESOURCE_ID+'\n'))])).outputs.filter(x=>x.portId==='requests').map(x=>decodeHttpRequest(x.payload));assert.equal(requests.length,1);
        const output=await module.invoke('emit',[hr('ephemerides',resource.URL,bytes,requests[0].context)]),artifact=output.outputs.find(x=>x.portId==='oem');
        result.notices=output.outputs.filter(x=>x.portId==='status').map(x=>decodeFlowNotice(x.payload));
        assert.ok(artifact,`Native reader returned no OEM: ${JSON.stringify(result.notices)}`);
        const o=unpackOem(artifact.payload);assert.equal(o.EPHEMERIS_DATA_BLOCK.length,1);const b=o.EPHEMERIS_DATA_BLOCK[0];
        assert.equal(b.OBJECT.NORAD_CAT_ID,Number(resource.RESOURCE_ID.split('_')[1]));assert.equal(b.REFERENCE_FRAME.NAME,'EME2000');assert.equal(b.TIME_SYSTEM,11);
        assert.equal(b.EPHEMERIS_DATA_LINES.length,expected.rows.length);const covarianceRows=expected.rows.filter(x=>x.cov.length).length;
        assert.equal(b.COVARIANCE_MATRIX_LINES.length,covarianceRows);if(covarianceRows)assert.equal(b.COV_REFERENCE_FRAME.NAME,expected.frame);
        let covarianceIndex=0;
        for(let i=0;i<expected.rows.length;i++){
          const e=expected.rows[i],s=b.EPHEMERIS_DATA_LINES[i];assert.equal(s.EPOCH,e.epoch);assert.deepEqual(stateFields.map(k=>s[k]),e.state);
          if(e.cov.length){const c=b.COVARIANCE_MATRIX_LINES[covarianceIndex++];assert.equal(c.EPOCH,e.epoch);assert.deepEqual(covFields.map(k=>c[k]),e.cov);}
        }
        Object.assign(result,{status:'exact_source_fidelity',states:expected.rows.length,stateValues:6*expected.rows.length,covarianceRows,covarianceValues:21*covarianceRows,
          norad:b.OBJECT.NORAD_CAT_ID,frame:'EME2000',timeSystem:'UTC',covarianceFrame:covarianceRows?expected.frame:null,first:b.START_TIME,last:b.STOP_TIME,
          artifact:{portId:'oem',...storeBody(dir,Buffer.from(artifact.payload))},scientificAdmission:'Pending physical frame/covariance convention, identity and chronology validation; fidelity alone is not calibration.'});
      }catch(error){Object.assign(result,{status:'fidelity_failed',reason:String(error.stack??error)});}
      write(file,result);
    }
    completed++;statuses[result.status]=(statuses[result.status]??0)+1;for(const k of Object.keys(totals))totals[k]+=result[k]??0;
    if(completed%50===0||completed===selected.length){const p={amendmentId,completed,total:selected.length,population:resources.length,statuses,totals,completeAvailablePopulation:!values.preflight&&completed===resources.length,updatedUtc:new Date().toISOString()};write(path.join(dir,'progress.json'),p);console.log(JSON.stringify(p));}
  }
}finally{await module.destroy();fs.unlinkSync(lock);}
