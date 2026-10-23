// Statistical inference on WASM energy/work outputs. No orbit computation.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
export const config=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url)));
const C=config.solver,DAY=86400000;
export const median=xs=>{const x=xs.slice().sort((a,b)=>a-b);return x.length?(x[Math.floor((x.length-1)/2)]+x[Math.floor(x.length/2)])/2:NaN;};
const robustScale=xs=>{const m=median(xs);return Math.max(0.001,1.4826*median(xs.map(x=>Math.abs(x-m))));};
export function heldOut(id){return parseInt(createHash('sha256').update(`${config.split.salt}:${id}`).digest('hex').slice(0,8),16)%config.split.modulus===config.split.heldOutRemainder;}
export function shellOf(record){return `${Math.floor(record.samples[0].altitudeKm/50)}:${Math.floor(record.samples[0].meanElements[2]/5)}`;}
export function arcsOf(record,shell=shellOf(record)){
  const s=record.samples,id=String(record.source.norad),increments=s.slice(1).map((p,i)=>p.energyJkg-s[i].energyJkg);
  const threshold=Math.max(C.energyStepFloorJkg,C.energyStepMadMultiplier*robustScale(increments));
  const positive=increments.map(x=>x>threshold),coast=[],thrust=[];
  for(let i=0;i<increments.length;i++){
    const a=s[i],b=s[i+1],work=-(b.cumulativeDragWorkB1Jkg-a.cumulativeDragWorkB1Jkg);
    if(!(work>0)||b.ms-a.ms>1200000)continue;
    const base={id,shell,startMs:a.ms,endMs:b.ms,acquiredMs:Date.parse(record.source.retrievedUtc),source:record.source.name,work};
    if(positive[i]){
      const last=thrust.at(-1);
      if(last?.endMs===a.ms){last.endMs=b.ms;last.work+=work;last.gain+=increments[i];}
      else thrust.push({...base,gain:increments[i]});
    }else if(increments[i]<0&&!positive[i-1]&&!positive[i+1])coast.push({...base,y:Math.log(-increments[i]/work)});
  }
  return {coast,thrust,threshold};
}
// Exact integral weights of piecewise-linear daily statistical basis functions.
function weights(start,end,anchor,n){
  const out=new Map();let lo=start;
  while(lo<end){const k=Math.floor((lo-anchor)/DAY),hi=Math.min(end,anchor+(k+1)*DAY),fraction=(hi-lo)/(end-start),right=((lo+hi)/2-anchor)/DAY-k;
    for(const [i,w]of [[k,fraction*(1-right)],[k+1,fraction*right]])if(i>=0&&i<n)out.set(i,(out.get(i)??0)+w);
    lo=hi;
  }
  return [...out];
}
function linear(A,b){
  const n=b.length,a=A.map((r,i)=>[...r,b[i]]);
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
    [a[k],a[pivot]]=[a[pivot],a[k]];
    if(Math.abs(a[k][k])<1e-14)throw new Error('unidentified normal equations');
    for(let i=k+1;i<n;i++){const q=a[i][k]/a[k][k];for(let j=k;j<=n;j++)a[i][j]-=q*a[k][j];}
  }
  const x=Array(n).fill(0);for(let i=n-1;i>=0;i--){let v=a[i][n];for(let j=i+1;j<n;j++)v-=a[i][j]*x[j];x[i]=v/a[i][i];}return x;
}
function tridiagonal(diag,off,rhs){
  const d=diag.slice(),r=rhs.slice();
  for(let i=1;i<d.length;i++){const q=off[i-1]/d[i-1];d[i]-=q*off[i-1];r[i]-=q*r[i-1];}
  const x=r.slice();x[x.length-1]/=d.at(-1);for(let i=x.length-2;i>=0;i--)x[i]=(r[i]-off[i]*x[i+1])/d[i];return x;
}
export function fitShell(coast,thrust=[],options={}){
  const calibration=coast.filter(a=>!heldOut(a.id)&&Number.isFinite(a.y));
  if(!calibration.length)return {status:'UNAVAILABLE',reason:'no calibration coast arcs'};
  const anchor=Math.floor(Math.min(...calibration.map(a=>a.startMs))/DAY)*DAY;
  const last=Math.max(...calibration.map(a=>a.endMs)),n=Math.ceil((last-anchor)/DAY)+1;
  if(n>64)throw new Error('fit must be bounded to at most 63 days');
  const byId=new Map();
  const rows=calibration.map(a=>({...a,w:weights(a.startMs,a.endMs,anchor,n),day:Math.floor(((a.startMs+a.endMs)/2-anchor)/DAY),omega:1}));
  for(const r of rows){if(!byId.has(r.id))byId.set(r.id,[]);byId.get(r.id).push(r);}
  const support=Array.from({length:n},()=>new Set());for(const r of rows)for(const [k,w]of r.w)if(w>0)support[k].add(r.id);
  const active=support.map((s,k)=>s.size>=C.minimumSatellites?k:-1).filter(k=>k>=0);
  if(!active.length)return {status:'UNAVAILABLE',reason:'fewer than six calibration satellites per node',coastArcs:rows.length};
  const index=new Map(active.map((k,i)=>[k,i])),prior=Math.log(C.bPrior),beta=new Map();
  for(const id of byId.keys())beta.set(id,Array(n).fill(prior));
  let s=Array(n).fill(0),sigma=0.09,change=Infinity,converged=false,sweeps=0;
  const value=r=>r.w.reduce((v,[k,w])=>v+w*s[k],0);
  for(let iteration=0;iteration<C.iterations;iteration++){
    sweeps++;change=0;
    for(const [id,list]of byId){
      const d=Array(n).fill(0),e=Array(n-1).fill(-1/C.bRandomWalkSigma**2),rhs=Array(n).fill(0);
      for(let k=0;k<n-1;k++){d[k]-=e[k];d[k+1]-=e[k];}
      d[0]+=1/C.logBPriorSigma**2;rhs[0]+=prior/C.logBPriorSigma**2;
      for(const r of list){const w=r.omega/sigma**2;d[r.day]+=w;rhs[r.day]+=w*(r.y-value(r));}
      const next=tridiagonal(d,e,rhs),old=beta.get(id);for(let k=0;k<n;k++)change=Math.max(change,Math.abs(next[k]-old[k]));beta.set(id,next);
    }
    const size=active.length,A=Array.from({length:size+1},()=>Array(size+1).fill(0)),b=Array(size+1).fill(0);
    for(const r of rows){const w=r.omega/sigma**2,y=r.y-beta.get(r.id)[r.day];for(const [k,v]of r.w){const i=index.get(k);if(i===undefined)continue;b[i]+=w*v*y;for(const [l,u]of r.w){const j=index.get(l);if(j!==undefined)A[i][j]+=w*v*u;}}}
    for(let k=1;k<n-1;k++){
      const p=[[k-1,1],[k,-2],[k+1,1]];if(p.some(([j])=>!index.has(j)))continue;
      for(const [j,a]of p)for(const [l,b]of p)A[index.get(j)][index.get(l)]+=a*b/C.smoothSigma**2;
    }
    for(let i=0;i<size;i++){A[i][size]=1;A[size][i]=1;}
    const x=linear(A,b),next=Array(n).fill(0);active.forEach((k,i)=>{next[k]=x[i];change=Math.max(change,Math.abs(next[k]-s[k]));});s=next;
    const residuals=rows.map(r=>r.y-beta.get(r.id)[r.day]-value(r));
    // Freeze the robust scale after eight sweeps, as E13, for a fixed target.
    if(iteration<8)sigma=robustScale(residuals);
    rows.forEach((r,i)=>{r.omega=Math.min(1,C.huberK*sigma/Math.max(1e-12,Math.abs(residuals[i])));});
    if(iteration>=8&&change<C.tolerance){converged=true;break;}
  }
  const supported=support.map(x=>x.size>=C.minimumSatellites);
  const solution={status:converged?'CONVERGED':'NOT_CONVERGED',anchorMs:anchor,nodeMs:s.map((_,i)=>anchor+i*DAY),s,supported,support:support.map(x=>x.size),baseline:Object.fromEntries([...beta].map(([id,v])=>[id,v.map(Math.exp)])),sigma,coastArcs:rows.length,calibrationSatellites:byId.size,sweeps,lastChange:change,prior:{B:C.bPrior,logBSigma:C.logBPriorSigma,kappa:C.kappaPrior,kappaSigma:C.kappaPriorSigma},kappa:{}};
  for(const id of byId.keys()){
    const segments=thrust.filter(a=>a.id===id&&!heldOut(a.id)).map(a=>{
      const w=weights(a.startMs,a.endMs,anchor,n);if(w.some(([k])=>!supported[k]))return null;
      const day=Math.min(n-1,Math.max(0,Math.floor(((a.startMs+a.endMs)/2-anchor)/DAY)));
      const x=solution.baseline[id][day]*Math.exp(w.reduce((v,[k,q])=>v+q*s[k],0))*a.work;
      return x>0?{x,y:a.gain}:null;
    }).filter(Boolean);
    if(!segments.length){solution.kappa[id]={value:C.kappaPrior,identified:false,reason:'no supported positive energy segments',segments:0};continue;}
    // Normalize by the predicted drag work before robust ridge fitting.
    const ratios=segments.map(a=>a.y/a.x);let a=0;
    const scale=Math.max(0.1,robustScale(ratios));
    for(let it=0;it<30;it++){let numerator=0,denominator=1/C.kappaPriorSigma**2;for(const y of ratios){const w=Math.min(1,C.huberK*scale/Math.max(1e-12,Math.abs(y-a)))/scale**2;numerator+=w*y;denominator+=w;}const next=Math.max(-C.kappaPrior,numerator/denominator);if(Math.abs(next-a)<C.tolerance){a=next;break;}a=next;}
    solution.kappa[id]={value:C.kappaPrior+a,identified:true,segments:segments.length};
  }
  return solution;
}
export function nowcast(coast,thrust,issueMs){
  const cutoff=issueMs-C.latencyHours*3600000,start=issueMs-C.historyDays*DAY;
  const eligible=a=>a.acquiredMs<=issueMs&&a.endMs<=cutoff&&a.startMs>=start;
  const used=coast.filter(eligible),solution=fitShell(used,thrust.filter(eligible));
  return {...solution,issueMs,cutoffMs:cutoff,latestArcEndMs:used.length?Math.max(...used.map(a=>a.endMs)):null};
}
export function forecast(solution,ms){
  if(!solution.nodeMs)return null;
  const k=solution.supported.lastIndexOf(true),last=solution.nodeMs[k];
  if(ms>last)return solution.s[k]*Math.exp(-(ms-last)/(C.forecastTauHours*3600000));
  const i=Math.floor((ms-solution.anchorMs)/DAY);if(i<0||i>=k||!solution.supported[i]||!solution.supported[i+1])return null;
  const t=(ms-solution.nodeMs[i])/DAY;return solution.s[i]*(1-t)+solution.s[i+1]*t;
}
export function scoringAllowed(now=Date.now()){
  if(!config.frozen||now<Date.parse(config.window.truthEnd))throw new Error(`Hypothesis scoring locked until ${config.window.truthEnd} and coverage/reference availability checks`);
  throw new Error('This mechanics-only runner does not implement hypothesis scoring; coordinator must relaunch the registered scoring task');
}
