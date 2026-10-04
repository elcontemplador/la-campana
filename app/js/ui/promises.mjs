import {resolveCampaignBundle} from '../core/campaign.mjs';
import {campaignIssue} from './issue-cases.mjs';
import {economicDilemma} from './economic-dilemma.mjs';
import {neighbourQuestion} from './neighbour-questions.mjs';

const requests = {
  'sanidad-espera': 'la espera de Carmen',
  'escuela-infantil': 'la plaza infantil de Raúl y Eva',
  cuidados: 'la ayuda a domicilio que espera Andrés',
  autonomos: 'la apertura del taller de Marta',
  'primer-empleo': 'el primer empleo de Dani',
  energia: 'la factura eléctrica y los turnos de la fábrica',
};
const statuses = new Set(['open', 'fulfilled', 'reduced', 'missed']);
const recordedPromise = (entry, id) => entry.changes?.some(c => c.stat === 'promise' && c.target === id);

// Resolve the recorded public option, not an entry's free-form prose or a draft.
function publicOption(entry, bundle, turn) {
  if (!entry || entry.kind !== 'event' || entry.partyId && entry.partyId !== 'P1'
    || !Number.isSafeInteger(entry.turn) || entry.turn < 1 || entry.turn > turn) return null;
  const event = bundle.content.events.find(e => e.id === entry.eventId && e.turn === entry.turn);
  return event?.options?.find(o => o.id === entry.optionId) || null;
}

function subject(state, bundle, entry, promise, past) {
  if(promise.id==='C1_REPLY'&&promise.target==='C1'){
    const question=neighbourQuestion(state,bundle,entry.eventId,entry.turn);
    if(question){const {name,...content}=question;return {...content,personName:name,sourceEntryId:entry.id,sourceEventId:entry.eventId};}
  }
  if(['0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)&&promise.id==='C2_REVIEW'&&promise.target==='C2'){
    const origin=entry.eventId==='E04'?entry:entry.eventId==='E10'?past.findLast(e=>e.turn<entry.turn
      &&e.eventId==='E04'&&publicOption(e,bundle,entry.turn)):null;
    const story=origin?economicDilemma(state,bundle,{turn:origin.turn}):null;
    if(story?.economicDecision)return {...story.economicDecision,situation:story.shortBody,
      sourceEntryId:origin.id,sourceEventId:'E04'};
  }
  if (promise.id === 'C2_REVIEW' && promise.target === 'C2' && entry.eventId === 'E10') {
    if(['0.8.3','0.8.4','0.8.5'].includes(state.rulesVersion)&&['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)){
      const provinceId=past.findLast(e=>e.turn<entry.turn&&Number.isSafeInteger(e.turn)&&e.turn>0
        &&typeof e.id==='string'&&e.id.length>0&&(!e.partyId||e.partyId==='P1')&&e.kind==='plan'
        &&e.actorId==='candidate'&&e.actionId==='visit'
        &&bundle.provinces.districts.some(p=>p.id===e.target))?.target||state.initialSetup?.province;
      const issue=campaignIssue(state,bundle,{topicId:'T3',sceneKey:'E10',provinceId});
      if(issue&&requests[issue.id])return {request:requests[issue.id],question:issue.objection,
        proposal:issue.brief,situation:issue.situation,delivery:`una explicación sobre ${requests[issue.id]}`,
        explanation:`Mantengo mi propuesta de ${issue.brief}. ${issue.limit}`,
        caseId:issue.id,sourceEntryId:entry.id,sourceEventId:'E10'};
    }
    return {request: 'el alcance de la nota compartida',
      question: '¿Qué recoge la nota conjunta y qué queda pendiente de aclarar?',
      proposal: 'Precisar el trabajo realizado y sus límites en la nota compartida',
      situation: 'Taller Cívico quiere acordar qué cuenta la nota sobre vuestro trabajo.',
      delivery: 'una aclaración sobre el alcance de la nota compartida'};
  }
  const topicId = promise.id === 'C1_REPLY' && promise.target === 'C1'
    && ['E02', 'E03'].includes(entry.eventId) ? 'T2'
    : promise.id === 'C2_REVIEW' && promise.target === 'C2' && entry.eventId === 'E04' ? 'T3' : null;
  if (!topicId) return null;
  const provinceId = past.findLast(e => e.turn < entry.turn && e.kind === 'plan'
    && e.actorId === 'candidate' && e.actionId === 'visit')?.target || state.initialSetup?.province;
  const issue = campaignIssue(state, bundle, {topicId, sceneKey: entry.eventId, provinceId});
  const request = requests[issue?.id];
  if (!request) return null;
  return {request, question: issue.question, proposal: issue.proposal, situation: issue.situation,
    delivery: `una ${promise.id === 'C1_REPLY' ? 'respuesta' : 'aclaración'} sobre ${request}`};
}

// Presentation only. Reconstruct a thread from its original promise_open and
// actual promise changes; a later ratification cannot replace that origin.
export function promiseThreads(state, sourceBundle) {
  if (!state || !Number.isSafeInteger(state.turn) || state.turn < 1
    || !Array.isArray(state.promises) || !Array.isArray(state.timeline)) return [];
  const bundle = resolveCampaignBundle(sourceBundle, state);
  const past = state.timeline.filter(e => Number.isSafeInteger(e.turn) && e.turn >= 1 && e.turn <= state.turn);
  const seen = new Set(), threads = [];
  for (const promise of state.promises) {
    if (!promise || seen.has(promise.id) || !statuses.has(promise.status)
      || !Number.isSafeInteger(promise.dueTurn)) continue;
    const entry = past.find(e => e.id === promise.openedBy);
    const option = publicOption(entry, bundle, state.turn);
    const opening = option?.effects?.find(e => e.type === 'promise_open' && e.id === promise.id
      && e.target === promise.target && e.dueTurn === promise.dueTurn);
    const name = bundle.config.civilActors.find(c => c.id === promise.target)?.name;
    if (!opening || !name || !recordedPromise(entry, promise.id) || entry.turn > promise.dueTurn) continue;
    const content = subject(state, bundle, entry, promise, past);
    if (!content) continue;
    let status = 'open', closedTurn = null;
    for (const later of past.slice(past.indexOf(entry) + 1)) {
      if (later.turn < entry.turn || !recordedPromise(later, promise.id)) continue;
      const closing = publicOption(later, bundle, state.turn)?.effects?.find(e => e.type === 'promise_close'
        && (e.id === promise.id || e.id === 'ALL_OPEN') && statuses.has(e.status) && e.status !== 'open');
      if (closing) {status = closing.status; closedTurn = later.turn; break;}
    }
    // The engine also expires an open response at the campaign's last agenda.
    // Older/partial records may lack closedTurn: do not invent an E11 response.
    if (status === 'open' && promise.status === 'missed' && state.turn >= bundle.config.turns
      && ['debrief', 'election', 'negotiation', 'ending'].includes(state.phase)
      && past.some(e => e.kind === 'plan' && e.actorId === 'candidate' && e.turn === bundle.config.turns)) {
      status = 'missed'; closedTurn = bundle.config.turns;
    }
    seen.add(promise.id);
    threads.push({id: promise.id, target: promise.target, name, entryId: entry.id,
      openedTurn: entry.turn, dueTurn: promise.dueTurn, status, closedTurn,
      pendingAtTurnStart: entry.turn < state.turn && promise.dueTurn >= state.turn
        && (status === 'open' || closedTurn === state.turn), ...content});
  }
  return threads;
}
