import {cohesionPercent as cohesionYieldPercent,actionRepeatPercent} from '../core/action-yield.mjs';
import {actionCost, validatePlan} from '../core/actions.mjs';
import {resolveCampaignBundle} from '../core/campaign.mjs';
import {canCampaignHere, provinceShortlist} from './strategy.mjs';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Forecast the known rules of an action, never hidden province weights or votes.
// Plan costs are paid before staff tasks and the candidate action resolve.
export function actionPreview(state,originalBundle,item,{actorId='candidate',plan=null}={}) {
  const bundle=resolveCampaignBundle(originalBundle,state),config=bundle.config,own=state.parties.P1;
  const action=(actorId==='candidate'?config.candidateActions:config.staffActions).find(a=>a.id===item?.id);
  if(!action)return null;
  const cost=actionCost(state,bundle,'P1',actorId,item.id,item.target??null);
  const effectivePlan=plan&&actorId==='candidate'?{...plan,candidate:{id:item.id,target:item.target??null}}:plan;
  const total=effectivePlan?validatePlan(state,effectivePlan,bundle).cost||cost:cost;
  const budgetAfterCost=Math.max(0,own.budget-Number(total.budget||0));
  const energyAfterCost=Math.max(0,own.energy-Number(total.energy||0));
  const key=item.id==='visit'?'visit:'+item.target:item.id;
  const repeats=Number(own.repeatCounts?.[key]||0);
  const result={cost:{...cost},totalCost:{...total},repeats,nextUse:repeats+1,fundraising:null,yield:null,rest:null};
  if(item.id==='fundraise') {
    const abuse=repeats>=action.effect.abuseAfter;
    const nominal=Number(abuse?action.effect.lateBudget:action.effect.budget);
    const gain=clamp(budgetAfterCost+nominal,config.resources.budget.min,config.resources.budget.max)-budgetAfterCost;
    const reputationDelta=abuse?clamp(own.reputation+action.effect.abuseReputation,config.resources.reputation.min,config.resources.reputation.max)-own.reputation:0;
    result.fundraising={nominal,gain,capped:gain<nominal,abuse,reputationDelta,
      abuseAfter:Number(action.effect.abuseAfter),lateBudget:Number(action.effect.lateBudget),abuseReputation:Number(action.effect.abuseReputation)};
  }
  if(['visit','interview'].includes(item.id)) {
    const repeatPercent=actionRepeatPercent(item.id,repeats,config);
    const energyPercent=own.energy<config.support.energyLowBelow?Number(config.support.energyLowPercent):100;
    const cohesionPercent=cohesionYieldPercent(own.cohesion,config);
    let readiness=Number(own.readiness||0);
    for(const [id,task] of Object.entries(effectivePlan?.staff||{}).sort(([a],[b])=>a.localeCompare(b))) {
      if(state.reservedStaff.includes(id)||task.id!=='prepare')continue;
      const specialist=config.staff.find(s=>s.id===id);
      const prepare=config.staffActions.find(a=>a.id==='prepare');
      readiness=clamp(readiness+Number(prepare.effect.readiness)+Number(specialist?.bonus?.extraReadiness||0)+(['0.7.0','0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(config.rulesVersion)&&state.candidate.profile==='preparacion'?1:0),config.resources.readiness.min,config.resources.readiness.max);
    }
    result.yield={repeatPercent,energyPercent,cohesionPercent,
      effectivePercent:Math.round(repeatPercent*energyPercent*cohesionPercent/10000*10)/10,
      readinessConsumed:item.id==='interview'&&readiness>0?1:0};
  }
  if(item.id==='rest') {
    const afterAction=clamp(energyAfterCost+Number(action.effect.energy),config.resources.energy.min,config.resources.energy.max);
    const afterTurn=clamp(afterAction+Number(config.resources.energy.recovery||0),config.resources.energy.min,config.resources.energy.max);
    result.rest={gain:afterAction-energyAfterCost,totalGain:afterTurn-energyAfterCost};
  }
  return result;
}

// Select one gain and one defence where possible, keeping distinct destinations.
export function campaignOpportunities(poll,bundle,{limit=2}={}) {
  const count=clamp(Math.trunc(Number(limit)||0),0,2);
  if(!count)return [];
  const districts=bundle.provinces.districts.filter(d=>canCampaignHere(bundle,d.id));
  const listFor=kind=>provinceShortlist({districts:Object.fromEntries(districts.map(d=>{
    const current=poll?.districts?.[d.id];
    return [d.id,current?{...current,opportunity:{...current.opportunity,
      attack:kind==='attack'?current.opportunity?.attack:null,
      defense:kind==='defense'?current.opportunity?.defense:null}}:null];
  }))},districts,3);
  const attacks=listFor('attack'),defenses=listFor('defense'),selected=[];
  if(attacks[0])selected.push(attacks[0]);
  const defense=defenses.find(item=>!selected.some(s=>s.provinceId===item.provinceId));
  if(defense)selected.push(defense);
  for(const item of [...attacks,...defenses].sort((a,b)=>a.votes-b.votes||a.provinceId.localeCompare(b.provinceId))) {
    if(selected.length>=count)break;
    if(!selected.some(s=>s.provinceId===item.provinceId))selected.push(item);
  }
  return selected.slice(0,count);
}

// Three editorial stops through the already frozen result, not a new count.
export function electionRevealSteps(state,originalBundle,{limit=3}={}) {
  const result=state.electionResult||state.election||state.result;
  if(!result?.districts)return [];
  const bundle=resolveCampaignBundle(originalBundle,state),poll=state.publishedPolls?.P1;
  const leader=(values,key)=>Object.entries(values||{}).sort((a,b)=>Number(key?b[1]?.[key]:b[1]||0)-Number(key?a[1]?.[key]:a[1]||0)||a[0].localeCompare(b[0]))[0]?.[0]||null;
  return bundle.provinces.districts.filter(d=>canCampaignHere(bundle,d.id)&&result.districts[d.id]).map(d=>{
    const actual=result.districts[d.id],published=poll?.districts?.[d.id];
    const playerSeats=Number(actual.seatsByParty?.P1||0),projectedPlayerSeats=Number(published?.opportunity?.seats||0);
    const finalLeader=leader(actual.partyVotes),previousLeader=leader(published?.values,'center');
    const marginVotes=Number(actual.lastSeat?.votesNeeded||0);
    const total=Object.values(actual.partyVotes||{}).reduce((sum,v)=>sum+Number(v||0),0);
    return {provinceId:d.id,provinceName:d.name,seats:d.seats,playerSeats,projectedPlayerSeats,
      change:playerSeats-projectedPlayerSeats,leader:finalLeader,previousLeader,
      leaderChanged:!!previousLeader&&previousLeader!==finalLeader,lastSeatHolder:actual.lastSeat?.holder||null,
      marginVotes,score:Math.abs(playerSeats-projectedPlayerSeats)*100+((previousLeader&&previousLeader!==finalLeader)?20:0)+d.seats/(1+marginVotes/Math.max(1,total)*100)};
  }).sort((a,b)=>b.score-a.score||a.provinceId.localeCompare(b.provinceId))
    .slice(0,clamp(Math.trunc(Number(limit)||0),0,3)).map(({score,...item})=>item);
}

export function featuredRival(state,originalBundle,provinceId) {
  const bundle=resolveCampaignBundle(originalBundle,state),opportunity=state.publishedPolls?.P1?.districts?.[provinceId]?.opportunity;
  const publicTurn=state.phase==='debrief'?state.turn:Math.max(0,state.turn-1);
  const publicMoves=(state.timeline||[]).filter(move=>move.kind==='rival'&&move.turn<=publicTurn);
  const latestTurn=Math.max(0,...publicMoves.map(move=>move.turn));
  const transitionMoves=state.phase==='debrief'?state.lastTransition?.rivalMoves||[]:[];
  const revealed=(transitionMoves.length?transitionMoves:publicMoves.filter(move=>move.turn===latestTurn))
    .filter(move=>bundle.config.parties.some(p=>p.id===move.partyId)&&move.partyId!=='P1');
  const direct=['planning','debrief'].includes(state.phase)?revealed.find(m=>m.actionId==='contrast'&&m.target==='P1')
    ||revealed.find(m=>m.actionId==='visit'&&m.target===provinceId):null;
  const partyId=direct?.partyId||opportunity?.attack?.against||opportunity?.defense?.against
    ||revealed[0]?.partyId||bundle.config.parties.find(p=>p.id!=='P1')?.id;
  if(!partyId)return null;
  const move=direct||revealed.find(m=>m.partyId===partyId)||null;
  const reason=direct?.actionId==='contrast'?'Ha contrastado contigo':direct?.target===provinceId?'Ha venido a esta provincia'
    :opportunity?.attack?.against===partyId?'Disputa contigo el próximo escaño':opportunity?.defense?.against===partyId?'Puede disputar tu escaño más ajustado':move?'Su última jugada ya es pública':'Otra candidatura en la campaña';
  return {partyId,reason,actionId:move?.actionId||null,target:move?.target??null,
    relation:Number(state.parties.P1.relations?.[partyId]||0)};
}
