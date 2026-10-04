import {resolveCampaignBundle} from '../core/campaign.mjs';
import {resolvePriorityTopic} from '../core/topic-effects.mjs';
import {campaignIssue} from './issue-cases.mjs';

const subjects = Object.freeze({
  alquiler: 'el alquiler',
  turismo: 'los pisos turísticos',
  'vivienda-plazos': 'los permisos de vivienda',
  'sanidad-espera': 'la espera sanitaria',
  'escuela-infantil': 'las plazas infantiles',
  cuidados: 'la ayuda a domicilio',
  autonomos: 'abrir pequeños negocios',
  'primer-empleo': 'el primer empleo',
  energia: 'la factura eléctrica',
  financiacion: 'el dinero para los servicios',
  'transporte-rural': 'el autobús del pueblo',
  agua: 'el reparto del agua',
});

// A case is fixed by seed and the initial priority, not by the latest poll,
// map selection, mutable priorities or any rival's private campaign state.
export function launchStory(state, sourceBundle) {
  if (!['0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state?.contentVersion)) return null;
  const bundle = resolveCampaignBundle(sourceBundle, state);
  const event = bundle.content.events.find(item => item.id === 'E01');
  if (!event?.options) return null;
  const choices = ['launch_first', 'launch_second'].map((optionId, priorityIndex) => {
    const option = event.options.find(item => item.id === optionId);
    const effect = option?.effects.find(item => item.type === 'priority_support'
      && item.priorityIndex === priorityIndex);
    const topicId = resolvePriorityTopic(effect, state, bundle);
    if (!topicId) return null;
    const issue = campaignIssue(state, bundle, {topicId, sceneKey: `launch:${topicId}`,
      provinceId: state.initialSetup?.province});
    if (!issue || !subjects[issue.id]) return null;
    const subject = subjects[issue.id];
    return {optionId, priorityIndex, topicId, issue, subject, label: `Abrir con ${subject}`};
  });
  if (choices.some(choice => !choice) || choices[0].topicId === choices[1].topicId) return null;

  const entries = (state.timeline || []).filter(entry => entry?.kind === 'event'
    && entry.eventId === event.id && entry.turn === event.turn && entry.turn <= state.turn
    && (entry.turn < state.turn || state.phase !== 'event')
    && (!entry.partyId || entry.partyId === 'P1')
    && (!entry.actorId || entry.actorId === 'candidate')
    && typeof entry.id === 'string' && entry.id.length > 0
    && event.options.some(option => option.id === entry.optionId));
  const entry = entries.length === 1 ? entries[0] : null;
  const selected = choices.find(choice => choice.optionId === entry?.optionId);
  const confirmed = entry && (selected || entry.optionId === 'keep_interval') ? {
    entryId: entry.id, turn: entry.turn, optionId: entry.optionId,
    topicId: selected?.topicId || null, issue: selected?.issue || null,
    subject: selected?.subject || null,
    antecedent: {entryId: entry.id, turn: entry.turn,
      label: `${selected ? `Abriste con ${selected.subject}` : 'Reservaste el primer anuncio'} · turno ${entry.turn}`},
  } : null;
  return {choices, confirmed};
}
