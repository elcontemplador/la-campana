import {resolveCampaignBundle} from '../core/campaign.mjs';
import {playerSeatOpportunity} from '../core/polls.mjs';
import {replayRoute} from './ending-route.mjs';

const number = value => Number(value).toLocaleString('es-ES');

function ownVote(state) {
  const history = state.negotiation?.history || [];
  const votes = history.filter(v => v.proponent === 'P1' && v.totals);
  return votes.findLast(v => v.ballot === 2) || votes.at(-1) || null;
}

function closestSeat(state, bundle) {
  return bundle.provinces.districts.map(district => {
    const result = state.electionResult.districts[district.id];
    if (!result) return null;
    const opportunity = playerSeatOpportunity(bundle, district, result, state.seed);
    if (!opportunity.attack) return null;
    return {district, votes: opportunity.attack.votesNeeded,
      against: opportunity.attack.against};
  }).filter(Boolean).sort((a, b) => a.votes - b.votes
    || a.district.id.localeCompare(b.district.id))[0] || null;
}

// The story uses recorded ballots and the completed election. It never invents
// a campaign effect or attributes a later relationship to an earlier vote.
export function finalStory(state, originalBundle) {
  if (state?.phase !== 'ending' || !state.electionResult) return null;
  const bundle = resolveCampaignBundle(originalBundle, state);
  const partyName = id => bundle.config.parties.find(p => p.id === id)?.name || id;
  const vote = ownVote(state), type = state.outcome?.type;
  let headline = type === 'government' ? 'Tu campaña reúne una mayoría.'
    : type === 'support' ? 'Tus escaños entran en el acuerdo.'
    : type === 'opposition' ? 'Tu campaña sigue desde la oposición.'
    : 'El Congreso termina sin acuerdo.';
  const details = [];
  if (vote) {
    const {yes, no, abstain} = vote.totals;
    if (vote.invested) {
      details.push(`Tu propuesta fue investida con ${number(yes)} síes, ${number(no)} noes y ${number(abstain)} abstenciones.`);
    } else if (vote.ballot === 2) {
      const gap = no - yes;
      if (gap === 1) headline = 'Tu investidura se quedó a un voto.';
      else if (gap === 0) headline = 'Tu investidura terminó en empate.';
      details.push(`Tu propuesta perdió la segunda votación: ${number(yes)} síes frente a ${number(no)} noes. Necesitabas superar los ${number(no)} noes.`);
      // This is arithmetic with the recorded opposition held fixed, not a claim
      // that individual extra supporters were available in the simulation.
      const extra = Math.max(0, no - yes + 1);
      details.push(`Manteniendo los noes, ${extra === 1 ? 'faltaba 1 sí adicional' : `faltaban ${number(extra)} síes adicionales`}. Un cambio de no a sí mueve ambos lados de la votación.`);
    } else {
      details.push(`Tu propuesta reunió ${number(yes)} síes en la primera votación; faltaban ${number(Math.max(0, 176 - yes))} para la mayoría absoluta.`);
    }
  }
  const closingVote = state.outcome?.votes || state.negotiation?.history?.at(-1);
  if (closingVote?.invested && closingVote.proponent !== 'P1') {
    details.push(`${partyName(closingVote.proponent)} cerró su investidura con ${number(closingVote.totals.yes)} síes y ${number(closingVote.totals.no)} noes.`);
  }
  // Political priority comes from the accepted ballot in history. A later
  // relationship, forecast, or an unrecorded outcome cannot supply its facts.
  const win=(state.negotiation?.history||[]).findLast(v=>v.invested===true
    && Array.isArray(v.offer)&&v.offer.length===bundle.config.topics.length&&v.totals&&v.votes);
  const reduced=win?bundle.config.topics.filter((t,i)=>state.commitments.includes(t.id)
    && win.offer[i]<bundle.config.negotiation.commitmentMinUnits):[];
  const facilitators=win?Object.entries(win.votes).filter(([id,value])=>value==='abstain'
    && state.electionResult.national.seatsByParty[id]>0).map(([id])=>id):[];
  const bridgeParties=win?Object.keys(win.bridges||{}).filter(id=>bundle.config.parties.some(p=>p.id===id)):[];
  const ownSeats=state.electionResult.national.seatsByParty.P1||0;
  const pivotal=Boolean(type==='support'&&win?.votes.P1==='yes'&&(
    win.ballot===1?win.totals.yes-ownSeats<176:win.totals.yes-ownSeats<=win.totals.no));
  const topicNames=reduced.map(t=>t.name.toLowerCase()).join(' y ');
  let lead=null,retryAdvice=null;
  if(type==='government'&&win?.proponent==='P1'){
    if(reduced.length){
      headline=`Gobiernas recortando ${topicNames}.`;
      lead=`La investidura mantuvo menos de ${bundle.config.negotiation.commitmentMinUnits} unidades para ${topicNames}, una ${reduced.length===1?'prioridad':'parte de tus prioridades'} de campaña.`;
      retryAdvice={kind:'priorities',title:`Otro acuerdo: mantener ${topicNames}`,
        text:`Al repetir con la misma clave, conserva al menos ${bundle.config.negotiation.commitmentMinUnits} unidades en ${topicNames} y compara qué programa y relaciones facilitan otra mayoría. Esa vía también puede fracasar.`};
    }else{
      lead='Llegaste al Gobierno manteniendo las dos prioridades de campaña en el acuerdo.';
      retryAdvice={kind:'majority',title:'Otra mayoría con tu programa',text:'Al repetir con la misma clave, prepara otro interlocutor y compara las vías que conservan tus prioridades. Comprueba cómo cambian los apoyos y las abstenciones.'};
    }
    if(win.ballot===2&&win.totals.yes<176&&facilitators.length)
      lead+=` Las abstenciones de ${facilitators.map(partyName).join(' y ')} facilitaron la segunda votación.`;
  }else if(type==='support'&&win&&win.proponent!=='P1'&&win.votes.P1==='yes'){
    headline=pivotal?'Tus síes fueron necesarios para la investidura.':'Tus escaños participan en el acuerdo.';
    lead=pivotal?`Sin tus ${number(ownSeats)} síes, manteniendo los demás votos, ${partyName(win.proponent)} no alcanzaba la mayoría de esta votación.`
      :`Apoyaste la propuesta de ${partyName(win.proponent)}.${bridgeParties.length?' Tu diálogo también facilitó relaciones entre los socios.':''}`;
    if(reduced.length)lead+=` El acuerdo redujo la prioridad de ${topicNames}.`;
    retryAdvice={kind:'support',title:reduced.length?`Otro acuerdo: mantener ${topicNames}`:'Otro acuerdo: decidir qué facilitas',
      text:reduced.length?`Al repetir, compara una oferta que conserve al menos ${bundle.config.negotiation.commitmentMinUnits} unidades en ${topicNames}. Revisa quién la apoya y qué cambia al dar tus síes.`
        :'Al repetir con la misma clave, compara un programa distinto y qué relaciones necesitas preparar para apoyarlo. Tus síes, tu abstención y tu no pueden tener efectos distintos.'};
  }else if(vote&&!vote.invested&&vote.ballot===2&&vote.totals.no-vote.totals.yes<=5){
    retryAdvice={kind:'close-vote',title:'Otra mayoría: revisar los votos que faltaron',
      text:'Al repetir con la misma clave, compara el programa con el de un partido que votó no y prepara esa relación durante la campaña. Un acercamiento no garantiza su apoyo.'};
  }else if(type==='deadlock'){
    lead='Ninguna candidatura logró la investidura; los escaños no se convirtieron en un acuerdo.';
    retryAdvice={kind:'deadlock',title:'Otra ruta: abrir una puerta al acuerdo',
      text:'Al repetir con la misma clave, prepara un interlocutor y conserva caja para negociar. Compara un cambio de prioridad con sostener tu programa; ninguna opción asegura la investidura.'};
  }
  const nearest = closestSeat(state, bundle);
  let retry = null;
  if (nearest) {
    details.push(`${nearest.district.name}: ${number(nearest.votes)} votos propios adicionales habrían dado otro escaño, manteniendo los demás votos del recuento.`);
    const visits=(state.timeline||[]).filter(entry=>entry.kind==='plan'&&entry.actorId==='candidate'&&entry.actionId==='visit'&&entry.target===nearest.district.id&&entry.turn<=bundle.config.turns);
    const route=visits.length?replayRoute(state,originalBundle,nearest.district.id):null;
    retry = route ? {...route,action:'organize'} : {title: `Otra ruta: ${nearest.district.name}`,
      text: visits.length
        ? `Ya visitaste ${nearest.district.name} en ${visits.length===1?`el turno ${visits[0].turn}`:`los turnos ${visits.map(entry=>entry.turn).join(', ')}`}. Al repetir con la misma clave, cambia la distribución entre este destino y las demás provincias y compara el recuento.`
        : `Al repetir con la misma clave, prueba una visita a ${nearest.district.name} y compara su resultado con esta campaña. Allí estuvo tu siguiente escaño más cercano.`,
      action: 'visit', target: nearest.district.id};
  } else if (vote && !vote.invested) {
    retry = {title: 'Otra ruta: preparar el acuerdo',
      text: 'Al repetir, revisa los votos negativos de tu propuesta y prepara durante la campaña una relación con uno de esos partidos.'};
  }
  return {headline, details, retry, lead, retryAdvice:retryAdvice||retry,
    nearestSeat:nearest?{provinceId:nearest.district.id,name:nearest.district.name,votes:nearest.votes,against:nearest.against}:null,
    political:win?{winner:win.proponent,ballot:win.ballot,reducedTopics:reduced.map(t=>t.id),
      facilitators,pivotalFromRecordedVotes:pivotal,bridgeParties}:null};
}
