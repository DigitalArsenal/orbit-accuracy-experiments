import * as fb from 'flatbuffers';
import * as F from 'spacedatastandards.org/lib/js/FRM/main.js';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import * as O from 'spacedatastandards.org/lib/js/OEM/main.js';
import {EOP,DataType} from 'spacedatastandards.org/lib/js/EOP/main.js';
import {loadModule} from '../../../harness/modules.mjs';
const utc=s=>/[zZ]$/.test(s)?s:s+'Z',epoch=s=>Date.parse(utc(s));
const table=(ns,name,fields)=>Object.assign(new ns[name+'T'](),fields);
const encode=(ns,code,value)=>{const b=new fb.Builder(4096);b.finish(value.pack(b),'$'+code);return b.asUint8Array().slice();};
const frame=(portId,code,payload)=>({portId,typeRef:{schemaName:code+'.fbs',fileIdentifier:'$'+code,rootTypeName:code,wireFormat:'flatbuffer'},payload});
const unpack=(ns,code,b)=>ns[code][String.fromCharCode(...b.slice(8,12))==='$'+code?'getSizePrefixedRootAs'+code:'getRootAs'+code](new fb.ByteBuffer(b)).unpack();
const system=(axis,name)=>table(F,'RFMCoordinateSystem',{NAME:name,AXIS_TYPE:F.rfmAxisType[axis],AXIS_REFERENCE_BODY_ID:399,ORIGIN:table(F,'RFMOrigin',{KIND:F.rfmOriginKind.CELESTIAL_BODY,CELESTIAL_BODY_ID:399})});
const vector=v=>table(F,'FRMVector3',{X:v[0],Y:v[1],Z:v[2]});
const state=(pv,time,name)=>table(F,'FRMStateVector',{REPRESENTATION:F.frmStateRepresentation.CARTESIAN,POSITION:vector(pv.slice(0,3)),VELOCITY:vector(pv.slice(3)),EPOCH:time,EPOCH_TIME_SYSTEM:'UTC',COORDINATE_SYSTEM_NAME:name});
export function explicitBlock(block){
  if(block.EPHEMERIS_DATA_LINES?.length)return block;
  const flat=block.EPHEMERIS_DATA,n=block.STATE_VECTOR_SIZE,start=epoch(block.START_TIME);
  if(n!==6||!flat?.length||flat.length%n||!(block.STEP_SIZE>0)||!Number.isFinite(start))throw Error('Invalid compact full-state OEM');
  const rows=[];for(let at=0;at<flat.length;at+=n){const p=flat.slice(at,at+n);rows.push(table(O,'ephemerisDataLine',{EPOCH:new Date(start+at/n*block.STEP_SIZE*1000).toISOString(),X:p[0],Y:p[1],Z:p[2],X_DOT:p[3],Y_DOT:p[4],Z_DOT:p[5]}));}
  if(Math.abs(epoch(rows.at(-1).EPOCH)-epoch(block.STOP_TIME))>1)throw Error('Compact OEM endpoint differs');
  return Object.assign(Object.create(Object.getPrototypeOf(block)),block,{EPHEMERIS_DATA_LINES:rows,EPHEMERIS_DATA:[]});
}
export function selection(block){
  if(block.TIME_SYSTEM!==O.timingStandard.UTC)throw Error('Unsupported operator time system');
  const rows=block.EPHEMERIS_DATA_LINES;if(!rows?.length)throw Error('Explicit source epochs are required');
  let previous=-Infinity;for(const r of rows){const t=epoch(r.EPOCH);if(!Number.isFinite(t)||t<=previous)throw Error('Invalid or unordered actual epoch');previous=t;}
  const start=epoch(rows[0].EPOCH),E=start+86400000,selected=new Set();
  function nearest(t){let lo=0,hi=rows.length;while(lo<hi){const m=(lo+hi)>>>1;if(epoch(rows[m].EPOCH)<t)lo=m+1;else hi=m;}const ids=[lo-1,lo].filter(i=>i>=0&&i<rows.length).sort((a,b)=>Math.abs(epoch(rows[a].EPOCH)-t)-Math.abs(epoch(rows[b].EPOCH)-t)||a-b);const i=ids[0];return i!==undefined&&Math.abs(epoch(rows[i].EPOCH)-t)<=45000?i:null;}
  function grid(a,b,step){const out=[];for(let t=a;t<=b;t+=step){const i=nearest(t);if(i!==null)out.push(i);}return [...new Set(out)];}
  const fit=grid(start,E,600000).filter(i=>epoch(rows[i].EPOCH)<=E),leads={};for(const i of fit)selected.add(i);
  for(const d of [1,3,7]){const ids=grid(E+(d-1)*86400000+1800000,E+d*86400000,1800000).filter(i=>epoch(rows[i].EPOCH)>E+(d-1)*86400000&&epoch(rows[i].EPOCH)<=E+d*86400000),available=ids.length>=.9*48;
    leads[d]={available,samples:ids.length,expectedSamples:48,indices:ids,exactIndex:nearest(E+d*86400000)};if(available)for(const i of ids)selected.add(i);}
  return{E,issue:new Date(E).toISOString(),fitIndices:fit,fitAvailable:fit.length>=.9*145,expectedFitSamples:145,leads,indices:[...selected].sort((a,b)=>a-b),evidence:'single_operator_forecast_model_closure'};
}
export async function openOperatorNative(modules,eopStream){
  const frames=await loadModule(modules,'foundation/frames'),gem=await loadModule(modules,'analysis/gp-error-model'),eops=[];
  for(let at=0;at<eopStream.length;){const n=eopStream.readUInt32LE(at);if(n<8||at+4+n>eopStream.length)throw Error('Invalid EOP record framing');const bytes=eopStream.subarray(at,at+4+n),row=EOP.getRootAsEOP(new fb.ByteBuffer(bytes.subarray(4))).unpack();if(!Number.isFinite(row.MJD)||(eops.length&&row.MJD<=eops.at(-1).row.MJD))throw Error('Invalid EOP ordering');eops.push({row,bytes});at+=4+n;}
  return{
    async convert(oem,block,index){
      const l=block.EPHEMERIS_DATA_LINES[index],t=utc(l.EPOCH),ms=epoch(t),name=block.REFERENCE_FRAME?.NAME;
      const axis={EME2000:'MEAN_EQUATOR_EQUINOX_J2000',J2000:'MEAN_EQUATOR_EQUINOX_J2000',GCRF:'ICRF',ECEF:'BODY_FIXED',ITRF:'BODY_FIXED',FIXED_EARTH:'BODY_FIXED'}[name];
      if(!axis)throw Error('Unsupported operator frame '+name);
      const pv=[l.X,l.Y,l.Z,l.X_DOT,l.Y_DOT,l.Z_DOT].map(v=>v*1000);if(!pv.every(Number.isFinite))throw Error('Nonfinite source state');
      const inputs=[],eopRows=axis==='BODY_FIXED'?eops.filter(r=>r.row.MJD>=Math.floor(ms/86400000)+40586&&r.row.MJD<=Math.floor(ms/86400000)+40589):[];
      if(axis==='BODY_FIXED'){
        const mjd=ms/86400000+40587;if(eopRows.length<2||eopRows[0].row.MJD>mjd||eopRows.at(-1).row.MJD<mjd)throw Error('Missing bracketing EOP');
        inputs.push(frame('earth_orientation','EOP',Buffer.concat(eopRows.map(r=>r.bytes))));
      }
      const request=table(F,'FRMFrameTransformRequest',{OPERATION:F.frmOperationCode.STATE_TRANSFORM,SOURCE_COORDINATE_SYSTEM:system(axis,name),TARGET_COORDINATE_SYSTEM:system('ICRF','GCRF'),SOURCE_STATE:state(pv,t,name),TARGET_REPRESENTATION:F.frmStateRepresentation.CARTESIAN,EPOCH:t,EPOCH_TIME_SYSTEM:'UTC'});
      const response=await frames.invoke('transform_frame_position',[frame('request','FRM',encode(F,'FRM',table(F,'FRM',{FRAME_TRANSFORM_REQUEST:request}))),...inputs]);
      const f=unpack(F,'FRM',response.outputs.find(x=>x.portId==='result')?.payload??response.outputs[0].payload).FRAME_TRANSFORM_RESULT;
      if(f.STATUS!==F.frmResultStatus.OK)throw Error(f.ERROR_MESSAGE);
      if(f.TARGET_STATE?.COORDINATE_SYSTEM_NAME!=='GCRF'||f.TARGET_STATE.EPOCH_TIME_SYSTEM!=='UTC'||!Number.isFinite(epoch(f.TARGET_STATE.EPOCH))||Math.abs(epoch(f.TARGET_STATE.EPOCH)-ms)>1)throw Error('Native frame/epoch differs');
      const p=f.TARGET_STATE.POSITION,v=f.TARGET_STATE.VELOCITY;
      const out={sourceIndex:index,sourceEpoch:l.EPOCH,epoch:t,ms,r:[p.X,p.Y,p.Z].map(x=>x/1000),v:[v.X,v.Y,v.Z].map(x=>x/1000),covariance:null,covarianceStatus:'source_unavailable',
        earthOrientation:axis==='BODY_FIXED'?{rows:eopRows.length,observations:eopRows.filter(r=>r.row.DATA_TYPE===DataType.OBSERVED).length,predictions:eopRows.filter(r=>r.row.DATA_TYPE===DataType.PREDICTED).length}:null};
      if(![...out.r,...out.v].every(Number.isFinite))throw Error('Nonfinite native state');
      const cov=block.COVARIANCE_MATRIX_LINES?.find(c=>epoch(c.EPOCH)===ms);
      if(cov)try{
        const one=Object.assign(Object.create(Object.getPrototypeOf(block)),block,{EPHEMERIS_DATA_LINES:[l],EPHEMERIS_DATA:[],COVARIANCE_MATRIX_LINES:[cov],START_TIME:l.EPOCH,STOP_TIME:l.EPOCH});
        const source=Object.assign(Object.create(Object.getPrototypeOf(oem)),oem,{EPHEMERIS_DATA_BLOCK:[one]});
        const resident=table(P,'PRWResidentState',{CATALOG_NUMBER:block.OBJECT?.NORAD_CAT_ID??0,OBJECT_ID:block.OBJECT?.OBJECT_ID??null,STATE:f.TARGET_STATE,COORDINATE_SYSTEM:system('ICRF','GCRF'),VALID:true});
        // The frame module may emit its own epoch spelling; preserve the exact
        // UTC source instant when framing the same-state covariance request.
        resident.STATE.EPOCH=t;resident.STATE.EPOCH_TIME_SYSTEM='UTC';
        const req=table(P,'PRW',{RESIDENT_STATE:resident,RESIDENT_REQUEST:table(P,'PRWResidentRequest',{TARGET_EPOCH:table(P,'TIMInstant',{TIME_SYSTEM:P.timingStandard.UTC,EPOCH_FORMAT:P.timEpochRepresentation.ISO8601,ISO8601:t})}),
          ...(eopRows.length?{EARTH_ORIENTATION:table(P,'PRWEarthOrientation',{ROWS:eopRows.map(r=>r.row)})}:{})});
        const result=await gem.invoke('source_covariance',[frame('request','PRW',encode(P,'PRW',req)),frame('oem','OEM',encode(O,'OEM',source))]);
        const r=unpack(P,'PRW',result.outputs.find(x=>x.portId==='state').payload).RESIDENT_STATE;
        if(r.COVARIANCE?.DIMENSION!==6||r.COVARIANCE.VALUES.length!==36||!r.COVARIANCE.VALUES.every(Number.isFinite))throw Error('Invalid native covariance');
        out.covariance=r.COVARIANCE.VALUES.map(x=>x*1e-6);out.covarianceStatus='native_gcrf_full_matrix';
      }catch(e){out.covarianceStatus='conversion_failed';out.covarianceFailure=e.message;}
      return out;
    },
    async close(){await frames.destroy();await gem.destroy();}
  };
}
