// Pure UI suggestions use public campaign information and validate every agenda.
import {actionCost, validatePlan, getNegotiationPreview} from '../core/engine.mjs';
import {resolveCampaignBundle, campaignDefinition} from '../core/campaign.mjs';
import {allOffers, idealFor, evaluateSupport} from '../core/negotiation.mjs';
import {canCampaignHere, campaignDestinations, provinceShortlist} from './strategy.mjs';

const distance=(left,right)=>left.reduce((sum,value,index)=>sum+Math.abs(value-Number(right[index]||0)),0);
const byId=(left,right)=>left.id.localeCompare(right.id);

// Only a completed public count replaces the poll; a future result in a draft
// must not affect campaign advice. This mirrors the game's three proposals.
export function publicProposalOrder(state,originalBundle) {
  const bundle=resolveCampaignBundle(originalBundle,state), c=bundle.config;
  const counted=['election','negotiation','ending'].includes(state.phase)&&state.electionResult?.national?.seatsByParty;
  const seats=Object.fromEntries(c.parties.map(p=>[p.id,Number(counted?counted[p.id]||0:state.publishedPolls?.P1?.projection?.[p.id]?.median||0)]));
  const tie=c.negotiation.seatTieOrder;
  const ranked=c.parties.filter(p=>seats[p.id]>0).map(p=>p.id)
    .sort((a,b)=>seats[b]-seats[a]||tie.indexOf(a)-tie.indexOf(b));
  const ids=c.negotiation.playerFirstProposal&&seats.P1>0
    ?['P1',...ranked.filter(id=>id!=='P1').slice(0,2)]:ranked.slice(0,3);
  return {ids,seats,source:counted?'count':'poll'};
}

function publicAllies(state,bundle) {
  const own=state.parties.P1;
  const ideal=idealFor(state,bundle,'P1');
  return bundle.config.parties.filter(p=>p.id!=='P1').map(p=>{
    const differences=bundle.config.topics.filter(t=>own.positions[t.id]!==p.positions[t.id]).length;
    const programmeDistance=distance(ideal,p.policyIdeal||[]);
    return {...p,differences,programmeDistance,
      closeness:differences*bundle.config.negotiation.stanceDisagreementPenalty+programmeDistance,
      relation:Number(own.relations[p.id]||0),
      projected:Number(state.publishedPolls?.P1?.projection?.[p.id]?.median||0)};
  }).sort((a,b)=>a.closeness-b.closeness||b.projected-a.projected||byId(a,b));
}

function legalResult(state,bundle,plan,reason) {
  const result=validatePlan(state,plan,bundle);
  return {plan,reason,legal:result.ok,cost:result.cost||{budget:0,energy:0},
    error:result.ok?null:result.error?.message||'Revisa esta jugada.'};
}

// NPC staff meetings are not revealed with their destination. Once they may have
// happened we retain uncertainty, rather than read the actual NPC relationship.
function publicDirectRelation(state,bundle,a,b) {
  const config=bundle.config, meta=id=>config.parties.find(p=>p.id===id);
  const initial=config.partyRelations.find(r=>r.a===meta(a).identityId&&r.b===meta(b).identityId
    ||r.b===meta(a).identityId&&r.a===meta(b).identityId);
  const scenario=campaignDefinition(bundle,state).initialRelations.find(r=>r.a===a&&r.b===b||r.a===b&&r.b===a);
  let value=scenario?.value??initial?.value??config.resources.relation.initial;
  const publicTurn=['debrief','election','negotiation','ending'].includes(state.phase)?state.turn:Math.max(0,state.turn-1);
  const revealed=(state.timeline||[]).filter(e=>e.kind==='rival'&&e.turn<=publicTurn);
  const scheduled=config.negotiation.rivalMediationTurns??[config.negotiation.rivalMediationTurn];
  if(revealed.some(e=>scheduled.includes(e.turn)))return null;
  for(const entry of revealed)if(entry.partyId===a||entry.partyId===b){
    const other=entry.partyId===a?b:a;
    for(const change of entry.changes||[])if(change.stat==='relation'&&change.target===other)
      value=Math.max(config.resources.relation.min,Math.min(config.resources.relation.max,value+Number(change.delta||0)));
  }
  return value;
}

function publicSupportState(state,bundle) {
  const c=bundle.config,rule=c.negotiation.dialogueBridge;
  const {seats}=publicProposalOrder(state,bundle);
  return {initialSetup:state.initialSetup,commitments:[...state.commitments],
    electionResult:{national:{seatsByParty:seats}},parties:Object.fromEntries(c.parties.map(p=>[p.id,{
      positions:p.id==='P1'?{...state.parties.P1.positions}:{...p.positions},
      relations:Object.fromEntries(c.parties.filter(q=>q.id!==p.id).map(q=>[q.id,
        p.id==='P1'?Number(state.parties.P1.relations[q.id]||0):q.id==='P1'?Number(state.parties.P1.relations[p.id]||0)
        :publicDirectRelation(state,bundle,p.id,q.id)??rule?.minDirectRelation??0]))
    }]))};
}
const supportQuality=view=>view.totals.yes>=176?2:view.totals.yes>view.totals.no?1:0;

// A conditional parliamentary rehearsal, built only from the published poll and
// public programmes. Its synthetic seats are never the future election result.
export function dialoguePreparation(state,originalBundle) {
  const bundle=resolveCampaignBundle(originalBundle,state), c=bundle.config, rule=c.negotiation.dialogueBridge;
  if(!rule)return null;
  const simulated=publicSupportState(state,bundle), seats=simulated.electionResult.national.seatsByParty;
  const proposalOrder=publicProposalOrder(state,bundle);
  const compatible=publicAllies(state,bundle).filter(p=>p.differences<=2&&seats[p.id]>0);
  const eligible=compatible.find(p=>proposalOrder.ids.includes(p.id));
  const allies=eligible?[eligible,compatible.find(p=>p.id!==eligible.id)].filter(Boolean):compatible.slice(0,2);
  if(allies.length<2)return null;
  const first=allies.filter(p=>proposalOrder.ids.includes(p.id))
    .sort((a,b)=>proposalOrder.ids.indexOf(a.id)-proposalOrder.ids.indexOf(b.id))[0];
  const prepared=allies.every(p=>p.relation>=rule.minPlayerRelation);
  if(!first)return {partners:allies.map(p=>({id:p.id,name:p.name,current:p.relation,targetLevel:rule.minPlayerRelation})),
    targetLevel:rule.minPlayerRelation,prepared,ready:false,needsDeepening:false,nextTarget:null,
    directRelationPublic:null,estimatedRepresentation:seats.P1,potential:null,proposalOrder,proponent:null,
    reason:`${allies.map(p=>p.name).join(' y ')} no aparecen entre las tres propuestas ${proposalOrder.source==='poll'?'previstas por el sondeo':'del recuento'}. ${proposalOrder.source==='poll'?'Con este sondeo':'Con este recuento'}, esta pareja no abre el puente; la confianza puede servir para negociar tu propio programa.`,
    uncertainty:null};
  const second=allies.find(p=>p.id!==first.id);
  const direct=publicDirectRelation(state,bundle,first.id,second.id);
  const offers=allOffers(c).filter(offer=>state.commitments.every(id=>offer[c.topics.findIndex(t=>t.id===id)]>=c.negotiation.commitmentMinUnits)
    &&first.defaultCommitments.every(id=>offer[c.topics.findIndex(t=>t.id===id)]>=c.negotiation.rivalCommitmentMinUnits));
  const quality=supportQuality;
  const best=level=>{
    for(const partner of allies)simulated.parties.P1.relations[partner.id]=simulated.parties[partner.id].relations.P1=
      Math.max(partner.relation,level??partner.relation);
    return offers.map(offer=>evaluateSupport(simulated,bundle,first.id,offer,'yes'))
      .sort((a,b)=>quality(b)-quality(a)||(b.totals.yes-b.totals.no)-(a.totals.yes-a.totals.no)
        ||a.offer.join('-').localeCompare(b.offer.join('-')))[0]||null;
  };
  const current=best(null),basic=best(rule.minPlayerRelation),deepLevel=Math.min(c.resources.relation.max,rule.minPlayerRelation+1),deep=best(deepLevel);
  const blocked=direct!==null&&direct<rule.minDirectRelation;
  const remainingTurns=Math.max(0,c.turns-state.turn+1);
  const meetingsFor=level=>allies.reduce((sum,p)=>sum+Math.max(0,level-p.relation),0);
  const improves=view=>Boolean(current&&view&&(quality(view)>quality(current)
    ||quality(current)===0&&view.totals.yes-view.totals.no>current.totals.yes-current.totals.no));
  const deepUseful=!blocked&&seats.P1>0&&deep&&basic&&quality(deep)>quality(basic);
  const deepFits=meetingsFor(deepLevel)<=remainingTurns;
  const useDeep=deepUseful&&deepFits;
  const targetLevel=useDeep?deepLevel:rule.minPlayerRelation;
  const ready=prepared&&seats.P1>0&&!blocked;
  const needsDeepening=Boolean(useDeep&&allies.some(p=>p.relation<deepLevel));
  const future=useDeep?deep:basic;
  const remainingMeetings=meetingsFor(targetLevel);
  const outOfTime=remainingMeetings>remainingTurns;
  // Opening the basic bridge is itself a future option. Start before the poll
  // predicts a winning agreement, without presenting that option as votes.
  const useful=Boolean(!blocked&&seats.P1>0&&!outOfTime&&(!prepared||improves(future)));
  const next=useful?[...allies].filter(p=>p.relation<targetLevel)
    .sort((a,b)=>a.relation-b.relation||byId(a,b))[0]:null;
  const uncertainty=direct===null?'No conocemos la relación actual entre estos socios; el cálculo supone que aún pueden hablar.':null;
  const reason=blocked?'La relación pública entre estos socios está demasiado fría para este puente.'
    :seats.P1<=0?'El puente requiere representación; el sondeo todavía no la estima.'
    :outOfTime?`Con una reunión sugerida por turno, esta vía necesita ${remainingMeetings} reuniones; quedan ${remainingTurns} turnos. Revisa las tareas o dedica el equipo al cierre de campaña.`
    :needsDeepening?'Profundizar ambas conversaciones puede acercar apoyos si el programa encaja.'
    :prepared?'Conversaciones preparadas; el programa y los escaños todavía deben encajar.'
    :'Prepara la confianza con ambos socios para poder acercarlos al apoyar una propuesta ajena.';
  return {partners:allies.map(p=>({id:p.id,name:p.name,current:p.relation,targetLevel})),targetLevel,ready,needsDeepening,
    prepared,proposalOrder,proponent:first.id,
    nextTarget:next?.id??null,directRelationPublic:direct,estimatedRepresentation:seats.P1,
    remainingTurns,remainingMeetings,outOfTime,
    potential:current&&future?{before:{...current.totals},after:{...future.totals},proponent:first.id,
      offer:[...future.offer],improvesViability:!outOfTime&&improves(future),conditional:direct===null}:null,reason,uncertainty};
}

// Advice for a possible own agreement, never the future count or a promised vote.
// At most one suggested meeting per turn; a two-step route may start with no
// immediate voting change, but its goal must improve the public rehearsal.
export function ownAgreementPreparation(state,originalBundle,{partnerId=null}={}) {
  const bundle=resolveCampaignBundle(originalBundle,state),allies=publicAllies(state,bundle);
  if(state.phase!=='planning')return null;
  if(!publicProposalOrder(state,bundle).ids.includes('P1'))return null;
  const pending=allies.filter(p=>p.differences<=2&&p.projected>0
    &&p.relation<bundle.config.resources.relation.max).slice(0,2)
    .filter(p=>!partnerId||p.id===partnerId);
  if(!pending.length)return null;
  const simulated=publicSupportState(state,bundle);
  if(simulated.electionResult.national.seatsByParty.P1<=0)return null;
  const offers=allOffers(bundle.config).filter(offer=>state.commitments.every(id=>
    offer[bundle.config.topics.findIndex(t=>t.id===id)]>=bundle.config.negotiation.commitmentMinUnits));
  const rank=view=>[supportQuality(view),view.totals.yes-view.totals.no,view.totals.yes];
  const compare=(a,b)=>{const aa=rank(a),bb=rank(b);for(let i=0;i<aa.length;i++)if(aa[i]!==bb[i])return aa[i]-bb[i];return a.offer.join('-').localeCompare(b.offer.join('-'))*-1;};
  const best=()=>offers.map(offer=>evaluateSupport(simulated,bundle,'P1',offer,'yes')).sort((a,b)=>compare(b,a))[0]||null;
  const before=best();
  if(!before||supportQuality(before)===2)return null;
  const remainingTurns=Math.max(0,bundle.config.turns-state.turn+1),routes=[];
  const reset=()=>{for(const p of pending)simulated.parties.P1.relations[p.id]=simulated.parties[p.id].relations.P1=p.relation;};
  const consider=(partners,level)=>{
    reset();
    const changes=partners.filter(p=>p.relation<level).map(p=>({id:p.id,name:p.name,current:p.relation,targetLevel:level,meetings:level-p.relation}));
    const meetings=changes.reduce((sum,p)=>sum+p.meetings,0);
    if(!meetings||meetings>remainingTurns)return;
    for(const p of changes)simulated.parties.P1.relations[p.id]=simulated.parties[p.id].relations.P1=p.targetLevel;
    const after=best();if(!after)return;
    const qualityGain=supportQuality(after)-supportQuality(before),marginGain=after.totals.yes-after.totals.no-(before.totals.yes-before.totals.no);
    // Once a simple majority is already projected, keep campaigning unless
    // this route can reach a first-ballot majority. Extra votes alone are not
    // a reason to spend all the staff's turns on relations.
    if(!(qualityGain>0||supportQuality(before)===0&&marginGain>0))return;
    routes.push({partners:changes,meetings,qualityGain,marginGain,before,after});
  };
  for(let level=bundle.config.negotiation.minRelationForAutomaticSupport;level<=bundle.config.resources.relation.max;level++){
    consider(pending,level);
    if(pending.length>1)for(const partner of pending)consider([partner],level);
  }
  routes.sort((a,b)=>b.qualityGain-a.qualityGain||b.marginGain/b.meetings-a.marginGain/a.meetings
    ||a.meetings-b.meetings||b.marginGain-a.marginGain||a.after.offer.join('-').localeCompare(b.after.offer.join('-')));
  const route=routes[0];if(!route)return null;
  const next=route.partners.map(p=>({...p,closeness:allies.find(a=>a.id===p.id).closeness}))
    .sort((a,b)=>a.current-b.current||a.closeness-b.closeness||byId(a,b))[0];
  const priorities=bundle.config.topics.filter(t=>state.commitments.includes(t.id)).map(t=>t.name.toLowerCase());
  return {nextTarget:next.id,targetLevel:next.targetLevel,current:next.current,
    meetings:route.meetings,partners:route.partners,remainingTurns,priorities,
    before:{...route.before.totals},after:{...route.after.totals},offer:[...route.after.offer],
    improvesViability:route.qualityGain>0,conditional:true,
    reason:`Buscáis mantener ${priorities.map(t=>`«${t}»`).join(' y ')} en un acuerdo propio. ${route.meetings>1?`Para esta vía aún hacen falta ${route.meetings} reuniones, contando la de hoy.`:'Esta reunión puede acercar apoyos.'} El sondeo puede cambiar.`};
}

export function suggestCampaignPlan(state,originalBundle,{candidate=null,provinceId=null,reserveBudget=null}={}) {
  const bundle=resolveCampaignBundle(originalBundle,state);
  const available=state.selectedStaff.filter(id=>!state.reservedStaff.includes(id));
  const destinations=campaignDestinations(bundle);
  const province=[provinceId,candidate?.id==='visit'?candidate.target:null,state.focusProvince,destinations[0]?.id]
    .find(id=>id&&canCampaignHere(bundle,id))||null;
  const waiting=Object.fromEntries(available.map(id=>[id,{id:'wait',target:null}]));
  let action=candidate?{id:candidate.id,target:candidate.target??null}:{id:'visit',target:province};
  if(!candidate&&!validatePlan(state,{candidate:action,staff:waiting},bundle).ok){
    const ending=state.turn===bundle.config.turns;
    const alternatives=ending?[{id:'interview',target:'national'},
      ...(state.parties.P1.budget<bundle.config.negotiation.counterofferBudgetCost+Number(bundle.config.negotiation.secondBallotRevisionCost||0)
        ?[{id:'fundraise',target:null}]:[]),{id:'rest',target:null}]:[{id:'rest',target:null}];
    action=alternatives.find(candidate=>validatePlan(state,{candidate,staff:waiting},bundle).ok);
  }
  const plan={candidate:action,staff:waiting};
  const initial=legalResult(state,bundle,plan,'El equipo conserva recursos.');
  if(!initial.legal)return initial;
  const remaining=bundle.config.turns-state.turn;
  const visitReserve=remaining>0&&province?actionCost(state,bundle,'P1','candidate','visit',province).budget:0;
  const pactReserve=Number.isFinite(reserveBudget)?Math.max(0,reserveBudget)
    :state.turn>=bundle.config.turns-2?bundle.config.negotiation.counterofferBudgetCost:0;
  const reserve=Math.max(visitReserve,pactReserve);
  // The reserve limits optional team work, never the candidate's legal action.
  const spendingLimit=Math.max(initial.cost.budget,state.parties.P1.budget-reserve);
  // A visit is an expressed territorial intention. An old focus during rest or
  // fundraising is not permission to buy advertising or another local poll.
  const visiting=action.id==='visit'&&action.target===province;
  const marginal=visiting&&provinceShortlist(state.publishedPolls?.P1,destinations)
    .some(item=>item.provinceId===province);
  // Three remaining closes are a cautious horizon, not a claim that late
  // organization has no effect. Every task remains available for manual plans.
  const organizationUseful=visiting&&remaining>=2;
  const allies=publicAllies(state,bundle);
  const dialogue=dialoguePreparation(state,bundle);
  const agreement=ownAgreementPreparation(state,bundle);
  const ownAlly=agreement?allies.find(p=>p.id===agreement.nextTarget):null;
  const dialogueAlly=dialogue?.nextTarget?allies.find(p=>p.id===dialogue.nextTarget):null;
  const currentDialogue=dialogue?.potential?.before;
  const dialogueViable=currentDialogue&&(currentDialogue.yes>=176||currentDialogue.yes>currentDialogue.no);
  const ally=campaignDefinition(bundle,state).objective.kind==='government'?ownAlly:dialogueAlly??(dialogueViable?null:ownAlly);
  let mediation=false;
  let organization=false;
  let preparation=false, investigation=false, advertising=false;
  const debateTurn=bundle.content.events.find(e=>e.id==='E07')?.turn;
  const beforeDebate=['0.8.4','0.8.5'].includes(bundle.config.rulesVersion)&&state.turn>=debateTurn-3&&state.turn<debateTurn;
  // Build the three optional debate responses over its last three prior turns;
  // account for today's Medios consuming one token after staff tasks.
  const preparationTarget=beforeDebate?3+(action.id==='interview'?1:0):remaining===0?1:2;
  let plannedReadiness=state.parties.P1.readiness;
  const order=[...available].sort((left,right)=>{
    const specialty=id=>bundle.config.staff.find(p=>p.id===id)?.specialty;
    const priority=id=>state.turn===1?(specialty(id)==='organization'?0:1):(specialty(id)==='relations'?0:1);
    return priority(left)-priority(right)||left.localeCompare(right);
  });
  for(const id of order) {
    const specialty=bundle.config.staff.find(p=>p.id===id)?.specialty;
    const preparationUseful=['interview','contrast'].includes(action.id)||state.turn<Math.ceil(bundle.config.turns*.6);
    const research=state.parties.P1.research[province];
    const activeResearch=research&&research.from<=state.turn&&research.through>=state.turn;
    let choices;
    if(state.turn===1) {
      choices=specialty==='organization'
        ? [{id:'organize',target:province},{id:'prepare',target:null}]
        : [{id:'prepare',target:null},{id:'organize',target:province}];
    } else {
      choices=[];
      if(beforeDebate&&plannedReadiness<preparationTarget)choices.push({id:'prepare',target:null});
      if(ally&&!mediation&&!(preparationUseful&&['interview','contrast'].includes(action.id)&&specialty==='communication'))choices.push({id:'mediate',target:ally.id});
      if(!beforeDebate&&preparationUseful&&plannedReadiness<preparationTarget&&!preparation)choices.push({id:'prepare',target:null});
      if(marginal&&remaining<=2&&!advertising)choices.push({id:'advertise',target:province});
      if(marginal&&remaining>0&&specialty==='analysis'&&!activeResearch&&!investigation)choices.push({id:'research',target:province});
      if(organizationUseful&&!organization&&Number(state.parties.P1.organization[province]||0)<bundle.config.resources.organization.max)
        choices.push({id:'organize',target:province});
      if(marginal&&remaining>0&&!activeResearch&&!investigation)choices.push({id:'research',target:province});
    }
    choices.push({id:'wait',target:null});
    for(const choice of choices) {
      if(['organize','research'].includes(choice.id)&&!choice.target)continue;
      if(choice.id==='organize'&&(!organizationUseful||organization
        ||Number(state.parties.P1.organization[province]||0)>=bundle.config.resources.organization.max))continue;
      if(choice.id==='prepare'&&((preparation&&!beforeDebate)||plannedReadiness>=preparationTarget))continue;
      const attempt={candidate:plan.candidate,staff:{...plan.staff,[id]:choice}};
      const valid=validatePlan(state,attempt,bundle);
      if(!valid.ok||valid.cost.budget>spendingLimit)continue;
      plan.staff[id]={...choice};
      mediation ||= choice.id==='mediate';
      organization ||= choice.id==='organize';
      if(choice.id==='prepare')plannedReadiness=Math.min(bundle.config.resources.readiness.max,plannedReadiness
        +bundle.config.staffActions.find(a=>a.id==='prepare').effect.readiness
        +(bundle.config.staff.find(s=>s.id===id)?.bonus.extraReadiness??0)+(state.candidate.profile==='preparacion'?1:0));
      preparation ||= choice.id==='prepare';
      investigation ||= choice.id==='research';
      advertising ||= choice.id==='advertise';
      break;
    }
  }
  const works=Object.values(plan.staff).filter(item=>item.id!=='wait');
  const reason=mediation
    ? 'El equipo acerca a '+ally.name+(organization?' y refuerza '+(destinations.find(d=>d.id===province)?.name||'el territorio')+'.':'.')
    : state.turn===1&&works.length?'El equipo prepara tu primera salida.'
    : organization?'El equipo refuerza el territorio.'
    : preparation?'El equipo prepara tu próxima intervención.'
    : works.length?'El equipo afina la campaña.':'El equipo conserva recursos.';
  const cost=validatePlan(state,plan,bundle).cost;
  const reservePurpose=visitReserve>=pactReserve&&visitReserve>0?'otra visita'
    :Number.isFinite(reserveBudget)?'la reserva elegida':'una contraoferta';
  const margin=reserve?(state.parties.P1.budget-cost.budget>=reserve
    ?' Guardamos margen para '+reservePurpose+'; puedes cambiar las tareas.'
    :' La jugada elegida deja menos de '+reserve+' de caja para '+reservePurpose+'.'):'';
  const result=legalResult(state,bundle,plan,reason+margin);
  return {...result,reserveBudget:reserve,remainingBudget:state.parties.P1.budget-result.cost.budget,
    agreementAdvice:mediation&&ally===ownAlly?agreement:null};
}

export function suggestPactOffers(state,originalBundle,{limit=3}={}) {
  const count=Math.max(0,Math.min(3,Number.isFinite(limit)?Math.floor(limit):3));
  if(!count||!state.electionResult||state.negotiation?.proponent!=='P1'||state.negotiation.stage!=='offer')return [];
  const bundle=resolveCampaignBundle(originalBundle,state);
  const ownIdeal=idealFor(state,bundle,'P1');
  const allies=publicAllies(state,bundle);
  const closest=allies[0];
  const offers=allOffers(bundle.config).map(offer=>{
    const preview=getNegotiationPreview(state,bundle,offer,'yes');
    if(!preview)return null;
    const requiresReview=state.commitments.some(id=>offer[bundle.config.topics.findIndex(t=>t.id===id)]<bundle.config.negotiation.commitmentMinUnits);
    const {yes,no,abstain}=preview.totals;
    return {offer:[...offer],yes,no,abstain,requiresReview,
      supporters:Object.entries(preview.votes).filter(([id,vote])=>id!=='P1'&&vote==='yes').map(([id])=>id),
      ownDistance:distance(offer,ownIdeal),allyDistance:distance(offer,closest?.policyIdeal||[]),
      passesFirst:yes>=176,passesSecond:yes>no,
      needsSecondBallot:yes<176&&yes>no,
      passes:preview.ballot===2?yes>no:yes>=176};
  }).filter(Boolean);
  const identifier=item=>item.offer.join('-');
  const tie=(a,b)=>identifier(a).localeCompare(identifier(b));
  const viability=(a,b)=>Number(b.passesFirst)-Number(a.passesFirst)||Number(b.passesSecond)-Number(a.passesSecond);
  const protectedOffers=[...offers].filter(item=>!item.requiresReview)
    .sort((a,b)=>viability(a,b)||b.yes-a.yes||a.ownDistance-b.ownDistance||tie(a,b));
  const maximum=[...offers].sort((a,b)=>viability(a,b)||Number(a.requiresReview)-Number(b.requiresReview)||b.yes-a.yes
    ||b.abstain-a.abstain||a.ownDistance-b.ownDistance||tie(a,b));
  const closer=[...offers].sort((a,b)=>a.allyDistance-b.allyDistance||Number(a.requiresReview)-Number(b.requiresReview)
    ||b.yes-a.yes||tie(a,b));
  const selected=[],seen=new Set();
  const add=(item,label,colorPartyId)=>{
    if(!item||seen.has(identifier(item))||selected.length>=count)return;
    seen.add(identifier(item));
    const {ownDistance,allyDistance,...publicFields}=item;
    selected.push({id:identifier(item),label,colorPartyId,...publicFields});
  };
  add(protectedOffers[0],'Mantener tus prioridades','P1');
  add(maximum.find(item=>!seen.has(identifier(item))),'Buscar más apoyos',maximum[0]?.supporters[0]||'P1');
  add(closer.find(item=>!seen.has(identifier(item))),'Acercar a '+(closest?.name||'un aliado'),closest?.id||'P1');
  for(const item of maximum)add(item,'Otra vía de acuerdo',item.supporters[0]||'P1');
  return selected;
}

export function turnSummary(state,bundle) {
  const project=entry=>({
    partyId:entry.partyId||'P1',actorId:entry.actorId||null,actionId:entry.actionId||null,
    target:entry.target??null,title:entry.title||'Jugada de campaña',
    changes:(entry.changes||[]).map(change=>({...change})),
  });
  const entries=(state.lastTransition?.entries||[]).filter(entry=>entry.actionId);
  const candidateEntry=entries.find(entry=>entry.actorId==='candidate')||null;
  const candidate=candidateEntry?project(candidateEntry):null;
  const team=entries.filter(entry=>state.selectedStaff.includes(entry.actorId)).map(project);
  const revealed=state.lastTransition?.rivalMoves
    ||(state.timeline||[]).filter(entry=>entry.kind==='rival'&&entry.turn===state.turn);
  const rivals=revealed.filter(entry=>entry.partyId!=='P1').slice(0,5).map(project);
  const priority={visit:['modelImpact'],interview:['modelImpact'],contrast:['modelImpact','relation'],
    fundraise:['budget'],rest:['energy'],rehearse:['readiness']};
  let change=null;
  for(const stat of priority[candidate?.actionId]||[]) {
    change=candidate?.changes.find(item=>item.stat===stat&&(stat==='modelImpact'||Number(item.delta)!==0));
    if(change)break;
  }
  if(!change)change=candidate?.changes.find(item=>['budget','energy','readiness','reputation','relation'].includes(item.stat)&&Number(item.delta)!==0)||null;
  const reward=change?{stat:change.stat,delta:Number(change.delta),placeId:change.target||candidate.target||null}:null;
  return {candidate,team,rivals,reward};
}
