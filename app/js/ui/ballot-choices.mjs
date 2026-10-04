import {resolveCampaignBundle} from '../core/campaign.mjs';
import {getNegotiationPreview} from '../core/negotiation.mjs';

// Describe the currently previewed ballot, never a later agreement or result.
export function ballotForecast(preview) {
  if(!preview||![1,2].includes(preview.ballot))return null;
  const {yes,no,abstain}=preview.totals||{};
  if(![yes,no,abstain].every(v=>Number.isInteger(v)&&v>=0))return null;
  if(preview.ballot===1) {
    const passes=yes>=176;
    return {passes,text:passes?'Alcanza 176 síes':yes>no?'Necesita segunda votación':'No alcanza la primera',
      detail:passes?'Mayoría absoluta para esta propuesta.':yes>no?'Este balance sí bastaría en segunda.':`Faltan ${176-yes} síes para la primera.`};
  }
  const passes=yes>no;
  return {passes,text:passes?'Más síes que noes':yes===no?'Empate: no basta':'Todavía no reúne mayoría',
    detail:passes?`Los síes superan a los noes en ${yes-no}.`:yes===no?'La segunda votación exige más síes que noes.':`Los noes superan a los síes en ${no-yes}.`};
}

// All three choices use the same public agreement and the selected rule set.
export function ballotChoices(state,sourceBundle) {
  const n=state?.negotiation;
  if(state?.phase!=='negotiation'||n?.stage!=='vote'||n.proponent==='P1')return null;
  const bundle=resolveCampaignBundle(sourceBundle,state),seats=state.electionResult?.national?.seatsByParty;
  if(!seats)return null;
  const previews=Object.fromEntries(['yes','no','abstain'].map(v=>[v,getNegotiationPreview(state,bundle,null,v)]));
  if(Object.values(previews).some(v=>!v||!ballotForecast(v)))return null;
  const bridgePartners=bundle.config.parties.filter(p=>p.id!=='P1'&&p.id!==n.proponent&&seats[p.id]>0
    &&previews.yes.details[p.id]?.bridge&&previews.yes.votes[p.id]!==previews.abstain.votes[p.id])
    .map(p=>({partyId:p.id,name:p.name,vote:previews.yes.votes[p.id],withoutBridgeVote:previews.abstain.votes[p.id]}));
  return {proponent:n.proponent,ballot:n.ballot,playerSeats:seats.P1,
    options:['yes','no','abstain'].map(vote=>({vote,totals:{...previews[vote].totals},forecast:ballotForecast(previews[vote]),
      bridgePartners:vote==='yes'?bridgePartners:[]}))};
}
