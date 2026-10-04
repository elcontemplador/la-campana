import {resolveCampaignBundle} from '../core/campaign.mjs';
import {canCampaignHere} from './strategy.mjs';

const publicPhases = new Set(['debrief', 'election', 'negotiation', 'ending']);
const campaignPhases = new Set(['event', 'planning']);
const amount = value => Math.abs(value).toLocaleString('es-ES', {maximumFractionDigits: 1});
const finite = value => typeof value === 'number' && Number.isFinite(value);
const signed = value => value > 0 ? `+${value}` : String(value);
const sentences = (...parts) => parts.filter(Boolean).reduce((text, part) => {
  const joined = text ? `${text} ${part}` : part;
  return joined.length <= 180 ? joined : text;
}, '');
const headlineWithinLimit = (text, fallback) => text.length <= 80 ? text : fallback;

function publicTurn(state) {
  if (!Number.isInteger(state?.turn) || state.turn < 1) return 0;
  if (publicPhases.has(state.phase)) return state.turn;
  return campaignPhases.has(state.phase) ? state.turn - 1 : 0;
}

// Check the date before reading the rest of a record. Future entries and records
// without an ID cannot provide either a story or a verifiable antecedent.
function revealedEntries(state, cutoff) {
  return (state.timeline || []).map((entry, index) => ({entry, index}))
    .filter(({entry}) => entry && Number.isInteger(entry.turn) && entry.turn > 0
      && entry.turn <= cutoff && typeof entry.id === 'string' && entry.id.length > 0)
    .sort((a, b) => a.entry.turn - b.entry.turn || a.index - b.index);
}

function recordedDelta(entry, stat, partyId) {
  return (entry.changes || []).filter(change => change.stat === stat
    && (stat === 'support' ? change.partyId === partyId : change.target === partyId)
    && finite(change.delta)).reduce((total, change) => total + change.delta, 0);
}

function matchingOpportunity(state, bundle, provinceId, partyId, cutoff) {
  if (!bundle.provinces.districts.some(d => d.id === provinceId)
    || !canCampaignHere(bundle, provinceId)) return null;
  const poll = state.publishedPolls?.P1;
  // A future or undated poll is not an observation the player can use here.
  if (!poll || !Number.isInteger(poll.turn) || poll.turn > cutoff || poll.turn < 0) return null;
  const opportunity = poll.districts?.[provinceId]?.opportunity;
  if (!opportunity?.present || opportunity.player !== 'P1') return null;
  const choices = [
    {kind: 'defense', against: opportunity.defense?.against, votes: opportunity.defense?.votesMargin},
    {kind: 'attack', against: opportunity.attack?.against, votes: opportunity.attack?.votesNeeded},
  ].filter(item => item.against === partyId && finite(item.votes) && item.votes >= 0);
  return choices.sort((a, b) => a.votes - b.votes)[0] || null;
}

function reference(entry, label) {
  return entry ? {entryId: entry.id, turn: entry.turn, label} : null;
}

/** Presentation only: public timeline, public configuration and P1 observations.
 * provinceId is caller context, never a replacement for the recorded destination.
 * No lastTransition fallback: its rivalMoves have neither a stable ID nor a date.
 */
export function rivalStory(state, originalBundle, {partyId, provinceId = null} = {}) {
  const cutoff = publicTurn(state);
  if (!cutoff || !partyId || partyId === 'P1') return null;
  const bundle = resolveCampaignBundle(originalBundle, state);
  if (!bundle.config.parties.some(p => p.id === partyId)) return null;
  const publicEntries = revealedEntries(state, cutoff);
  const latestIndex = publicEntries.findLastIndex(({entry}) => entry.kind === 'rival' && entry.partyId === partyId);
  if (latestIndex < 0) return null;
  const entry = publicEntries[latestIndex].entry;
  const knownActions = ['visit', 'contrast', 'interview', 'advertise', 'fundraise', 'rest', 'rehearse'];
  if (!knownActions.includes(entry.actionId)) return null;
  const past = publicEntries.slice(0, latestIndex).map(item => item.entry);
  const previous = predicate => past.findLast(predicate) || null;
  const partyName = id => bundle.config.parties.find(p => p.id === id)?.name || null;
  const result = {partyId, turn: entry.turn, entryId: entry.id, actionId: entry.actionId,
    target: entry.target ?? null, headline: '', summary: '', antecedent: null, responseProvince: null};

  if (entry.actionId === 'visit') {
    const district = bundle.provinces.districts.find(d => d.id === entry.target);
    if (!district) {
      result.headline = 'Hace una visita de campaña';
      result.summary = 'La última jugada publicada fue una visita.';
      return result;
    }
    const repeated = previous(e => e.kind === 'rival' && e.partyId === partyId
      && e.actionId === 'visit' && e.target === district.id);
    const ownVisit = previous(e => e.kind === 'plan' && e.actionId === 'visit'
      && e.actorId === 'candidate' && e.target === district.id
      && (!e.partyId || e.partyId === 'P1'));
    const opportunity = matchingOpportunity(state, bundle, district.id, partyId, cutoff);
    result.headline = headlineWithinLimit(repeated ? `Vuelve a ${district.name}`
      : ownVisit ? `Entra en tu ruta por ${district.name}` : `Lleva su campaña a ${district.name}`,
    repeated ? 'Vuelve a una provincia de su ruta' : ownVisit ? 'Su visita coincide con tu ruta' : 'Lleva su campaña a otra provincia');
    const history = repeated && ownVisit ? 'Regresa a una provincia que también has visitado.'
      : repeated ? 'Ya había hecho campaña aquí.' : ownVisit ? 'La visita coincide con una provincia de tu recorrido.'
        : 'Su última jugada fue una visita territorial.';
    const margin = opportunity?.kind === 'attack'
      ? `En ${district.name}, tu sondeo sitúa otro escaño frente a este rival a unos ${amount(opportunity.votes)} votos propios más.`
      : opportunity?.kind === 'defense'
        ? `En ${district.name}, unos ${amount(opportunity.votes)} votos propios menos le darían tu escaño más ajustado según tu sondeo.` : '';
    result.summary = sentences(margin, history);
    result.antecedent = repeated ? reference(repeated, `Ya visitó ${district.name} en el turno ${repeated.turn}`)
      : ownVisit ? reference(ownVisit, `Tu visita a ${district.name}, turno ${ownVisit.turn}`) : null;
    // Only a fresh visit can offer a response. Neither the selected province nor
    // an older known position turns a later fundraising/media action into a visit.
    if (entry.turn === cutoff && opportunity) result.responseProvince = district.id;
    return result;
  }

  if (entry.actionId === 'contrast') {
    const targetName = partyName(entry.target);
    if (!targetName || entry.target === partyId) return null;
    const repeated = previous(e => e.kind === 'rival' && e.partyId === partyId
      && e.actionId === 'contrast' && e.target === entry.target);
    const rivalSupport = recordedDelta(entry, 'support', partyId);
    const backfired = rivalSupport < 0 || (entry.changes || []).some(change =>
      change.stat === 'support' && change.partyId === partyId && finite(change.requested) && change.requested < 0);
    const actualLoss = rivalSupport < 0 || recordedDelta(entry, 'reputation', partyId) < 0;
    const againstYou = entry.target === 'P1';
    result.headline = backfired ? actualLoss ? 'El contraste le sale caro' : 'El contraste se vuelve contra su campaña'
      : againstYou ? repeated ? 'Vuelve a contrastar contigo' : 'Te disputa la iniciativa'
        : headlineWithinLimit(`Contrasta con ${targetName}`, 'Lleva el contraste a otra candidatura');
    let main;
    if (backfired) main = actualLoss ? 'El contraste perjudicó a su propia campaña.' : 'Su intento de contraste se volvió contra su campaña.';
    else main = againstYou ? 'Ha centrado su jugada en diferenciarse de ti.' : `Ha dirigido su contraste a ${targetName}.`;
    const ownLoss = againstYou && recordedDelta(entry, 'support', 'P1') < 0 ? 'Tu alcance registrado también retrocedió.' : '';
    const relationship = againstYou ? state.parties?.P1?.relations?.[partyId] : null;
    const relation = finite(relationship) ? `La relación contigo está en ${signed(relationship)}.` : '';
    const repetition = repeated ? againstYou ? 'Ya había contrastado contigo.' : 'Ya había elegido ese mismo destinatario.' : '';
    result.summary = sentences(main, ownLoss, relation, repetition);
    result.antecedent = repeated ? reference(repeated, againstYou
      ? `Su anterior contraste contigo, turno ${repeated.turn}`
      : `Contraste con ${targetName}, turno ${repeated.turn}`) : null;
    // Even in a boomerang, retain the public addressee rather than implying P1.
    if (backfired && !againstYou) result.summary = sentences(`El contraste con ${targetName} se volvió contra su campaña.`,
      actualLoss ? 'Su propia campaña salió perjudicada.' : '', repetition);
    return result;
  }

  const priorSame = previous(e => e.kind === 'rival' && e.partyId === partyId && e.actionId === entry.actionId);
  if (entry.actionId === 'interview' || entry.actionId === 'advertise') {
    const local = entry.actionId === 'advertise' && bundle.provinces.districts.find(d => d.id === entry.target);
    result.headline = entry.actionId === 'interview' ? priorSame ? 'Vuelve a los medios' : 'Lleva la campaña a los medios'
      : local ? headlineWithinLimit(`Compra presencia en ${local.name}`, 'Compra presencia en medios locales') : 'Compra presencia en medios nacionales';
    result.summary = sentences(entry.actionId === 'interview' ? 'Eligió una entrevista de alcance nacional.'
      : local ? `Contrató publicidad en ${local.name}.` : 'Contrató publicidad de alcance nacional.',
    recordedDelta(entry, 'support', partyId) > 0 ? 'Su mensaje ganó alcance.' : '');
    result.antecedent = priorSame ? reference(priorSame, `Su anterior ${entry.actionId === 'interview' ? 'entrevista' : 'acción publicitaria'}, turno ${priorSame.turn}`) : null;
  } else if (entry.actionId === 'fundraise') {
    const budgetChanges = (entry.changes || []).filter(c => c.stat === 'budget' && c.target === partyId && finite(c.delta));
    const gain = budgetChanges.reduce((sum, c) => sum + c.delta, 0);
    result.headline = priorSame ? 'Vuelve a recaudar fondos' : 'Dedica la jornada a recaudar';
    result.summary = sentences(gain > 0 ? `La recaudación sumó ${amount(gain)} a su caja.`
      : budgetChanges.length && gain === 0 ? 'La caja no aumentó con esta recaudación.' : 'La acción publicada fue recaudar fondos.',
    recordedDelta(entry, 'reputation', partyId) < 0 ? 'La insistencia también dañó su reputación.' : '');
    result.antecedent = priorSame ? reference(priorSame, `Su anterior recaudación, turno ${priorSame.turn}`) : null;
  } else if (entry.actionId === 'rest') {
    const gained = recordedDelta(entry, 'energy', partyId);
    result.headline = entry.turn >= bundle.config.turns ? 'Cierra la campaña con una pausa' : 'Hace una pausa en su campaña';
    result.summary = gained > 0 ? `El descanso recuperó ${amount(gained)} de energía en esta jugada.` : 'Su jugada pública fue reservar tiempo para descansar.';
  } else if (entry.actionId === 'rehearse') {
    result.headline = entry.turn >= bundle.config.turns ? 'Elige ensayar en el cierre' : 'Dedica la jugada a ensayar';
    result.summary = recordedDelta(entry, 'readiness', partyId) > 0
      ? 'El ensayo añadió preparación a su campaña.' : 'Ensayó en lugar de hacer una visita o una entrevista.';
  }
  return result;
}
