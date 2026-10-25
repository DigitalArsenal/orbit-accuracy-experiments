// Statistics of WASM outputs only. No trajectory/frame/covariance operations.
import {quantile,rng,mean} from '../../harness/stats.mjs';
import {config,H} from './common.mjs';
const norm=values=>Math.sqrt(values.reduce((s,x)=>s+x*x,0));
export function clusterInterval(rows,statistic) {
  const groups=new Map();for(const row of rows){if(!groups.has(row.object))groups.set(row.object,[]);groups.get(row.object).push(row);}
  if(!rows.length)return null;
  const objects=[...groups.keys()].sort((a,b)=>a-b),random=rng(config.statistics.seed),draws=[];
  for(let i=0;i<config.statistics.resamples;i++){const sample=[];for(let j=0;j<objects.length;j++)sample.push(...groups.get(objects[Math.floor(random()*objects.length)]));const value=statistic(sample);if(Number.isFinite(value))draws.push(value);}
  return {estimate:statistic(rows),lower:quantile(draws,.025),upper:quantile(draws,.975),draws:draws.length};
}
export function errorCell(rows) {
  const n=rows.length,objects=new Set(rows.map(r=>r.object)).size;
  const out={n,objects,status:objects>=config.statistics.minimumObjects&&n>=config.statistics.minimumPairedSamples?'TESTABLE':'INSUFFICIENT'};
  if(!n)return out;
  for(const [key,get] of [['total',r=>norm(r.errorRtn)],['absoluteAlongTrack',r=>Math.abs(r.errorRtn[1])]])for(const [label,q] of [['median',.5],['p95',.95]])out[key+label]=clusterInterval(rows,s=>quantile(s.map(get),q));
  out.signedAlongTrackMedian=clusterInterval(rows,s=>quantile(s.map(r=>r.errorRtn[1]),.5));
  const cov=rows.filter(r=>Number.isFinite(r.d2)&&r.d2>=0);out.covarianceAvailable=cov.length;
  if(cov.length){out.meanD2Over3=clusterInterval(cov,s=>mean(s.map(r=>r.d2))/3);out.coverage95=clusterInterval(cov,s=>mean(s.map(r=>Number(r.d2<=7.814727903251179))));const m=out.meanD2Over3.estimate,c=out.coverage95.estimate;out.realism=cov.length<30||new Set(cov.map(r=>r.object)).size<3?'INSUFFICIENT':m>=.8&&m<=1.25&&c>=.93&&c<=.97?'REALISTIC':'NOT REALISTIC';}
  else out.realism='UNAVAILABLE';
  return out;
}
export function trimmingDecision(rows) {
  const n=rows.length,objects=new Set(rows.map(r=>r.object)).size;
  if(n<config.statistics.minimumPairedSamples||objects<config.statistics.minimumObjects)return {status:'INSUFFICIENT',n,objects};
  const medianFullError=quantile(rows.map(r=>r.fullErrorM),.5),maxDifference=Math.max(...rows.map(r=>r.differenceM));
  const k=rows.filter(r=>Number.isFinite(r.fullD2)&&Number.isFinite(r.reducedD2));
  const covarianceRatio=k.length?clusterInterval(k,s=>mean(s.map(r=>r.reducedD2))/mean(s.map(r=>r.fullD2))):null;
  const unchanged=!!covarianceRatio&&k.length===rows.length&&covarianceRatio.lower>=.95&&covarianceRatio.upper<=1.05&&rows.every(r=>r.fullRealism===r.reducedRealism&&r.fullRealism!=='UNAVAILABLE');
  return {status:medianFullError>0&&maxDifference<config.trimming.fraction*medianFullError?'DROP':'KEEP',n,objects,medianFullError,maxDifference,threshold:config.trimming.fraction*medianFullError,covarianceRatio,covarianceRealismUnchanged:unchanged};
}
export function summarize(rows) {
  const tables=[];
  for(const arm of config.arms)for(const hours of config.horizonsHours)tables.push({arm,hours,...errorCell(rows.filter(r=>r.arm===arm&&r.hours===hours))});
  const split=Date.parse(config.window.issueStartUtc)+7*24*H;
  const candidates=[1,2,3,4,5].map(n=>({arm:config.arms[n-1],rows:rows.filter(r=>r.arm===config.arms[n-1]&&r.hours===72&&Date.parse(r.issueUtc)<split)})).filter(x=>x.rows.length>=100&&new Set(x.rows.map(r=>r.object)).size>=30);
  candidates.sort((a,b)=>quantile(a.rows.map(r=>norm(r.errorRtn)),.5)-quantile(b.rows.map(r=>norm(r.errorRtn)),.5)||a.arm.localeCompare(b.arm));
  return {tables,bestArm:candidates[0]?.arm??null,selectionSplitUtc:new Date(split).toISOString()};
}
