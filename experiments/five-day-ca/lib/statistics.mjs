import crypto from 'node:crypto';
import {rand} from '../../operator-theory/lib/compare.mjs';
export const week = text => {const d=new Date(text);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()+3-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
export const quantile=(v,q)=>{if(!v.length)return null;const a=[...v].sort((a,b)=>a-b),i=(a.length-1)*q,l=Math.floor(i),h=Math.ceil(i);return l===h||a[l]===a[h]?a[l]:a[l]+(a[h]-a[l])*(i-l);};
const random=label=>rand(parseInt(crypto.createHash('sha256').update(`20261103|${label}`).digest('hex').slice(0,8),16));
export function bootstrap(rows,stat,label){
 const groups=Map.groupBy(rows,r=>week(r.cutoff)),units=[...groups.values()];
 if(units.length<2)return null;
 const rng=random(label),out=[];
 for(let k=0;k<10000;k++){const draw=[];for(let i=0;i<units.length;i++)draw.push(...units[Math.floor(rng()*units.length)]);out.push(stat(draw));}
 return [quantile(out,.025),quantile(out,.975)];
}
export function describe(rows,label){
 const e=rows.map(r=>r.e);
 return {n:rows.length,median:quantile(e,.5),p10:quantile(e,.1),p90:quantile(e,.9),ci95:bootstrap(rows,r=>quantile(r.map(x=>x.e),.5),label),rtnRms:Object.fromEntries(['r','t','n'].map(f=>[f,rows.length?Math.sqrt(rows.reduce((s,x)=>s+x[f]**2,0)/rows.length):null]))};
}
export function contrast(rows,label){
 const median=r=>quantile(r.map(x=>x.x===null?Infinity:Math.log(x.x/x.y)),.5);
 const tail=r=>Math.log(quantile(r.map(x=>x.x??Infinity),.95)/quantile(r.map(x=>x.y),.95));
 const interval=bootstrap(rows,median,label+'median'),p95Interval=bootstrap(rows,tail,label+'p95');
 const failed=rows.filter(r=>r.x===null).length;
 return {n:rows.length,failed,failedShare:rows.length?failed/rows.length:null,medianLogRatio:median(rows),ci95:interval,p95LogRatio:rows.length?tail(rows):null,p95CI95:p95Interval,rule1:interval?interval[1]<0:null,rule2:p95Interval?p95Interval[1]<Math.log(1.1):null,rule3:rows.length?failed/rows.length<=.01:null};
}
