import {compareId, distance, fail} from './utils.mjs';
import {validOffer} from './scenario.mjs';
import {resolveCampaignBundle} from './campaign.mjs';

export function idealFor(state, bundle, partyId) {
  return partyId === 'P1' ? bundle.config.topics.map(t => state.commitments.includes(t.id) ? 3 : 0)
    : bundle.config.parties.find(p => p.id === partyId).policyIdeal;
}

// A participating campaign can open a conversation, never prescribe the vote.
export function dialogueRelation(state,config,proponent,voter,playerVote){
 const direct=state.parties[voter].relations[proponent]??0;
 const rule=config.negotiation.dialogueBridge;
 const participates=playerVote==='yes'&&proponent!=='P1'&&voter!=='P1'
  &&state.electionResult.national.seatsByParty.P1>0;
 const prepared=rule&&state.parties.P1.relations[proponent]>=rule.minPlayerRelation
  &&state.parties.P1.relations[voter]>=rule.minPlayerRelation;
 const mediated=participates&&prepared&&direct>=rule.minDirectRelation
  ?Math.min(state.parties.P1.relations[proponent],state.parties.P1.relations[voter])-rule.relationDiscount:direct;
 const effective=Math.max(direct,mediated);
 return {direct,effective,bridge:effective>direct};
}

export function evaluateSupport(state, bundle, proponent, offer, playerVote = 'no') {
  bundle = resolveCampaignBundle(bundle, state);
  const c = bundle.config;
  const n = c.negotiation;
  const seats = state.electionResult.national.seatsByParty;
  const votes = {};
  const details = {};
  for (const p of c.parties) {
    const id = p.id;
    if (id === proponent) {votes[id] = 'yes'; details[id] = {score: null, reason: 'Presenta el acuerdo'}; continue;}
    if (id === 'P1') {votes[id] = playerVote; details[id] = {score: null, reason: 'Tu decisión'}; continue;}
    const dialogue=dialogueRelation(state,c,proponent,id,playerVote);
    const relation = dialogue.effective;
    if (relation < n.minRelationForAutomaticSupport) {
      votes[id] = 'no'; details[id] = {score: null, reason: `Relación ${relation}/${n.minRelationForAutomaticSupport}: falta preparar el acuerdo`}; continue;
    }
    if (p.eligibility !== 'all' && offer[3] < n.territorialMinimum) {
      votes[id] = 'no'; details[id] = {score: null, reason: 'Pide más prioridad territorial'}; continue;
    }
    const rivalCost = p.eligibility === 'all' ? n.rivalryCostNational : n.rivalryCostTerritorial;
    const leadership = Math.min(n.leaderSeatDeficitMaxPenalty,
      Math.floor(Math.max(0, seats[id] - seats[proponent]) / n.leaderSeatDeficitDivisor));
    const disagreements = c.topics.filter(t => state.parties[id].positions[t.id] !== state.parties[proponent].positions[t.id]).length;
    const score = n.baseAcceptance - distance(offer, idealFor(state, bundle, id)) * n.distanceMultiplier
      + relation - rivalCost - leadership - disagreements * n.stanceDisagreementPenalty
      - (disagreements >= n.broadDisagreementThreshold ? n.broadDisagreementPenalty : 0);
    votes[id] = score >= n.yesThreshold ? 'yes' : score >= n.abstainThreshold ? 'abstain' : 'no';
    const reason=score>=n.yesThreshold?'Prioridades y relación suficientes'
      :score>=n.abstainThreshold?'Acepta facilitar sin entrar en el acuerdo':'El acuerdo no compensa sus diferencias';
    details[id] = {score,...(dialogue.bridge?{bridge:{via:'P1',direct:dialogue.direct,effective:relation}}:{}),
      reason:(dialogue.bridge?`Tu campaña abre el diálogo (relación ${dialogue.direct} → ${relation}). `:'')+reason};
  }
  const totals = {yes: 0, no: 0, abstain: 0};
  for (const [id, vote] of Object.entries(votes)) totals[vote] += seats[id];
  return {proponent, offer: [...offer], votes, totals, details};
}

export function allOffers(config) {
  const offers = [];
  for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) for (let c = 0; c <= 3; c++) {
    const offer = [a, b, c, config.negotiation.topicsUnits - a - b - c];
    if (validOffer(offer, config)) offers.push(offer);
  }
  return offers;
}

export function chooseOffer(state, bundle, proponent) {
  bundle = resolveCampaignBundle(bundle, state);
  const seats = state.electionResult.national.seatsByParty;
  const ideal = idealFor(state, bundle, proponent);
  const meta = bundle.config.parties.find(p => p.id === proponent);
  const offers = allOffers(bundle.config).filter(offer => proponent === 'P1' || meta.defaultCommitments.every(id =>
    offer[bundle.config.topics.findIndex(t => t.id === id)] >= bundle.config.negotiation.rivalCommitmentMinUnits));
  return offers.map(offer => {
    const invitesPlayer = proponent !== 'P1' && state.parties[proponent].relations.P1 >= bundle.config.negotiation.minRelationForAutomaticSupport
      && state.commitments.every(id => offer[bundle.config.topics.findIndex(t => t.id === id)] >= bundle.config.negotiation.commitmentMinUnits);
    const preview = evaluateSupport(state, bundle, proponent, offer,invitesPlayer?'yes':'no');
    const support = Object.entries(preview.votes).reduce((s, [id, vote]) => s + (id !== 'P1' && vote === 'yes' ? seats[id] : 0), 0);
    const possibleSupport=preview.totals.yes,no=preview.totals.no;
    return {offer, support, possibleSupport, no, first:possibleSupport>=176, second:possibleSupport>no,distance: distance(offer, ideal)};
  }).sort((a, b) => Number(b.first)-Number(a.first) || Number(b.second)-Number(a.second) || b.possibleSupport - a.possibleSupport || b.support - a.support || a.distance - b.distance || compareId(a.offer.join(''), b.offer.join('')))[0].offer;
}

export function startNegotiation(state, bundle) {
  bundle = resolveCampaignBundle(bundle, state);
  const seats = state.electionResult.national.seatsByParty;
  const tie = bundle.config.negotiation.seatTieOrder;
  const rivals = bundle.config.parties.filter(p => p.id !== 'P1' && seats[p.id] > 0).map(p => p.id)
    .sort((a, b) => seats[b] - seats[a] || tie.indexOf(a) - tie.indexOf(b));
  const ranked = [...rivals, ...(seats.P1 > 0 ? ['P1'] : [])]
    .sort((a, b) => seats[b] - seats[a] || tie.indexOf(a) - tie.indexOf(b));
  const proponents = bundle.config.negotiation.playerFirstProposal && seats.P1 > 0
    ? ['P1', ...rivals.slice(0, 2)] : ranked.slice(0, 3);
  state.negotiation = {proponents, index: 0, proponent: proponents[0], offer: null, ballot: 1,
    stage: proponents[0] === 'P1' ? 'offer' : 'vote', history: [], exchanges: []};
  if (proponents[0] !== 'P1') state.negotiation.offer = chooseOffer(state, bundle, proponents[0]);
}

export function getNegotiationPreview(state, bundle, offer = null, playerVote = 'no') {
  bundle = resolveCampaignBundle(bundle, state);
  if (!state.negotiation || !state.electionResult) return null;
  const proposed = offer ?? state.negotiation.offer ?? idealFor(state, bundle, state.negotiation.proponent);
  if (!validOffer(proposed, bundle.config) || !['yes', 'no', 'abstain'].includes(playerVote)) return null;
  return {...evaluateSupport(state, bundle, state.negotiation.proponent, proposed, playerVote), ballot: state.negotiation.ballot};
}

export function counterofferPreview(state,originalBundle,offer,target){
 const bundle=resolveCampaignBundle(originalBundle,state),n=state.negotiation,c=bundle.config;
 const cost=c.negotiation.counterofferBudgetCost;
 if(state.phase!=='negotiation'||n?.stage!=='vote'||n.ballot!==1||n.exchanges.some(e=>e.proponent===n.proponent))
  return fail('EXCHANGE_UNAVAILABLE','Hay un intercambio por candidatura antes de la primera votación.');
 if(!validOffer(offer,c)||!n.offer||offer.reduce((sum,v,i)=>sum+Math.abs(v-n.offer[i]),0)!==2)
  return fail('INVALID_COUNTEROFFER','La contraoferta mueve una unidad entre dos temas.');
 if(target==='P1'||!c.parties.some(p=>p.id===target)||!state.electionResult.national.seatsByParty[target]||(n.proponent!=='P1'&&target!==n.proponent))
  return fail('INVALID_PARTNER','Elige una candidatura que participe en este acuerdo.');
 if(state.parties.P1.budget<cost)return fail('INSUFFICIENT_BUDGET','La conversación necesita '+cost+' de caja. Puedes votar sin negociarla.');
 const relation=state.parties.P1.relations[target];
 const targetMeta=c.parties.find(p=>p.id===target);
 const desired=n.proponent==='P1'?idealFor(state,bundle,target):idealFor(state,bundle,'P1');
 const improvement=distance(n.offer,desired)-distance(offer,desired);
 const keeps=n.proponent==='P1'||targetMeta.defaultCommitments.every(id=>offer[c.topics.findIndex(t=>t.id===id)]>=c.negotiation.rivalCommitmentMinUnits);
 // An own offer cannot manufacture goodwill by first presenting a worse programme.
 const requiredRelation=c.negotiation.minRelationForAutomaticSupport-(n.proponent==='P1'?0:1);
 const accepted=relation>=requiredRelation&&improvement>0&&keeps;
 const relationBonus=accepted&&n.proponent!=='P1'?c.negotiation.counterofferRelationBonus:0;
 const simulated=structuredClone(state);
 if(accepted){
  const newRelation=Math.min(c.resources.relation.max,relation+relationBonus);
  simulated.parties.P1.relations[target]=simulated.parties[target].relations.P1=newRelation;
 }
 const before=getNegotiationPreview(state,bundle,null,'yes');
 const after=getNegotiationPreview(simulated,bundle,accepted?offer:n.offer,'yes');
 const reason=accepted?'Acepta mover una prioridad y retomar la conversación. Los votos dependen del conjunto del acuerdo.'
  :relation<requiredRelation?'Falta preparar la relación durante la campaña para negociar esta oferta.'
  :!keeps?'La propuesta recorta una prioridad que esa candidatura se comprometió a conservar.'
  :'La propuesta no acerca las prioridades de quien recibe la concesión.';
 return {ok:true,accepted,cost,target,relationBonus,offer:[...offer],originalOffer:[...n.offer],before,after,reason,
  reviewedCommitments:state.commitments.filter(id=>offer[c.topics.findIndex(t=>t.id===id)]<c.negotiation.commitmentMinUnits)};
}

export function counterofferOptions(state,bundle,{limit=3}={}){
 if(state.phase!=='negotiation'||state.negotiation?.stage!=='vote')return [];
 const n=state.negotiation,choices=[];
 for(const target of n.proponent==='P1'?bundle.config.parties.filter(p=>p.id!=='P1').map(p=>p.id):[n.proponent]){
  for(let from=0;from<n.offer.length;from++)for(let to=0;to<n.offer.length;to++){
   if(from===to||n.offer[from]<=0||n.offer[to]>=bundle.config.negotiation.maxUnitsPerTopic)continue;
   const offer=[...n.offer];offer[from]--;offer[to]++;
   const view=counterofferPreview(state,bundle,offer,target);
   if(view.ok)choices.push({...view,id:target+':'+offer.join('-'),from,to});
  }
 }
 choices.sort((a,b)=>Number(b.accepted)-Number(a.accepted)||(b.after.totals.yes-b.after.totals.no)-(a.after.totals.yes-a.after.totals.no)||a.reviewedCommitments.length-b.reviewedCommitments.length||a.id.localeCompare(b.id));
 const seen=new Set();
 return choices.filter(v=>{if(seen.has(v.target))return false;seen.add(v.target);return true;}).slice(0,limit);
}
