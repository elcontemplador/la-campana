import {resolveCampaignBundle} from '../core/campaign.mjs';

// The turn's published provincial comparison, never an action's causal effect.
export function turnPulse(state,sourceBundle,{provinceId=null}={}){
 if(state?.phase!=='debrief')return null;
 const bundle=resolveCampaignBundle(sourceBundle,state);
 const entries=state.lastTransition?.entries||[];
 const candidate=entries.findLast(e=>e.kind==='plan'&&e.turn===state.turn
  &&e.actorId==='candidate'&&(!e.partyId||e.partyId==='P1'));
 if(!candidate)return null;
 const currentPresentation=['0.8.3','0.8.4','0.8.5'].includes(state.rulesVersion)&&['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion);
 // Inspecting the map must not move a completed visit's result to another place.
 const visited=candidate.actionId==='visit'?candidate.target:null;
 const ids=currentPresentation&&visited?[visited]:[provinceId,visited,state.focusProvince,state.lastVisitedProvince];
 const district=ids.map(id=>bundle.provinces.districts.find(d=>d.id===id)).find(Boolean);
 if(!district)return null;
 const pair=state.lastTransition.provinceChanges?.find(p=>p.provinceId===district.id);
 if(!pair||![pair.before,pair.after].every(v=>Number.isFinite(v)&&v>=0&&v<=10000))return null;
 const roundedChange=(Math.round(pair.after/10)-Math.round(pair.before/10))/10;
 const trend=roundedChange>0?'up':roundedChange<0?'down':'steady';
 const current=state.publishedPolls?.P1?.districts?.[district.id];
 const seats=current?.opportunity?.player==='P1'&&current.opportunity.present
  &&Number.isInteger(current.opportunity.seats)&&current.opportunity.seats>=0
  &&current.opportunity.seats<=district.seats?current.opportunity.seats:null;
 const impulse=candidate.changes?.find(c=>c.stat==='modelImpact'&&Number.isFinite(c.delta));
 return {provinceId:district.id,provinceName:district.name,turn:state.turn,
  before:pair.before,after:pair.after,roundedChange,trend,estimatedSeats:seats,
  actionId:candidate.actionId,candidateImpulse:impulse?impulse.delta:null,
  headline:trend==='up'?`El sondeo sube en ${district.name}`:trend==='down'?`El sondeo baja en ${district.name}`:`El sondeo se mantiene en ${district.name}`,
  scope:'published_poll_after_all_agendas',note:'El sondeo reúne tu agenda, las jugadas rivales y su margen de error.'};
}
