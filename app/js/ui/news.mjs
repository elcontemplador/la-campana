import {resolveCampaignBundle} from '../core/campaign.mjs';
import {promiseThreads} from './promises.mjs';

const names = {budget: 'Caja', energy: 'Energía', readiness: 'Preparación', cohesion: 'Cohesión', reputation: 'Reputación'};
const signed = n => n > 0 ? `+${n}` : String(n).replace('-', '−');

/** The latest resolved news, using recorded effects rather than predicted polls. */
export function newsOutcome(state, originalBundle) {
  if (!state || !['event', 'planning'].includes(state.phase)) return null;
  if (state.timeline.some(e => e.turn === state.turn && e.kind === 'plan')) return null;
  const entry = state.timeline.findLast(e => e.turn === state.turn && e.kind === 'event');
  if (!entry) return null;
  const bundle = resolveCampaignBundle(originalBundle, state);
  const threads = promiseThreads(state, originalBundle);
  const event = bundle.content.events.find(e => e.id === entry.eventId);
  const option = [event, ...(event?.stages ?? [])].flatMap(s => s?.options ?? []).find(o => o.id === entry.optionId);
  const actorName = id => bundle.config.civilActors.find(a => a.id === id)?.name ?? id;
  const partyName = id => bundle.config.parties.find(p => p.id === id)?.name ?? id;
  const provinceName = id => bundle.provinces.districts.find(d => d.id === id)?.name ?? id;
  const narrative = value => String(value ?? '').replace(/\{party:(P[1-4]|R[12])\}/g, (_, id) => partyName(id));
  const result = {entryId: entry.id, eventId: entry.eventId, optionId: entry.optionId, turn: entry.turn,
    title: entry.title, choice: narrative(option?.shortLabel ?? option?.label ?? entry.optionId),
    feedback: narrative(option?.shortFeedback ?? entry.body), benefits: [], tradeoffs: [], obligations: [], unchanged: [], reservedStaff: null};
  for (const [index, change] of (entry.changes ?? []).entries()) {
    const {stat, target, delta} = change;
    if (stat === 'promise') {
      const promise = state.promises.find(p => p.id === target);
      if (!promise) continue;
      const opened = promise.openedBy === entry.id;
      const status = opened ? 'open' : promise.status;
      const thread = threads.find(p => p.id === promise.id);
      const text = thread ? opened
        ? `${thread.name}: ${thread.delivery} pendiente para el turno ${promise.dueTurn}`
        : `${thread.name}: ${status === 'fulfilled' ? 'entregaste' : status === 'reduced' ? 'redujiste el alcance de' : 'quedó sin entregar'} ${thread.delivery}`
        : opened ? `${actorName(promise.target)}: respuesta pendiente para el turno ${promise.dueTurn}`
          : `${actorName(promise.target)}: ${status === 'fulfilled' ? 'entrega completada' : status === 'reduced' ? 'entrega reducida' : 'respuesta sin entregar'}`;
      result.obligations.push({stat, target, kind: 'promise', status, dueTurn: promise.dueTurn, text});
      continue;
    }
    if (!Number.isFinite(delta)) continue;
    // chooseOption records payment first, then effects. Never cancel a payment
    // against a separate recovery of the same resource.
    const payment = index < 2 && ['budget', 'energy'].includes(stat) && change.requested < 0;
    let label = names[stat];
    if (stat === 'support') label = target === 'national' ? 'Atractivo nacional' : `Atractivo en ${provinceName(target)}`;
    if (stat === 'organization') label = `Voluntarios en ${provinceName(target)}`;
    if (stat === 'relation') label = `Confianza con ${partyName(target)}`;
    if (stat === 'rapport') label = `Relación con ${actorName(target)}`;
    if (!label) continue;
    const text = stat === 'support' && delta ? `${delta > 0 ? 'Más' : 'Menos'} alcance ${target === 'national' ? 'nacional' : `en ${provinceName(target)}`}`
      : delta ? `${label} ${signed(delta)}` : `${label}: sin cambio`;
    const item = {stat, target, delta, kind: payment ? 'cost' : 'effect', text};
    if (delta > 0) result.benefits.push(item);
    else if (delta < 0) result.tradeoffs.push(item);
    else if (index >= 2) result.unchanged.push(item);
  }
  if (entry.reservedStaff) {
    const id = entry.reservedStaff, name = bundle.config.staff.find(s => s.id === id)?.name ?? id;
    result.reservedStaff = {id, name};
    result.tradeoffs.push({stat: 'staff', target: id, kind: 'reservation', text: `${name} ya tiene su tarea de este turno`});
  }
  return result;
}
