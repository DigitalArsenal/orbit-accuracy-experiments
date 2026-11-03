import crypto from 'node:crypto';
import {rand} from '../../operator-theory/lib/compare.mjs';
export const week = text => {const d=new Date(text);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()+3-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
const interpolate=(a,b,f)=>a===b||f===0?a:a+(b-a)*f;
export const quantile=(v,q)=>{if(!v.length)return null;const a=[...v].sort((a,b)=>a-b),i=(a.length-1)*q;return interpolate(a[Math.floor(i)],a[Math.ceil(i)],i-Math.floor(i));};
const random=label=>rand(parseInt(crypto.createHash('sha256').update(`20261103|${label}`).digest('hex').slice(0,8),16));
// Type-7 quantile of the expanded cluster draw, without allocating or sorting it.
function weighted(column,weights,total,q){
 const at=(total-1)*q,lo=Math.floor(at),hi=Math.ceil(at);let n=0,low;
 for(const [value,cluster]of column){const count=weights[cluster];if(!count)continue;if(n<=lo&&lo<n+count)low=value;if(hi<n+count)return interpolate(low,value,at-lo);n+=count;}
 throw Error('invalid bootstrap weights');
}
function intervals(rows,values,q,stat,label){
 const ids=new Map([...new Set(rows.map(r=>week(r.cutoff)))].map((key,i)=>[key,i]));
 if(ids.size<2)return null;
 const sizes=new Int32Array(ids.size);for(const r of rows)sizes[ids.get(week(r.cutoff))]++;
 const columns=values.map(value=>rows.map(r=>[value(r),ids.get(week(r.cutoff))]).sort((a,b)=>a[0]-b[0]));
 const rng=random(label),out=[],weights=new Int32Array(ids.size);
 for(let k=0;k<10000;k++){weights.fill(0);for(let i=0;i<ids.size;i++)weights[Math.floor(rng()*ids.size)]++;let total=0;for(let i=0;i<ids.size;i++)total+=weights[i]*sizes[i];out.push(stat(columns.map(c=>weighted(c,weights,total,q))));}
 return [quantile(out,.025),quantile(out,.975)];
}
export function describe(rows,label){
 const e=rows.map(r=>r.e);
 return {n:rows.length,median:quantile(e,.5),p10:quantile(e,.1),p90:quantile(e,.9),ci95:intervals(rows,[r=>r.e],.5,v=>v[0],label),rtnRms:Object.fromEntries(['r','t','n'].map(f=>[f,rows.length?Math.sqrt(rows.reduce((s,x)=>s+x[f]**2,0)/rows.length):null]))};
}
export function contrast(rows,label){
 const log=r=>r.x===null?Infinity:Math.log(r.x/r.y),median=r=>quantile(r.map(log),.5);
 const tail=r=>Math.log(quantile(r.map(x=>x.x??Infinity),.95)/quantile(r.map(x=>x.y),.95));
 const interval=intervals(rows,[log],.5,v=>v[0],label+'median'),p95Interval=intervals(rows,[r=>r.x??Infinity,r=>r.y],.95,v=>Math.log(v[0]/v[1]),label+'p95');
 const failed=rows.filter(r=>r.x===null).length;
 return {n:rows.length,failed,failedShare:rows.length?failed/rows.length:null,medianLogRatio:median(rows),ci95:interval,p95LogRatio:rows.length?tail(rows):null,p95CI95:p95Interval,rule1:interval?interval[1]<0:null,rule2:p95Interval?p95Interval[1]<Math.log(1.1):null,rule3:rows.length?failed/rows.length<=.01:null};
}
