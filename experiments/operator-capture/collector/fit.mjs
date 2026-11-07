// The AP fit of one captured file (E13b amendment A6, stack issue 224): one $OCM with its covariance and credit, no states. A typed wire adapter to
// propagator/sdn-ap and to the fit's own data-source/space-weather build: every fit runs in WASM, this file moves bytes. The E13b physics (physics.mjs)
// keeps its own artifacts and its own weather refusal; nothing here reaches a registered record.
import fs from 'node:fs';
import path from 'node:path';
import {createGzip,gunzipSync} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import * as fb from 'flatbuffers';
import {OEMT} from 'sds-fit/lib/js/OEM/OEM.js';
import {CATT} from 'sds-fit/lib/js/OEM/CAT.js';
import {ephemerisDataBlockT} from 'sds-fit/lib/js/OEM/ephemerisDataBlock.js';
import {ephemerisDataLineT} from 'sds-fit/lib/js/OEM/ephemerisDataLine.js';
import {timingStandard} from 'sds-fit/lib/js/OEM/timingStandard.js';
import {RFMT} from 'sds-fit/lib/js/RFM/RFM.js';
import {RFMUnion} from 'sds-fit/lib/js/RFM/RFMUnion.js';
import {PCFT} from 'sds-fit/lib/js/PCF/PCF.js';
import {PCFForceModel,PCFForceModelT} from 'sds-fit/lib/js/PCF/PCFForceModel.js';
import {pcfAtmosphereFamily} from 'sds-fit/lib/js/PCF/pcfAtmosphereFamily.js';
import {pcfTheory} from 'sds-fit/lib/js/PCF/pcfTheory.js';
import {pcfWeatherSource} from 'sds-fit/lib/js/PCF/pcfWeatherSource.js';
import {PVNT} from 'sds-fit/lib/js/PVN/PVN.js';
import {pvnSourceKind} from 'sds-fit/lib/js/PVN/pvnSourceKind.js';
import {pvnLicenseClass} from 'sds-fit/lib/js/PVN/pvnLicenseClass.js';
import {createBrowserModuleHarness} from 'space-data-module-sdk/host/browser-module';
import {encodeTimerTick,decodeHttpRequest,encodeHttpResponse,decodeFlowNotice} from 'space-data-module-sdk/runtime-contracts';
import {sha} from './transport.mjs';

/** The fit's pinned artifacts, signed by the module owner key. A new build is a new pin here. */
export const FIT_MODULES_COMMIT='ed59cf619f8da5613b24d1fd8360237f552a086e';
export const FIT_MODULES=[
  {name:'propagator/sdn-ap',version:'0.6.4',wasmSha256:'e98b63558d84cfd3b8509f4c4c640502e38f81cc05a0e0277fcffa7da97cf51d',manifestSha256:'8893028969d0619e26a477f42ab4bb061acc821bc07a6cbde24ebb3fb5436eb5'},
  {name:'data-source/space-weather',version:'0.3.1',wasmSha256:'6e679ec4f7d7b409cc4e54246dd97dc8ad54ac53bd31b23dbb5e28b9d8e460b6',manifestSha256:'9aad0f2c4131636eb236937130a9d83255b0260a6597976084fecd2f3735ff29'},
];
/** One stream per cycle: gzip over [u32 little-endian length][$OCM] frames. The name never matches the sidecars' ^\d+\.ocm$. */
export const FIT_STREAM='ap-fits.ocm.gz';

const type=code=>({schemaName:code+'.fbs',fileIdentifier:'$'+code,rootTypeName:code,wireFormat:'flatbuffer'});
const wire=(portId,payload,schemaName,fileIdentifier,rootTypeName)=>({portId,payload,typeRef:{schemaName,fileIdentifier,rootTypeName,wireFormat:'flatbuffer'}});
const iso=ms=>new Date(ms).toISOString();

// fit reads FORCES.ATMOSPHERE_MODEL as stated, never as a default, and NRLMSISE-00 is the schema's default value, so the binding would leave it off the wire.
const addAtmosphereModel=PCFForceModel.addAtmosphereModel;
PCFForceModel.addAtmosphereModel=(b,value)=>{const was=b.force_defaults;b.forceDefaults(true);addAtmosphereModel(b,value);b.forceDefaults(was);};

/** The fit's $PCF: AP at tesseral 31, zonal 20, NRLMSISE-00 on the daily rows, the module's fit with no prior carried. */
function configuration(){
  const c=new PCFT();
  c.THEORY=pcfTheory.AP;
  c.FORCES=Object.assign(new PCFForceModelT(),{EPHEMERIS_SOURCE:'',ATMOSPHERE_MODEL:pcfAtmosphereFamily.NRLMSISE00,HAS_MAXIMUM_TESSERAL_DEGREE:true,MAXIMUM_TESSERAL_DEGREE:31,HAS_MAXIMUM_DEGREE:true,MAXIMUM_DEGREE:20,WEATHER_SOURCE:pcfWeatherSource.RECORDS});
  const b=new fb.Builder(256);
  b.finish(c.pack(b),'$PCF');
  return {portId:'configuration',typeRef:type('PCF'),payload:b.asUint8Array()};
}

/** What the fit keeps of a captured file until the cycle's fit pass: the source's credit and the GCRF states the cycle derived (ms; m, m/s). */
export function fitArc({file,head,states}){
  return {name:file.name,url:file.url,norad:head.source.norad,object:file.name.split('_')[2],retrievedUtc:file.retrievedUtc,version:head.source.createdUtc,sha256:sha(file.bytes),bytes:file.bytes.length,
    epochsMs:Float64Array.from(states,s=>s.ms),stateKm:Float64Array.from(states.flatMap(s=>s.stateM.map(v=>v/1000)))};
}

function ephemeris(arc){
  const t=new OEMT(),block=new ephemerisDataBlockT(),first=iso(arc.epochsMs[0]),last=iso(arc.epochsMs.at(-1));
  Object.assign(t,{CCSDS_OEM_VERS:2.0,CREATION_DATE:'',ORIGINATOR:'sdn-operator-capture'});
  block.OBJECT=Object.assign(new CATT(),{OBJECT_NAME:arc.object,OBJECT_ID:'',NORAD_CAT_ID:arc.norad});
  block.CENTER_NAME='EARTH';
  block.REFERENCE_FRAME=new RFMT(RFMUnion.NONE,null,0,'GCRF');
  block.TIME_SYSTEM=timingStandard.UTC;
  Object.assign(block,{START_TIME:first,STOP_TIME:last,USEABLE_START_TIME:first,USEABLE_STOP_TIME:last});
  block.EPHEMERIS_DATA_LINES=Array.from(arc.epochsMs,(ms,i)=>{const s=arc.stateKm.subarray(6*i,6*i+6);return Object.assign(new ephemerisDataLineT(),{EPOCH:iso(ms),X:s[0],Y:s[1],Z:s[2],X_DOT:s[3],Y_DOT:s[4],Z_DOT:s[5]});});
  t.EPHEMERIS_DATA_BLOCK=[block];
  const b=new fb.Builder(1<<15);
  b.finish(t.pack(b),'$OEM');
  return b.asUint8Array();
}

/** The record's credit: the operator as originator, the file by name, retrieval, hash and size; the lineage says which weather the fit flew on. */
function credit(arc,lineage){
  const p=Object.assign(new PVNT(),{SOURCE_ID:'spacex-starlink',SOURCE_KIND:pvnSourceKind.Ephemeris,ORIGINATOR:'SpaceX',PROVIDER_ID:'sdn-operator-capture/1.0',LICENSE_CLASS:pvnLicenseClass.Reproducible,LICENSE_ID:'spacex-starlink',
    LINEAGE:`spacex-starlink-meme:${arc.name};${lineage}`,SOURCE_URL:arc.url,SOURCE_VERSION:arc.version,RETRIEVED_AT:arc.retrievedUtc,SOURCE_SHA256:arc.sha256,SOURCE_BYTES:BigInt(arc.bytes)});
  const b=new fb.Builder(1024);
  b.finish(p.pack(b),'$PVN');
  return b.asUint8Array();
}

export async function openFit(root){
  const modules={},provenance=[];
  for(const pin of FIT_MODULES){
    const manifestBytes=fs.readFileSync(path.join(root,pin.name,'plugin-manifest.json')),wasm=fs.readFileSync(path.join(root,pin.name,'dist/isomorphic/module.wasm'));
    if(sha(wasm)!==pin.wasmSha256||sha(manifestBytes)!==pin.manifestSha256)throw new Error(`pinned fit artifact mismatch: ${pin.name}`);
    modules[pin.name]=await createBrowserModuleHarness({wasmSource:wasm,manifest:JSON.parse(manifestBytes),surface:'direct'});
    provenance.push({name:pin.name,version:pin.version,wasmSha256:pin.wasmSha256,manifestSha256:pin.manifestSha256});
  }
  async function invoke(name,methodId,inputs){const r=await modules[name].invoke({methodId,inputs});if(r.statusCode!==0)throw new Error(`${name}/${methodId}: ${r.errorCode}: ${r.errorMessage}`);return r.outputs;}
  const config=configuration();
  /** The current module's rows from the cycle's weather sources: a size-prefixed $SPW stream, its hash, and what its report says of the forecast. Refuses as the module refuses. */
  async function weather(sources){
    const plan=await invoke('data-source/space-weather','plan_weather',[wire('tick',encodeTimerTick({triggerId:'operator-capture-fit',firedMs:Date.now()}),'TimerTick.fbs','TICK','TimerTick')]);
    const inputs=[];
    for(const q of plan.filter(f=>f.portId==='request').map(f=>decodeHttpRequest(f.payload))){
      const r=await sources.get(q.url);
      inputs.push(wire('response',encodeHttpResponse({url:q.url,status:200,body:r.bytes,retrievedMs:Date.parse(r.retrievedUtc)}),'HttpResponse.fbs','HRSP','HttpResponse'));
    }
    const out=await invoke('data-source/space-weather','parse_weather',inputs);
    const stream=Buffer.from(out.find(f=>f.portId==='records').payload),forecast=decodeFlowNotice(out.find(f=>f.portId==='report').payload).items.find(i=>i.startsWith('noaa-45-day-forecast'))??'';
    return {stream,sha256:sha(stream),rows:frameCount(stream),forecast};
  }
  /** One $OCM from one arc on `rows` ({stream, lineage}). Throws what the module refuses. Its $ODR is not kept. */
  async function fit(arc,rows){
    const out=await invoke('propagator/sdn-ap','fit',[wire('ephemeris',ephemeris(arc),'OEM.fbs','$OEM','OEM'),config,wire('space_weather',rows.stream,'SPW.fbs','$SPW','SPW'),wire('provenance',credit(arc,rows.lineage),'PVN.fbs','$PVN','PVN')]);
    return new Uint8Array(out.find(f=>f.portId==='elements').payload);
  }
  return {provenance,weather,fit,invoke,destroy:async()=>{for(const m of Object.values(modules))await m.destroy();}};
}

function frameCount(stream){let n=0;for(let at=0;at<stream.length;n++){const size=stream.readUInt32LE(at);if(size<8||at+4+size>stream.length)throw new Error('SPW frame invalid');at+=4+size;}return n;}

const heldFiles=root=>{const dir=path.join(root,'_collector','fit-weather');return {dir,rows:path.join(dir,'last-good.spw'),meta:path.join(dir,'last-good.json')};};
const replace=(file,bytes)=>{const temp=`${file}.${process.pid}.tmp`;fs.writeFileSync(temp,bytes);fs.renameSync(temp,file);};
const forecastLineage=text=>text.replace(/^noaa-45-day-forecast first-day=(\S+) age-days=(\S+)$/,'noaa-forecast-first-day=$1;noaa-forecast-age-days=$2');

/** The rows this cycle's fits fly on, and what its summary and each record's provenance say of them: the current module's rows, saved for later as the last good ones;
 *  when the module refuses, the last good rows held on disk. `stream` is null when there are neither. */
export async function fitWeather({fitter,sources,captureRoot,id}){
  const files=heldFiles(captureRoot);
  try{
    const w=await fitter.weather(sources);
    fs.mkdirSync(files.dir,{recursive:true});
    replace(files.rows,w.stream);
    replace(files.meta,JSON.stringify({sha256:w.sha256,rows:w.rows,forecast:w.forecast,cycle:id,savedUtc:iso(Date.now())},null,2)+'\n');
    return {stream:w.stream,lineage:`weather=current:${w.sha256.slice(0,16)};${forecastLineage(w.forecast)}`,report:{source:'current',sha256:w.sha256,rows:w.rows,forecast:w.forecast}};
  }catch(error){
    if(error.fatal)throw error;
    if(!fs.existsSync(files.meta))return {stream:null,lineage:null,report:{source:'none',unavailable:error.message}};
    const meta=JSON.parse(fs.readFileSync(files.meta,'utf8')),stream=fs.readFileSync(files.rows);
    if(sha(stream)!==meta.sha256)throw new Error('held weather rows differ from their recorded hash');
    return {stream,lineage:`weather=held:${meta.sha256.slice(0,16)};held-from=${meta.savedUtc};${forecastLineage(meta.forecast)}`,report:{source:'held',sha256:meta.sha256,rows:meta.rows,forecast:meta.forecast,heldFromCycle:meta.cycle,heldFromUtc:meta.savedUtc,unavailable:error.message}};
  }
}

/** A cycle's stream, written under a temporary name and renamed when whole. At most one cycle of records (about 50 MB) ever waits in the compressor. */
export function openFitStream(file){
  const temp=`${file}.tmp`,gzip=createGzip(),done=pipeline(gzip,fs.createWriteStream(temp,{flags:'wx'}));
  gzip.on('error',()=>{});done.catch(()=>{});
  return {
    write(ocm){
      if(gzip.destroyed)throw new Error('the fit stream is closed');
      const prefix=Buffer.alloc(4);prefix.writeUInt32LE(ocm.length);
      gzip.write(prefix);gzip.write(ocm);
    },
    async close(){gzip.end();await done;fs.renameSync(temp,file);return fs.statSync(file).size;},
  };
}

/** The plain $OCM records of a stream file's bytes. */
export function readFitStream(bytes){
  const raw=gunzipSync(bytes),records=[];
  for(let at=0;at<raw.length;){const size=raw.readUInt32LE(at);if(size<8||at+4+size>raw.length)throw new Error('fit stream frame invalid');records.push(new Uint8Array(raw.subarray(at+4,at+4+size)));at+=4+size;}
  return records;
}
