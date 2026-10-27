// Native readers decode states. Host code retains identities, byte framing and
// source metadata which those readers do not expose; it does not propagate.
import {gunzipSync} from 'node:zlib';
import * as O from 'spacedatastandards.org/lib/js/OEM/main.js';
import {decodeHttpRequest,decodeFlowNotice,encodeHttpResponse} from 'space-data-module-sdk/runtime-contracts';
import {loadModule} from '../../../harness/modules.mjs';
import {containerFrame,unpackOem} from '../../supgp-omm/lib/records.mjs';
import {readI11,withoutTelexAnnotations} from '../../supgp-omm/lib/readers/i11.mjs';
const HRSP={schemaName:'HttpResponse.fbs',fileIdentifier:'HRSP',rootTypeName:'HttpResponse',wireFormat:'flatbuffer'};
const hr=(portId,url,body,context)=>({portId,typeRef:HRSP,payload:encodeHttpResponse({url,status:200,body,context,retrievedMs:0})});
const epochNumber=t=>Date.parse(/[zZ]$/.test(t)?t:`${t}Z`); // ordering only, never time-scale conversion
export function summarize(bytes){
  const o=unpackOem(bytes);
  return (o.EPHEMERIS_DATA_BLOCK??[]).map((b,index)=>{
    const width=b.STATE_VECTOR_SIZE,flat=b.EPHEMERIS_DATA??[],lines=b.EPHEMERIS_DATA_LINES??[];
    let states=0,invalidStates=0,nonIncreasingEpochs=0,first=null,last=null,prior=-Infinity;
    if(flat.length){
      if(!(b.STEP_SIZE>0)||![3,6,9].includes(width)||flat.length%width)throw Error('Invalid compact OEM shape');
      states=flat.length/width;
      for(let at=0;at<flat.length;at+=width)if(!flat.slice(at,at+width).every(Number.isFinite))invalidStates++;
      first=b.START_TIME;last=b.STOP_TIME;
      if(!Number.isFinite(epochNumber(first))||!Number.isFinite(epochNumber(last)))throw Error('Invalid OEM epoch');
    }else for(const l of lines){
      states++;const t=epochNumber(l.EPOCH);
      const v=[l.X,l.Y,l.Z,...(width===3?[]:[l.X_DOT,l.Y_DOT,l.Z_DOT])];
      if(!Number.isFinite(t)||!v.every(Number.isFinite))invalidStates++;
      if(t<=prior)nonIncreasingEpochs++;prior=t;first??=l.EPOCH;last=l.EPOCH;
    }
    const frame=b.REFERENCE_FRAME?.NAME||O.CelestialFrame[b.REFERENCE_FRAME?.REFERENCE_FRAME?.frame]||null;
    return {index,identity:{norad:b.OBJECT?.NORAD_CAT_ID||null,objectId:b.OBJECT?.OBJECT_ID||null,name:b.OBJECT?.OBJECT_NAME||null},
      states,stateVectorSize:width,frame,timeSystem:O.timingStandard[b.TIME_SYSTEM]??null,first,last,stepSeconds:b.STEP_SIZE||null,
      covarianceRows:b.COVARIANCE_MATRIX_LINES?.length??0,invalidStates,nonIncreasingEpochs,
      comments:b.COMMENT??null,units:{position:'km',velocity:'km/s'},normalizedGcrf:false};
  });
}
function metadata(resource,bytes){
  const text=bytes.toString('utf8'),lines=text.split(/\r?\n/).filter(x=>x.trim());
  switch(resource.FORMAT){
    case 'oneweb-ltef':return {status:'unsupported_physical_encoding',reason:'No authoritative LTEF orbital column/frame specification located; every slot retained without fabricated states.',
      evidence:'encoded_operator_elements',identities:lines.map((s,row)=>({row,sourceObjectId:s.split(',')[0],fields:s.split(',').length})),states:0};
    case 'telesat-cob':return {status:'partial_orbit_information',reason:'Center-of-box time/angle rows do not supply a Cartesian trajectory or range.',evidence:'coarse_center_of_box',
      identities:[{sourceObjectId:resource.RESOURCE_ID}],rows:Math.max(0,lines.length-1),states:0};
    case 'planet-states':return {status:'decoded_source_states',evidence:'operator_near_epoch_state',reason:'One state per hardware identifier; no 24-hour fitting arc in this resource.',
      frame:'J2000',timeSystem:'TT',epochConvention:'seconds since J2000 TT',units:{position:'m',velocity:'m/s'},
      identities:lines.map((s,row)=>{const a=s.trim().split(/\s+/),v=a.slice(2,8).map(Number);return {row,sourceObjectId:a[0],epochSecondsTt:Number(a[1]),stateM:v,
        valid:a.length===10&&Number.isFinite(Number(a[1]))&&v.length===6&&v.every(Number.isFinite),
        ballisticCoefficientText:a[8],srpCoefficientText:a[9],covariance:'unavailable'};}),states:lines.length};
    case 'tle':case 'eumetsat-tle-js':{
      // Extract literals only: never evaluate provider JavaScript.
      const records=resource.FORMAT==='tle'?lines:lines.flatMap(x=>{const m=/=\s*"([12] [^"]+)"\s*;?/.exec(x);return m?[m[1]]:[];});
      const identities=[];let name=null;
      for(let i=0;i<records.length;i++){
        const l=records[i];if(l.startsWith('0 ')){name=l.slice(2);continue;}
        if(!l.startsWith('1 '))continue;
        const second=records[i+1],id=l.slice(2,7).trim(),paired=!!second?.startsWith('2 ')&&second.slice(2,7).trim()===id;
        const checksum=s=>s?.length===69&&[...s.slice(0,68)].reduce((n,c)=>n+(/\d/.test(c)?Number(c):c==='-'?1:0),0)%10===Number(s[68]);
        identities.push({sourceObjectId:id,norad:/^\d+$/.test(id)?Number(id):null,name,epochText:l.slice(18,32),paired,checksumValid:checksum(l)&&checksum(second)});
        if(paired)i++;name=null;
      }
      return {status:'catalog_elements_only',evidence:'catalog_mean_elements',reason:'Elements are not independent Cartesian truth.',identities,states:0};
    }
    default:return null;
  }
}
// SP3-d columns 75/76/79/80, raw labels keyed to epoch and satellite. The
// pinned native OEM conversion omits these flags, so retain a separate record.
function sp3Flags(bytes){
  const records=[];let epoch=null;
  for(const l of bytes.toString('ascii').split(/\r?\n/)){
    if(l.startsWith('* '))epoch=l.slice(3).trim();
    if(l[0]!=='P')continue;
    records.push({epoch,objectId:l.slice(1,4),missingPosition:[4,18,32].every(i=>Number(l.slice(i,i+14))===0),
      clockEvent:l[74]||' ',clockPrediction:l[75]||' ',maneuver:l[78]||' ',orbitPrediction:l[79]||' '});
  }return records;
}
export async function openReaders(modules){
  const loaded=new Map();
  async function module(name){if(!loaded.has(name))loaded.set(name,await loadModule(modules,name));return loaded.get(name);}
  return {
    async read(resource,body){
      const simple=metadata(resource,body);if(simple)return {...simple,artifacts:[]};
      let bytes=body,outputs=[],evidence='operator_forecast',sidecar=null,notices=[];
      if(resource.FORMAT==='sp3-gzip'){
        bytes=gunzipSync(body);sidecar={sp3Flags:sp3Flags(bytes)};evidence='source_product_flags';
      }
      if(['sp3-gzip','ccsds-oem-kvn'].includes(resource.FORMAT))outputs=(await (await module('files/orbit-products')).invoke('read_container',[containerFrame(bytes)])).outputs;
      else if(resource.FORMAT==='ses-i11'){
        const adapted=withoutTelexAnnotations(bytes);outputs=[{portId:'ephemeris',payload:await readI11(await module('files/orbit-products'),adapted)}];
        sidecar={adapter:'CR removal and redundant (MINUS) annotation removal only'};
      }else if(['intelsat-ecf','cpf'].includes(resource.FORMAT)){
        outputs=(await(await module(`data-source/${resource.FORMAT==='cpf'?'cpf':'intelsat'}-source`)).invoke('emit',[hr('response',resource.URL,bytes)])).outputs;
      }else if(resource.FORMAT==='starlink-meme'){
        const m=await module('data-source/spacex-starlink-source');
        const jobs=(await m.invoke('select_objects',[hr('manifest','https://api.starlink.com/public-files/ephemerides/MANIFEST.txt',Buffer.from(`${resource.RESOURCE_ID}\n`))])).outputs.filter(x=>x.portId==='requests').map(x=>decodeHttpRequest(x.payload));
        if(jobs.length!==1)throw Error(`Native identity selection returned ${jobs.length} jobs`);
        outputs=(await m.invoke('emit',[hr('ephemerides',resource.URL,bytes,jobs[0].context)])).outputs;
        const lines=bytes.toString('utf8').split(/\r?\n/),stateLines=lines.filter(x=>/^\s*\d{13,}(?:\.\d+)?\s/.test(x));
        sidecar={header:lines.slice(0,4),rawStateRows:stateLines.length,
          epochs:stateLines.map(x=>x.trim().split(/\s+/,1)[0]),
          covariance:'Raw MEME covariance rows retained in hashed source; pinned compact OEM reader omits them. Not admitted as covariance evidence.'};
        evidence='operator_blended_forecast';
      }else return {status:'unsupported_format',reason:`No validated native reader for ${resource.FORMAT}`,evidence:'unknown',identities:[],states:0,artifacts:[]};
      notices=outputs.filter(x=>x.portId==='status').map(x=>decodeFlowNotice(x.payload));
      const artifacts=outputs.filter(x=>['ephemeris','oem','descriptor'].includes(x.portId)).map((x,i)=>({name:`${i}-${x.portId}.bin`,portId:x.portId,bytes:Buffer.from(x.payload)}));
      const blocks=artifacts.filter(x=>x.portId!=='descriptor').flatMap(x=>summarize(x.bytes));
      const states=blocks.reduce((n,b)=>n+b.states,0),issues=[];
      if(!states)issues.push('native_reader_returned_no_states');
      if(blocks.some(x=>x.invalidStates||x.nonIncreasingEpochs))issues.push('invalid_or_unordered_states');
      if(blocks.some(x=>!x.frame||!x.timeSystem))issues.push('undeclared_frame_or_time_system');
      if(sidecar?.rawStateRows!=null&&sidecar.rawStateRows!==states)issues.push('native_state_count_differs');
      if(sidecar?.sp3Flags){const valid=sidecar.sp3Flags.filter(x=>!x.missingPosition).length;if(valid!==states)issues.push('native_sp3_state_count_differs');}
      return {status:issues.length?'decoded_with_issues':'decoded_native_frame',evidence,blocks,states,issues,notices,sidecar,artifacts,
        identities:blocks.map(x=>x.identity),admission:'Pending identity, frame/time, covariance and chronology checks; no physical accuracy claim.'};
    },
    provenance:()=>[...loaded.values()].map(x=>x.provenance),
    close:async()=>{for(const m of loaded.values())await m.destroy();}
  };
}
