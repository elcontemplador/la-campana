// Narrative for a valid current investiture preview. This never commits a vote.
import {resolveCampaignBundle} from '../core/campaign.mjs';
import {getNegotiationPreview} from '../core/negotiation.mjs';
import {meetingAgenda} from './meeting-agenda.mjs';

const levels = ['Fuera del acuerdo', 'Atención limitada', 'Prioridad', 'Máxima prioridad'];
const topicList = topics => topics.map(t => t.name.toLowerCase()).join(' y ');

export function pactStory(state, sourceBundle, {offer = null, playerVote = 'no'} = {}) {
  if (!state || state.phase !== 'negotiation') return null;
  const bundle = resolveCampaignBundle(sourceBundle, state);
  const preview = getNegotiationPreview(state, bundle, offer, playerVote);
  if (!preview) return null;
  const {config} = bundle, proponent = config.parties.find(p => p.id === preview.proponent);
  const ownOffer = preview.proponent === 'P1';
  const protectedUnits = config.negotiation.commitmentMinUnits;
  const reviewed = config.topics.filter((t, i) => state.commitments.includes(t.id) && preview.offer[i] < protectedUnits);
  const reviewedTopics = reviewed.map(t => t.id);
  const nominalCost = ownOffer ? reviewed.length * config.negotiation.brokenCommitmentReputationCost : 0;
  const reputationCost = Math.min(nominalCost, Math.max(0, state.parties.P1.reputation - config.resources.reputation.min));
  const priorities = config.topics.filter(t => state.commitments.includes(t.id));
  const focus = config.topics.map((t, i) => ({topicId: t.id, name: t.name, units: preview.offer[i],
    levelLabel: levels[preview.offer[i]],
    position: t.poles.find(p => p.id === (ownOffer ? state.parties.P1.positions[t.id] : proponent.positions[t.id]))?.label || t.name,
    ownPriority: state.commitments.includes(t.id),
    proponentPriority: ownOffer ? state.commitments.includes(t.id) : proponent.defaultCommitments.includes(t.id)}));
  let text;
  if (!reviewed.length) text = `El reparto mantiene tus prioridades de ${topicList(priorities)} con al menos ${protectedUnits} unidades cada una.`;
  else if (ownOffer) text = `Recortas ${reviewed.length === 1 ? 'tu prioridad' : 'tus prioridades'} de ${topicList(reviewed)} por debajo de ${protectedUnits} unidades. Si logras la investidura, pierdes ${reputationCost} de reputación.`;
  else text = `Este acuerdo reduce la atención a ${reviewed.length === 1 ? 'tu prioridad' : 'tus prioridades'} de ${topicList(reviewed)}. Tú decides si lo apoyas.`;

  const parties = config.parties.map(p => {
    const seats = state.electionResult.national.seatsByParty[p.id];
    const reason = preview.details[p.id].reason;
    const detail = preview.details[p.id];
    let shortReason;
    if (seats === 0) shortReason = 'Sin escaños en este Congreso.';
    else if (p.id === preview.proponent) shortReason = 'Presenta el acuerdo.';
    else if (p.id === 'P1') shortReason = `Tu decisión: ${preview.votes.P1 === 'yes' ? 'sí' : preview.votes.P1 === 'abstain' ? 'abstención' : 'no'}.`;
    else if (detail.reason.startsWith('Relación ')) shortReason = `Falta preparar la confianza (${detail.reason.match(/^Relación ([^:]+):/)?.[1] || 'relación insuficiente'}).`;
    else if (detail.reason === 'Pide más prioridad territorial') shortReason = 'Pide más prioridad territorial.';
    else shortReason = `${detail.bridge ? 'Tu diálogo le acerca. ' : ''}${preview.votes[p.id] === 'yes'
      ? 'Programa y confianza suficientes para apoyar.' : preview.votes[p.id] === 'abstain'
        ? 'Facilita con una abstención.' : 'El acuerdo no compensa sus diferencias.'}`;
    let ask = '', agendaTopic = null;
    if (p.id === 'P1') ask = ownOffer ? 'Presentas este reparto; tu candidatura vota sí.'
      : `Tu voto es ${preview.votes.P1 === 'yes' ? 'sí' : preview.votes.P1 === 'abstain' ? 'abstención' : 'no'}; puedes decidirlo sin cambiar tu programa.`;
    else if (p.id !== preview.proponent && seats > 0) {
      const deficit = config.topics.map((t, i) => ({topic: t, units: p.policyIdeal[i] - preview.offer[i]}))
        .sort((a, b) => b.units - a.units || config.topics.indexOf(a.topic) - config.topics.indexOf(b.topic))[0];
      if (deficit.units > 0) agendaTopic = deficit.topic.id;
      ask = deficit.units > 0 ? `Más atención a ${deficit.topic.name.toLowerCase()} podría acercar su programa; no asegura su voto.`
        : 'No falta atención frente a su reparto preferido; pesan también relación, diferencias y liderazgo.';
    } else if (seats === 0) ask = 'Su posición no suma votos a esta investidura.';
    else ask = 'Presenta este acuerdo; conserva su propio programa.';
    const antecedent = (state.timeline || []).findLast(e => e.turn <= state.turn && (e.changes || []).some(c =>
      c.stat === 'relation' && Number.isFinite(c.delta) && c.delta !== 0 &&
      ((['plan', 'event', 'negotiation'].includes(e.kind) && c.target === p.id)
        || (e.kind === 'rival' && e.partyId === p.id && c.target === 'P1'))));
    return {partyId: p.id, name: p.name, seats, vote: preview.votes[p.id], reason, shortReason, ask,
      publicAgenda: p.id!==preview.proponent&&seats>0?meetingAgenda(state,bundle,p.id,{topicId:agendaTopic,speakerId:preview.proponent}):null,
      ...(antecedent ? {antecedent: {entryId: antecedent.id, turn: antecedent.turn,
        label: `${antecedent.kind === 'negotiation' ? 'Relación en la investidura' : 'Relación durante la campaña'} · turno ${antecedent.turn}`}} : {})};
  });
  return {proponent: preview.proponent, offer: [...preview.offer],
    headline: ownOffer ? '¿Qué mantienes para poder gobernar?' : `${proponent.name} pone su acuerdo sobre la mesa`,
    focus, tradeoff: {text, reputationCost, reviewedTopics}, parties,
    totals: {...preview.totals}, ballot: preview.ballot};
}
