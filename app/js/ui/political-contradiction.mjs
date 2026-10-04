// Content 0.7.1 and 0.8.0 share this story; earlier saves retain their own.
const cases = {
  T1: {
    '-1': {id: 'alquiler', programme: 'Limitaremos las subidas del alquiler',
      announcement: 'No pondremos límites a las subidas del alquiler', proposal: 'limitar las subidas del alquiler'},
    '1': {id: 'vivienda', programme: 'Daremos los permisos más rápido para construir pisos',
      announcement: 'No aceleraremos los permisos para construir pisos', proposal: 'dar los permisos más rápido para construir pisos'},
  },
  T2: {
    '-1': {id: 'sanidad-publica', programme: 'Contrataremos más profesionales en los centros públicos',
      announcement: 'No contrataremos más profesionales en los centros públicos', proposal: 'contratar más profesionales en los centros públicos'},
    '1': {id: 'citas-privadas', programme: 'La sanidad pública pagará citas privadas cuando haga falta',
      announcement: 'No pagaremos ninguna consulta en una clínica privada', proposal: 'pagar citas privadas desde la sanidad pública cuando haga falta'},
  },
  T3: {
    '-1': {id: 'ayudas-energia', programme: 'Daremos ayudas para que las fábricas ahorren energía',
      announcement: 'No daremos ayudas a las fábricas para ahorrar energía', proposal: 'dar ayudas para que las fábricas ahorren energía'},
    '1': {id: 'impuestos-luz', programme: 'Bajaremos los impuestos de la luz',
      announcement: 'Los impuestos de la luz se quedan como están', proposal: 'bajar los impuestos de la luz'},
  },
};
const hash = text => {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
  return value;
};
const publicPhases = new Set(['debrief', 'election', 'negotiation', 'ending']);

export function politicalContradiction(state, bundle, {turn = state?.turn} = {}) {
  if (!['0.7.1', '0.8.0', '0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state?.contentVersion) || typeof state.seed !== 'string'
    || !Number.isInteger(turn) || turn < 1 || turn > state.turn) return null;
  const positions = state.initialSetup?.positions || state.parties?.P1?.positions;
  const commitments = state.initialSetup?.commitments || state.commitments || [];
  const priorities = [...new Set(commitments)].filter(id => cases[id]
    && [-1, 1].includes(positions?.[id]) && bundle.config.topics.some(topic => topic.id === id)).sort();
  if (!priorities.length) return null;
  const programmeKey = Object.keys(cases).map(id => `${id}:${positions?.[id]}`).join('|');
  const topicId = priorities[hash(`${state.seed}|contradiction-071|${priorities.join(',')}|${programmeKey}`) % priorities.length];
  const position = positions[topicId], selected = cases[topicId][position];
  const eventTurn = bundle.content.events.find(event => event.id === 'E06')?.turn;
  const cutoff = publicPhases.has(state.phase) ? state.turn : state.turn - 1;
  const lastDecision = (state.timeline || []).findLast(entry => entry?.kind === 'event'
    && (!entry.partyId || entry.partyId === 'P1') && entry.eventId === 'E06'
    && entry.turn === eventTurn && entry.turn < turn && entry.turn <= cutoff
    && typeof entry.id === 'string' && entry.id.length > 0);
  const prior = lastDecision?.optionId === 'keep_claim' ? lastDecision : null;
  return {id: selected.id, topicId, position, programme: selected.programme,
    announcement: selected.announcement, proposal: selected.proposal,
    messages: [
      {id: 'programme', label: 'Tu programa', text: selected.programme},
      {id: 'announcement', label: 'El anuncio del acto', text: selected.announcement},
    ],
    priorEntryId: prior?.id || null, priorTurn: prior?.turn || null};
}
