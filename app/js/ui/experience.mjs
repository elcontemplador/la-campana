// Presentation from recorded decisions only. Never changes a campaign or its log.
import {resolveCampaignBundle} from '../core/campaign.mjs';

const signed = value => value > 0 ? `+${value}` : String(value).replace('-', '−');
const deltaFor = (entry, stat) => (entry?.changes || []).filter(c => c.stat === stat)
  .reduce((sum, c) => sum + (Number.isFinite(c.delta) ? c.delta : 0), 0);

export function staffObservations(state, originalBundle) {
  if (!state || state.phase !== 'debrief') return [];
  const entries = (state.timeline || []).filter(e => e.turn === state.turn && e.kind === 'plan');
  const candidate = entries.findLast(e => e.actorId === 'candidate');
  if (!candidate) return [];
  const {config, provinces} = resolveCampaignBundle(originalBundle, state);
  const remaining = Math.max(0, config.turns - state.turn);
  const partyName = id => config.parties.find(p => p.id === id)?.name || id;
  const provinceName = id => provinces.districts.find(p => p.id === id)?.name || id;
  const prepared = deltaFor(candidate, 'readiness') < 0;
  return state.selectedStaff.map(staffId => {
    const task = entries.findLast(e => e.actorId === staffId);
    let text;
    if (!task && state.reservedStaff.includes(staffId)) {
      text = 'Mi tarea de hoy fue resolver la noticia; no hice otra tarea de campaña.';
    } else if (task?.actionId === 'mediate') {
      const gain = deltaFor(task, 'relation');
      text = gain > 0 ? `La reunión con ${partyName(task.target)} mejoró la confianza ${signed(gain)}. Su voto depende también del programa.`
        : `La reunión con ${partyName(task.target)} no aumentó la confianza; toca comprobar qué programa podría acercarnos.`;
    } else if (task?.actionId === 'prepare') {
      const gain = deltaFor(task, 'readiness');
      text = `El ensayo añadió ${gain} de preparación. ${prepared ? 'Tu intervención usó una ficha hoy.'
        : remaining ? 'Queda disponible para una próxima intervención.' : 'Ya no queda otra intervención para aprovecharla.'}`;
    } else if (task?.actionId === 'organize') {
      const gain = deltaFor(task, 'organization');
      text = gain > 0 ? `Dejé ${gain} equipo local en ${provinceName(task.target)}; trabajó en este cierre${remaining ? ` y quedan ${remaining} cierres más` : ', el último de campaña'}.`
        : `La organización en ${provinceName(task.target)} no pudo crecer más este turno.`;
    } else if (task?.actionId === 'research') {
      text = remaining ? `Afiné el sondeo de ${provinceName(task.target)}; puedes usarlo para decidir la próxima jugada.`
        : 'Afiné el último sondeo; la próxima pantalla ya será el recuento.';
    } else if (task?.actionId === 'advertise') {
      const support = (task.changes || []).filter(c => c.stat === 'support' && Number.isFinite(c.delta));
      text = support.some(c => c.delta > 0)
        ? 'La publicidad añadió alcance hoy; el sondeo incluye también lo que hicieron los rivales.'
        : support.length && support.every(c => c.delta === 0)
          ? 'La publicidad no aumentó el alcance registrado; conviene revisar dónde concentramos el esfuerzo.'
          : 'La publicidad quedó ejecutada; revisa sus cambios registrados junto al sondeo.';
    } else if (task?.actionId === 'outreach') {
      const gain = deltaFor(task, 'rapport');
      const name = config.civilActors.find(a => a.id === task.target)?.name || task.target;
      text = `El contacto con ${name} ${gain > 0 ? `mejoró la relación ${signed(gain)}` : 'no aumentó la relación'}. ${remaining ? 'Puede abrir nuevas conversaciones.' : 'La relación queda registrada al cerrar la campaña.'}`;
    } else if (candidate.actionId === 'rest') {
      const gain = deltaFor(candidate, 'energy');
      text = gain > 0 ? `El descanso recuperó ${gain} de energía${remaining ? '; podemos elegir el siguiente esfuerzo' : '; este era el último turno'}.`
        : 'El descanso no añadió energía porque ya estabas al máximo. Mi tarea no gastó caja.';
    } else if (candidate.actionId === 'fundraise') {
      const gain = deltaFor(candidate, 'budget'), reputation = deltaFor(candidate, 'reputation');
      text = `La recaudación añadió ${gain} de caja${reputation < 0 ? ` y costó ${Math.abs(reputation)} de reputación` : ''}. Mi tarea conservó recursos.`;
    } else if (candidate.actionId === 'interview') {
      text = `${prepared ? 'Tus medios aprovecharon una ficha de preparación.' : 'Has llevado tu mensaje a los medios.'} ${remaining ? 'La siguiente intervención puede buscar otro argumento.' : 'Ahora toca ver qué dejó la campaña.'}`;
    } else if (candidate.actionId === 'contrast') {
      const relation = deltaFor(candidate, 'relation');
      text = relation < 0 ? `El contraste de hoy redujo ${Math.abs(relation)} la confianza con ${partyName(candidate.target)}; cuenta para los pactos.`
        : 'El contraste de hoy ya está registrado; el historial permite revisar qué cambió.';
    } else {
      text = candidate.actionId === 'visit' ? `Visitaste ${provinceName(candidate.target)}; mi tarea conservó caja${remaining ? ' para lo que viene' : ' para negociar'}.`
        : 'Mi tarea conservó caja y disponibilidad este turno.';
    }
    return {staffId, text};
  });
}

export function debateOutcome(state, originalBundle) {
  if (!state || !['planning', 'debrief'].includes(state.phase)) return null;
  const bundle = resolveCampaignBundle(originalBundle, state);
  const debate = bundle.content.events.find(e => e.id === 'E07');
  if (debate?.stages?.length !== 3) return null;
  const entries = (state.timeline || []).filter(e => e.turn === state.turn && e.kind === 'event' && e.eventId === 'E07');
  if (entries.length !== 3 || !debate.stages.every((stage, index) => stage.options.some(o => o.id === entries[index].optionId))) return null;
  const labels = {budget: 'Caja', energy: 'Energía', readiness: 'Preparación', cohesion: 'Cohesión', reputation: 'Reputación'};
  const totals = new Map();
  for (const entry of entries) for (const change of entry.changes || []) {
    if (!Number.isFinite(change.delta) || ![...Object.keys(labels), 'support', 'relation'].includes(change.stat)) continue;
    const key = `${change.stat}:${change.target || 'P1'}`;
    const item = totals.get(key) || {stat: change.stat, target: change.target, delta: 0};
    item.delta += change.delta;
    totals.set(key, item);
  }
  const benefits = [], tradeoffs = [];
  for (const item of totals.values()) {
    if (!item.delta) continue;
    const name = bundle.config.parties.find(p => p.id === item.target)?.name || item.target;
    const place = bundle.provinces.districts.find(p => p.id === item.target)?.name || item.target;
    const text = item.stat === 'support' ? `${item.delta > 0 ? 'Más' : 'Menos'} alcance ${item.target === 'national' ? 'nacional' : `en ${place}`}`
      : item.stat === 'relation' ? `Confianza con ${name} ${signed(item.delta)}` : `${labels[item.stat]} ${signed(item.delta)}`;
    (item.delta > 0 ? benefits : tradeoffs).push({...item, text});
  }
  const reserved = [...new Set(entries.map(e => e.reservedStaff).filter(Boolean))];
  for (const id of reserved) tradeoffs.push({stat: 'staff', target: id, delta: -1,
    text: `${bundle.config.staff.find(s => s.id === id)?.name || id} dedicó su tarea al debate`});
  const support = [...totals.values()].filter(c => c.stat === 'support').reduce((sum, c) => sum + c.delta, 0);
  const title = support > 0 ? 'Sales del debate con más alcance' : support < 0 ? 'El debate te costó alcance' : 'El debate ha terminado';
  return {title, benefits, tradeoffs, rivalId: 'P2'};
}
