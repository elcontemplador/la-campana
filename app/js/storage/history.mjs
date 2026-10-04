import {canonical,checksum,assertSafeTree} from '../core/utils.mjs';
import {storagePrefix} from '../core/bundles.mjs';
const KEY='la-campana-v085-summaries';
const V084_KEY='la-campana-v084-summaries';
const V083_KEY='la-campana-v083-summaries';
const V082_KEY='la-campana-v082-summaries';
const V081_KEY='la-campana-v081-summaries';
const V080_KEY='la-campana-v08-summaries';
const CONTENT071_KEY='la-campana-v071-summaries';
const PREVIOUS_KEY='la-campana-v07-summaries';
const LEGACY_KEY='la-campana-v061-summaries';
export function campaignSummary(state){
 if(state?.phase!=='ending'||!state.electionResult)return null;
 const decisions=state.timeline.filter(e=>e.kind==='plan'&&e.actorId==='candidate').map(e=>({turn:e.turn,action:e.actionId,target:e.target,
 impact:e.changes?.find(c=>c.stat==='modelImpact')?.delta||0}));
 const moments=state.timeline.filter(e=>e.changes?.some(c=>c.stat==='relation'||c.stat==='modelImpact'))
  .map(e=>({turn:e.turn,title:e.title,action:e.actionId||null,target:e.target||null,
   magnitude:Math.max(...e.changes.map(c=>Math.abs(Number(c.delta)||0))),kind:e.kind}))
  .sort((a,b)=>b.magnitude-a.magnitude||a.turn-b.turn).slice(0,3);
 const summary={rulesVersion:state.rulesVersion,bundleChecksum:state.bundleChecksum,seed:state.seed,setup:structuredClone(state.initialSetup),
 seats:state.electionResult.national.seatsByParty.P1,districts:Object.fromEntries(Object.entries(state.electionResult.districts).map(([id,d])=>[id,d.seatsByParty.P1||0])),
 agreement:state.outcome?.votes?{winner:state.outcome.winner,offer:[...state.outcome.votes.offer],ballot:state.outcome.votes.ballot}:null,
 outcome:state.outcome?.type,decisions,moments};
 return {...summary,id:checksum(summary)};
}
function validSummary(s){
 try{
  assertSafeTree(s);
  return s&&typeof s.id==='string'&&typeof s.bundleChecksum==='string'&&typeof s.rulesVersion==='string'&&typeof s.seed==='string'
   &&s.setup&&typeof s.setup==='object'&&!Array.isArray(s.setup)
   &&Number.isInteger(s.seats)&&s.seats>=0&&s.seats<=350
   &&s.districts&&typeof s.districts==='object'&&!Array.isArray(s.districts)
   &&Object.entries(s.districts).every(([id,n])=>/^[0-9]{2}$/.test(id)&&Number.isInteger(n)&&n>=0&&n<=37)
   &&Array.isArray(s.decisions)&&s.decisions.every(d=>d&&Number.isInteger(d.turn)&&d.turn>=1&&d.turn<=12&&typeof d.action==='string'&&['string','object'].includes(typeof d.target)&&Number.isFinite(d.impact))
   &&Array.isArray(s.moments)&&s.moments.every(m=>m&&typeof m.title==='string'&&Number.isInteger(m.turn))
   &&(s.agreement===null||s.agreement&&Array.isArray(s.agreement.offer)&&s.agreement.offer.length===4&&s.agreement.offer.every(n=>Number.isInteger(n)&&n>=0&&n<=3)&&s.agreement.offer.reduce((a,n)=>a+n,0)===6);
 }catch{return false;}
}
export function loadCampaignSummaries(storage=globalThis.localStorage,key=null){
 try{return (key?[key]:[KEY,V084_KEY,V083_KEY,V082_KEY,V081_KEY,V080_KEY,CONTENT071_KEY,PREVIOUS_KEY,LEGACY_KEY]).flatMap(k=>{const text=storage.getItem(k)||'[]';if(text.length>100000)return [];try{const value=JSON.parse(text);return Array.isArray(value)?value.filter(validSummary).slice(0,6):[];}catch{return [];}}).slice(0,54);}
 catch{return [];}
}
export function recordCampaign(state,storage=globalThis.localStorage){
 const summary=campaignSummary(state);if(!summary)return {ok:false};
 try{const prefix=storagePrefix(state);if(!prefix)return {ok:false};const key=prefix+'-summaries';const summaries=loadCampaignSummaries(storage,key).filter(s=>s.id!==summary.id);storage.setItem(key,JSON.stringify([summary,...summaries].slice(0,6)));return {ok:true,summary};}catch{return {ok:false};}
}
export function compareCampaigns(current,previous){
 const a=current?.phase?campaignSummary(current):current,b=previous;
 if(!validSummary(a)||!validSummary(b))return {compatible:false,reason:'Todavía no hay dos campañas terminadas.'};
 if(a.bundleChecksum!==b.bundleChecksum||a.rulesVersion!==b.rulesVersion)return {compatible:false,reason:'Las campañas usan reglas o contenido distintos.'};
 if(a.seed!==b.seed||canonical(a.setup)!==canonical(b.setup))return {compatible:false,reason:'Cambian la semilla o la configuración; no se pueden atribuir las diferencias a una decisión.'};
 const territories=Object.keys(a.districts).map(id=>({provinceId:id,before:b.districts[id]||0,after:a.districts[id]||0,delta:(a.districts[id]||0)-(b.districts[id]||0)}))
 .filter(r=>r.delta!==0).sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)||x.provinceId.localeCompare(y.provinceId));
 const decisions=a.decisions.map(d=>({turn:d.turn,before:b.decisions.find(p=>p.turn===d.turn),after:d})).filter(d=>d.before&&(d.before.action!==d.after.action||d.before.target!==d.after.target));
 const decisive=[...a.decisions].sort((x,y)=>Math.abs(y.impact)-Math.abs(x.impact)||x.turn-y.turn)[0];
 return {compatible:true,seatDelta:a.seats-b.seats,beforeSeats:b.seats,afterSeats:a.seats,territories,decisions,
  beforeAgreement:b.agreement,afterAgreement:a.agreement,moments:a.moments,
  retry:decisive?{turn:decisive.turn,action:decisive.action==='visit'?'interview':'visit',target:decisive.action==='visit'?'national':/^[0-9]{2}$/.test(decisive.target||'')?decisive.target:a.setup.province}:null};
}
export function previousCampaign(state,storage=globalThis.localStorage){
 const current=campaignSummary(state),summaries=loadCampaignSummaries(storage).filter(s=>s.id!==current?.id);
 return summaries.find(s=>compareCampaigns(current,s).compatible)||summaries[0]||null;
}
