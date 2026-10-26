// Metadata selection, record decoding and sampling. No dynamics, interpolation or frame physics.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decodeOemStream } from '../../harness/records.mjs';
import { gate,gateOemFrame } from '../../harness/truth-gate.mjs';
import { config,DAY,iso,checked } from './common.mjs';

const fitStep=config.selection.cadenceSeconds.fit*1000,scoreStep=config.selection.cadenceSeconds.score*1000;
const tolerance=config.selection.epochToleranceSeconds*1000,minimum=config.selection.minimumCoverage;
const targets=(a,b,step)=>{const out=[];for(let t=a;t<=b;t+=step)out.push(t);return out;};
const fitTimes=E=>targets(E-config.selection.fitHours*3600e3,E,fitStep);
const scoreTimes=(E,d)=>targets(E+(d-1)*DAY+scoreStep,E+d*DAY,scoreStep);
const span=f=>({...f,a:Date.parse(f.start),b:Date.parse(f.stop),step:(Date.parse(f.stop)-Date.parse(f.start))/Math.max(1,f.epochs-1)});
const covers=(f,t)=>t>=f.a-tolerance&&t<=f.b+tolerance&&(f.step<=tolerance||Math.abs(f.a+Math.round((t-f.a)/f.step)*f.step-t)<=tolerance);

export function select(object,census){
  if(object.lineage==='planet-daily-states')return {status:'missing_fit_coverage',reason:'Daily OD states do not meet the registered 10-minute, 90% fit coverage'};
  if(object.evidence==='mixed-reconstructed-predicted')return {status:'unsupported_format_or_frame',reason:'Ultra-rapid reconstructed and predicted portions have not been separated'};
  const files=object.files.map(i=>({...census.files[i],fileId:i})).filter(f=>['reference','operator-head'].includes(f.kind)&&f.epochs>1).map(span);
  if(!files.length)return {status:'unsupported_format_or_frame',reason:'No normalized reference or captured operator-head states; raw archive retained'};
  const operator=files[0].kind==='operator-head';let hadFit=false;
  for(const lead of [...config.selection.leadDays].sort((a,b)=>b-a)){
    const candidates=[...new Set(files.map(f=>f.b-lead*DAY))].sort((a,b)=>b-a);
    for(const E of candidates){
      const fitting=files.filter(f=>f.b>=E-DAY-tolerance&&f.a<=E+tolerance&&(!operator||Date.parse(f.created)<=E));
      const grid=fitTimes(E);if(grid.filter(t=>fitting.some(f=>covers(f,t))).length<minimum*grid.length)continue;
      hadFit=true;
      const scoring=files.filter(f=>f.b>=E+(lead-1)*DAY&&f.a<=E+lead*DAY+tolerance&&(!operator||Date.parse(f.created)>E));
      const gridScore=scoreTimes(E,lead);if(gridScore.filter(t=>scoring.some(f=>covers(f,t))).length<minimum*gridScore.length)continue;
      const fitIds=fitting.map(f=>f.fileId),scoreIds=files.filter(f=>f.b>E&&f.a<=E+lead*DAY+tolerance&&(!operator||Date.parse(f.created)>E)).map(f=>f.fileId);
      return {status:'metadata_eligible',E,issue:iso(E),maximumLead:lead,fitIds,scoreIds};
    }
  }
  return {status:hadFit?'missing_future_reference':'missing_fit_coverage',reason:'No metadata-selected arc satisfies the registered cadence, coverage and publication chronology'};
}

export function loadArc(object,census,selection,W){
  const {E,maximumLead,fitIds,scoreIds}=selection,audit={files:[],dropped:[],invalidStates:0,referenceCovariance:'per-record availability'};
  const cache=new Map();
  const load=id=>{
    if(cache.has(id))return cache.get(id);
    const f=census.files[id],raw=checked(f.path,f.sha256);let lines=[];
    if(f.kind==='reference'){
      const bytes=gateOemFrame(raw,{product:f.product,onDrop:d=>audit.dropped.push(d)}).bytes;
      for(const record of decodeOemStream(bytes))for(const b of record.EPHEMERIS_DATA_BLOCK||[]){
        if(b.OBJECT.NORAD_CAT_ID!==object.norad)continue;
        if(b.REFERENCE_FRAME?.NAME!=='GCRF'||b.TIME_SYSTEM!==W.OEM.timingStandard.UTC)throw new Error(`Unsupported frame/time: ${f.path}`);
        lines.push(...W.lines(b));
      }
    }else{
      const x=JSON.parse(gunzipSync(raw));if(x.frame!=='GCRF'||x.units.state!=='m,m/s')throw new Error(`Unsupported capture frame/units: ${f.path}`);
      lines=gate((x.truth||[]).map(p=>({epoch:iso(p.ms),ms:p.ms,r:p.stateM.slice(0,3).map(v=>v/1000),v:p.stateM.slice(3).map(v=>v/1000),covariance:null})),{product:`operator-capture/${f.cycle}/${f.sourceSha256.slice(0,16)}`,norad:object.norad,onDrop:d=>audit.dropped.push(d)}).kept;
    }
    const valid=lines.filter(l=>Number.isFinite(l.ms)&&[...l.r,...l.v].every(Number.isFinite)&&l.v.some(v=>v!==0));audit.invalidStates+=lines.length-valid.length;
    audit.files.push({fileId:id,sha256:f.sha256,sourceSha256:f.sourceSha256,uncertainty:f.uncertainty,eop:f.eop,earthOrientation:f.earthOrientation});cache.set(id,valid);return valid;
  };
  const series=ids=>{
    const map=new Map();
    const ordered=[...ids].sort((a,b)=>{
      const x=census.files[a],y=census.files[b];return x.kind==='operator-head'?(x.created.localeCompare(y.created)||x.path.localeCompare(y.path)):(x.product.localeCompare(y.product)||x.path.localeCompare(y.path));
    });
    for(const id of ordered)for(const l of load(id))if(l.ms>=E-DAY-tolerance&&l.ms<=E+maximumLead*DAY+tolerance)map.set(l.ms,l);
    return [...map.values()].sort((a,b)=>a.ms-b.ms);
  };
  const nearest=(all,t)=>{
    let lo=0,hi=all.length;while(lo<hi){const m=(lo+hi)>>>1;if(all[m].ms<t)lo=m+1;else hi=m;}
    const q=[all[lo-1],all[lo]].filter(Boolean).sort((a,b)=>Math.abs(a.ms-t)-Math.abs(b.ms-t)||a.ms-b.ms)[0];
    return q&&Math.abs(q.ms-t)<=tolerance?q:null;
  };
  const fitting=series(fitIds),scoring=series(scoreIds),fit=fitTimes(E).map(t=>nearest(fitting,t)).filter(l=>l&&l.ms<=E),leads={},score=[];
  if(fit.length<minimum*fitTimes(E).length)return {status:'missing_fit_coverage',reason:'Actual gated states fail the metadata-selected fit coverage',selection,audit,fitSamples:fit.length};
  for(const d of config.selection.leadDays){
    const wanted=scoreTimes(E,d),selected=d<=maximumLead?wanted.map(t=>nearest(scoring,t)).filter(l=>l&&l.ms>E):[];
    const exact=d<=maximumLead?nearest(scoring,E+d*DAY):null,available=selected.length>=minimum*wanted.length;
    leads[d]={available,samples:selected.length,expectedSamples:wanted.length,exactMs:exact?.ms??null,offsetSeconds:exact?(exact.ms-E-d*DAY)/1000:null};
    if(available)score.push(...selected.map(l=>({...l,lead:d})));
  }
  if(!leads[maximumLead].available)return {status:'missing_future_reference',reason:'Actual gated states fail the metadata-selected maximum lead',selection,audit,leads};
  return {status:'eligible',E,issue:iso(E),fit,score,leads,audit,selection};
}
