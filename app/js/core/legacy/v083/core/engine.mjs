import {actionCost, validatePlan} from './actions.mjs';
import {campaignDefinition, initialResources, resolveCampaignBundle} from './campaign.mjs';
import {choosePlan} from '../ai/rivals.mjs';
import {evaluateInvestiture} from './electoral.mjs';
import {chooseOffer, getNegotiationPreview, startNegotiation, counterofferPreview, revisionPreview} from './negotiation.mjs';
import {countElection, publishPolls, trueWeights, districtIssues} from './polls.mjs';
import {bundleChecksum, normalizeSetup, validOffer, validateBundle} from './scenario.mjs';
import {assertSafeTree, clamp, clone, compareId, fail, hashKey, present, randomInt} from './utils.mjs';
import * as previousEngine from '../../v061/core/engine.mjs';
import * as engineV070 from '../../v070/core/engine.mjs';
import * as engineV081 from '../../v081/core/engine.mjs';
import * as engineV080 from '../../v080/core/engine.mjs';
import {resolveTopicEffect} from './topic-effects.mjs';
import {selectBundle,legacyBundle} from './bundles.mjs';
import * as engineV082 from '../../v082/core/engine.mjs';
import {reinforceDebateStage} from './debate-bet.mjs';

export {actionCost, validatePlan, getNegotiationPreview};

const statNames = {budget: 'Presupuesto', energy: 'Energía', cohesion: 'Cohesión', reputation: 'Reputación', readiness: 'Preparación'};
const signed = value => value > 0 ? '+' + value : String(value);
const partyMeta = (bundle, id) => bundle.config.parties.find(p => p.id === id);
const districtName = (bundle, id) => bundle.provinces.districts.find(d => d.id === id)?.name ?? id;
const civilianName = (bundle, id) => bundle.config.civilActors.find(c => c.id === id)?.name ?? id;

function changeStat(state, bundle, partyId, key, delta, changes = []) {
  const p = state.parties[partyId];
  const r = bundle.config.resources[key];
  const before = p[key];
  p[key] = clamp(before + delta, r.min, r.max);
  const actual = p[key] - before;
  changes.push({stat: key, target: partyId, delta: actual, requested: delta,
    label: actual ? `${statNames[key]} ${signed(actual)}` : `${statNames[key]} sin cambio; límite alcanzado`});
  return actual;
}

function support(state, bundle, partyId, target, delta, changes = [], scope = null) {
  const party = partyMeta(bundle, partyId);
  const targets = scope ?? (target === 'national' ? bundle.provinces.districts.filter(d => present(party, d.id)).map(d => d.id) : [target]);
  let total = 0;
  for (const provinceId of targets) {
    if (!present(party, provinceId)) continue;
    const before = state.parties[partyId].campaignDelta[provinceId];
    state.parties[partyId].campaignDelta[provinceId] = clamp(before + delta,
      bundle.config.support.campaignDeltaMin, bundle.config.support.campaignDeltaMax);
    total += state.parties[partyId].campaignDelta[provinceId] - before;
  }
  const actual = targets.length ? Math.round(total / targets.length * 10) / 10 : 0;
  changes.push({stat: 'support', target, partyId, delta: actual, requested: delta,
    label: `${partyId === 'P1' ? 'Tu alcance' : partyMeta(bundle, partyId).name}: ${signed(actual)} de atractivo ${scope ? 'en el territorio compartido' : target === 'national' ? 'nacional' : 'en ' + districtName(bundle, target)}${actual !== delta ? ' (limitado por saturación)' : ''}`});
}

function relationship(state, bundle, a, b, delta, changes = []) {
  const r = bundle.config.resources.relation;
  const before = state.parties[a].relations[b];
  const after = clamp(before + delta, r.min, r.max);
  state.parties[a].relations[b] = after;
  state.parties[b].relations[a] = after;
  changes.push({stat: 'relation', target: b, delta: after - before,
    label: `Relación con ${partyMeta(bundle, b).name} ${signed(after - before)}`});
}

function rapport(state, bundle, target, delta, changes) {
  if (delta > 0 && state.candidate.profile === 'conexion' && !state.profileUsed.rapport) {
    delta += 1;
    state.profileUsed.rapport = true;
  }
  const r = bundle.config.resources.rapport;
  const before = state.rapport[target];
  state.rapport[target] = clamp(before + delta, r.min, r.max);
  changes.push({stat: 'rapport', target, delta: state.rapport[target] - before,
    label: `${civilianName(bundle, target)}: relación ${signed(state.rapport[target] - before)}`});
}

function record(state, entry) {
  const full = {id: `entry-${state.timeline.length + 1}`, turn: state.turn, changes: [], ...entry};
  state.timeline.push(full);
  return full;
}

function eligibleEvent(state, event) {
  return event.requiresFlags.every(f => Boolean(state.flags[f])) && event.forbidsFlags.every(f => !state.flags[f])
    && (event.requiresOpenPromise === null || state.promises.some(p => p.status === 'open'
      && (event.requiresOpenPromise === 'ANY' || event.requiresOpenPromise === p.id)));
}

function selectEvent(state, bundle) {
  const eligible = bundle.content.events.filter(e => e.turn === state.turn && eligibleEvent(state, e));
  const urgent = eligible.filter(e => e.priority >= bundle.config.deck.urgentPriority)
    .sort((a, b) => b.priority - a.priority || hashKey('event-v1', state.seed, state.turn, a.id)
      - hashKey('event-v1', state.seed, state.turn, b.id) || compareId(a.id, b.id));
  if (urgent.length) return urgent[0];
  const deck = eligible.sort((a, b) => compareId(a.id, b.id));
  const total = deck.reduce((s, e) => s + (e.weight ?? 1), 0);
  let draw = randomInt('event-v1', state.seed, [state.turn, 'deck'], 1, total);
  for (const card of deck) {
    draw -= card.weight ?? 1;
    if (draw <= 0) return card;
  }
  throw new Error('No hay situación disponible');
}

function beginTurn(state, bundle) {
  state.turn++;
  state.focusProvince = state.lastVisitedProvince ?? state.initialSetup.province;
  state.reservedStaff = [];
  state.profileUsed = {rapport: false, delegation: false};
  const event = selectEvent(state, bundle);
  state.activeEvent = event.id;
  state.eventStage = 0;
  state.phase = 'event';
}

export function createGame(bundle, seed, setup) {
  bundle = bundle.campaignBase ?? bundle;
  if(bundle.config.rulesVersion==='0.6.1')return previousEngine.createGame(bundle,seed,setup);
  if(bundle.config.rulesVersion==='0.7.0')return engineV070.createGame(bundle,seed,setup);
  if(bundle.config.rulesVersion==='0.8.1')return engineV081.createGame(bundle,seed,setup);
  if(bundle.config.rulesVersion==='0.8.2')return engineV082.createGame(bundle,seed,setup);
  if(bundle.config.rulesVersion==='0.8.0')return engineV080.createGame(bundle,seed,setup);
  validateBundle(bundle);
  const normalized = normalizeSetup(bundle, seed, setup);
  const sourceChecksum = bundleChecksum(bundle);
  const campaign = campaignDefinition(bundle, normalized.setup);
  bundle = resolveCampaignBundle(bundle, normalized.setup);
  const c = bundle.config;
  const state = {schemaVersion: c.schemaVersion, rulesVersion: c.rulesVersion,
    contentVersion: bundle.content.version, scenarioId: c.scenarioId, bundleChecksum: sourceChecksum,
    seed: normalized.seed, initialSetup: normalized.setup,
    candidate: {name: normalized.setup.name, portrait: normalized.setup.portrait, profile: normalized.setup.profile},
    selectedStaff: normalized.setup.staff, commitments: normalized.setup.commitments,
    revision: 0, phase: 'event', turn: 0, parties: {}, rapport: {C1: 0, C2: 0},
    flags: {...c.initialFlags, underContrast: false, rivalBlunder: false}, flagOrigins: {}, promises: [],
    focusProvince: normalized.setup.province, lastVisitedProvince: null, reservedStaff: [],
    profileUsed: {rapport: false, delegation: false}, timeline: [], commandLog: [],
    activeEvent: null, eventStage: 0, electionResult: null, negotiation: null, outcome: null,
    lastTransition: {title: 'La sala de campaña está abierta', body: campaign.tagline, entries: []}};
  for (const p of c.parties) {
    const own = initialResources(bundle, normalized.setup, p.id);
    own.organization = Object.fromEntries(bundle.provinces.districts.map(d => [d.id, 0]));
    own.campaignDelta = Object.fromEntries(bundle.provinces.districts.map(d => [d.id, 0]));
    own.repeatCounts = {};
    own.research = {};
    own.relations = Object.fromEntries(c.parties.filter(q => q.id !== p.id).map(q => {
      const relation = c.partyRelations.find(r => r.a === p.identityId && r.b === q.identityId
        || r.b === p.identityId && r.a === q.identityId);
      return [q.id, relation?.value ?? c.resources.relation.initial];
    }));
    own.positions = p.id === 'P1' ? {...normalized.setup.positions} : {...p.positions};
    state.parties[p.id] = own;
  }
  for (const {a,b,value} of campaign.initialRelations) {
    state.parties[a].relations[b] = value;
    state.parties[b].relations[a] = value;
  }
  for (const {partyId,provinces,level} of campaign.initialOrganization) {
    for (const id of provinces) state.parties[partyId].organization[id] = level;
  }
  state.publishedPolls = publishPolls(state, bundle);
  beginTurn(state, bundle);
  return state;
}

function describeEffects(effects, bundle) {
  return effects.map(e => {
    if (e.type === 'stat') return `${statNames[e.stat]} ${signed(e.delta)}`;
    if (e.type === 'rapport') return `${civilianName(bundle, e.target)}: relación ${signed(e.delta)}`;
    if (e.type === 'relation') return `${partyMeta(bundle, e.target).name}: relación ${signed(e.delta)}`;
    if (e.type === 'organization') return 'Organización local +1';
    if (e.type === 'support') return `Atractivo ${e.target === 'national' ? 'nacional' : 'local'} ${signed(e.delta)}`;
    if (e.type === 'promise_open') return 'Respuesta comprometida para el cierre';
    if (e.type === 'promise_close') return e.status === 'fulfilled' ? 'Entregas las respuestas pendientes'
      : e.status === 'reduced' ? 'Acuerdas una entrega más acotada' : 'La respuesta queda sin entregar';
    return null;
  }).filter(Boolean);
}

export function getEventView(state, bundle) {
  const selected=selectBundle(bundle,state);
  if(selected.config.rulesVersion==='0.6.1')return previousEngine.getEventView(state,selected);
  if(selected.config.rulesVersion==='0.7.0')return engineV070.getEventView(state,selected);
  if(selected.config.rulesVersion==='0.8.1')return engineV081.getEventView(state,selected);
  if(selected.config.rulesVersion==='0.8.2')return engineV082.getEventView(state,selected);
  if(selected.config.rulesVersion==='0.8.0')return engineV080.getEventView(state,selected);
  bundle = resolveCampaignBundle(bundle, state);
  const original = bundle.content.events.find(e => e.id === state.activeEvent);
  if (!original) return null;
  const event = clone(original);
  const narrative = value => value.replace(/\{party:(P[1-4]|R[12])\}/g, (_, id) => partyMeta(bundle, id).name);
  for (const scene of [event, ...(event.stages ?? [])]) {
    for (const key of ['title','body','shortBody']) if (typeof scene[key] === 'string') scene[key] = narrative(scene[key]);
    for (const option of scene.options ?? []) for (const key of ['label','feedback','learning','shortLabel','shortFeedback']) {
      if (typeof option[key] === 'string') option[key] = narrative(option[key]);
    }
  }
  const stage = event.stages ? event.stages[state.eventStage] : null;
  if(event.id==='E07'&&state.eventStage===1){
    const opening=state.timeline.findLast(e=>e.kind==='event'&&e.eventId==='E07'&&e.turn===state.turn)?.optionId;
    const challenge=opening==='full_opening';
    event.debateBranch=challenge?'challenge':'explain';
    const comparison=stage.options.find(o=>o.id==='compare_programmes');
    comparison.effects=[{type:'stat',stat:'readiness',delta:-1},{type:'support',target:'national',delta:challenge?60:40},
      challenge?{type:'relation',target:'P2',delta:-1}:{type:'stat',stat:'reputation',delta:1}];
    comparison.feedback=challenge?'La comparación disputa más alcance al rival, pero enfría la relación con {party:P2}. Usaste una ficha.'
      :'La comparación concreta tu programa y refuerza credibilidad. Usaste una ficha y el alcance es más contenido.';
    comparison.feedback=narrative(comparison.feedback);comparison.shortFeedback=comparison.feedback;
  }
  if(event.id==='E07'&&stage)reinforceDebateStage(stage,state.eventStage,state);
  const source = stage ?? event;
  const p = state.parties.P1;
  const discountRule = bundle.config.rapportEnergyDiscount;
  let actorTargets = discountRule.eventActors[event.id] ?? [];
  if (event.id === 'E11') actorTargets = actorTargets.filter(id => state.promises.some(pr => pr.target === id && pr.status === 'open'));
  const qualified = actorTargets.some(id => state.rapport[id] >= discountRule.threshold);
  const options = source.options.map(o => {
    o.effects=o.effects.map(effect=>resolveTopicEffect(effect,state,bundle));
    const cost = {...o.cost};
    const discount = qualified ? Math.min(cost.energy, discountRule.amount) : 0;
    cost.energy -= discount;
    const staffChoices = o.requiresStaff === null ? [] : state.selectedStaff.filter(id => !state.reservedStaff.includes(id)
      && (o.requiresStaff === 'any' || o.requiresStaff === id));
    const requiredReadiness = o.effects.filter(e => e.type === 'stat' && e.stat === 'readiness' && e.delta < 0).reduce((s, e) => s - e.delta, 0);
    const reason = o.reserveStaff && staffChoices.length === 0 ? 'Necesitas al colaborador indicado y libre este turno'
      : p.readiness < requiredReadiness ? 'Falta preparación para esta intervención'
      : p.budget < cost.budget ? 'No alcanza el presupuesto' : p.energy < cost.energy ? 'No queda energía suficiente' : '';
    const effects = describeEffects(o.effects.map(e=>e.type==='topic_support'?{type:'support',target:'focus',delta:topicDelta(state,bundle,e)}:e), bundle);
    if (state.candidate.profile === 'coordinacion' && o.reserveStaff && !state.profileUsed.delegation) effects.push('Tu perfil añade +1 cohesión');
    if (state.candidate.profile === 'conexion' && !state.profileUsed.rapport && o.effects.some(e => e.type === 'rapport' && e.delta > 0)) effects.push('Tu perfil añade +1 relación civil');
    return {...o, availability: {available: !reason, reason, cost, staffChoices, requiredReadiness, discount, effects}};
  });
  return {event, stage, index: state.eventStage, total: event.stages?.length ?? 1, options, ...(event.debateBranch?{debateBranch:event.debateBranch}:{})};
}

function topicDelta(state,bundle,effect){
  const issue=districtIssues(bundle,state.seed,state.focusProvince)[effect.topicId];
  return effect.base*issue.salience*(state.parties.P1.positions[effect.topicId]===issue.position?1:-1);
}

function applyEventEffect(state, bundle, effect, origin, changes) {
  effect=resolveTopicEffect(effect,state,bundle);
  if(effect.type==='topic_support')support(state,bundle,'P1',state.focusProvince,topicDelta(state,bundle,effect),changes);
  if (effect.type === 'stat') changeStat(state, bundle, 'P1', effect.stat, effect.delta, changes);
  if (effect.type === 'rapport') rapport(state, bundle, effect.target, effect.delta, changes);
  if (effect.type === 'relation') relationship(state, bundle, 'P1', effect.target, effect.delta, changes);
  if (effect.type === 'organization') {
    const r = bundle.config.resources.organization;
    const before = state.parties.P1.organization[state.focusProvince];
    state.parties.P1.organization[state.focusProvince] = clamp(before + effect.delta, r.min, r.max);
    changes.push({stat: 'organization', target: state.focusProvince, delta: state.parties.P1.organization[state.focusProvince] - before,
      label: `Organización en ${districtName(bundle, state.focusProvince)} +${state.parties.P1.organization[state.focusProvince] - before}`});
  }
  if (effect.type === 'support') support(state, bundle, 'P1', effect.target === 'focus' ? state.focusProvince : 'national', effect.delta, changes);
  if (effect.type === 'flag') {
    state.flags[effect.flag] = effect.value;
    if (effect.value) state.flagOrigins[effect.flag] = {...origin};
  }
  if (effect.type === 'promise_open' && !state.promises.some(p => p.id === effect.id)) {
    state.promises.push({id: effect.id, target: effect.target, dueTurn: effect.dueTurn, status: 'open', openedBy: origin.entryId});
    changes.push({stat: 'promise', target: effect.id, label: `${civilianName(bundle, effect.target)}: respuesta pendiente`});
  }
  if (effect.type === 'promise_close') {
    for (const p of state.promises) if (p.status === 'open' && (effect.id === 'ALL_OPEN' || p.id === effect.id)) {
      p.status = effect.status; p.closedTurn = state.turn;
      changes.push({stat: 'promise', target: p.id, label: `${civilianName(bundle, p.target)}: ${effect.status === 'fulfilled' ? 'entrega completada' : effect.status === 'reduced' ? 'entrega reducida' : 'sin entregar'}`});
    }
  }
}

function chooseOption(state, command, bundle) {
  const view = getEventView(state, bundle);
  const option = view.options.find(o => o.id === command.optionId);
  if (!option) return fail('UNKNOWN_OPTION', 'Elige una opción de esta escena');
  if (!option.availability.available) return fail('OPTION_UNAVAILABLE', option.availability.reason);
  if (option.reserveStaff && !option.availability.staffChoices.includes(command.staffId)) return fail('STAFF_UNAVAILABLE', 'Selecciona un colaborador disponible para esta tarea');
  if (!option.reserveStaff && command.staffId != null) return fail('UNEXPECTED_STAFF', 'Esta opción no reserva a un colaborador');
  const changes = [];
  changeStat(state, bundle, 'P1', 'budget', -option.availability.cost.budget, changes);
  changeStat(state, bundle, 'P1', 'energy', -option.availability.cost.energy, changes);
  if (option.reserveStaff) {
    state.reservedStaff.push(command.staffId);
    if (state.candidate.profile === 'coordinacion' && !state.profileUsed.delegation) {
      changeStat(state, bundle, 'P1', 'cohesion', 1, changes); state.profileUsed.delegation = true;
    }
  }
  const origin = {eventId: state.activeEvent, optionId: option.id, turn: state.turn, entryId: `entry-${state.timeline.length + 1}`};
  for (const effect of option.effects) applyEventEffect(state, bundle, effect, origin, changes);
  const antecedents = view.event.requiresFlags.map(f => state.flagOrigins[f]).filter(Boolean);
  const entry = record(state, {kind: 'event', title: view.stage?.title ?? view.event.title, body: option.feedback,
    eventId: state.activeEvent, optionId: option.id, changes, learning: option.learning, antecedents,
    reservedStaff: option.reserveStaff ? command.staffId : null});
  state.lastTransition = {title: entry.title, body: option.feedback, entries: [entry]};
  if (view.event.stages && state.eventStage < view.total - 1) state.eventStage++;
  else state.phase = 'planning';
  return {ok: true};
}

export function observe(state, partyId, bundle) {
  bundle = resolveCampaignBundle(bundle, state);
  const p = state.parties[partyId];
  const party = partyMeta(bundle, partyId);
  return clone({partyId, seed: state.seed, turn: state.turn, config: bundle.config,
    difficulty: state.initialSetup.difficulty,
    lastPlayerMove: (()=>{const move=state.timeline.findLast(e=>e.kind==='plan'&&e.actorId==='candidate'&&e.turn<state.turn);return move?{turn:move.turn,actionId:move.actionId,target:move.target}:null;})(),
    parties: bundle.config.parties.map(p => ({...p, positions: state.parties[p.id].positions,
      policyIdeal:p.id==='P1'?bundle.config.topics.map(t=>state.commitments.includes(t.id)?3:0):p.policyIdeal})),
    party: {budget: p.budget, energy: p.energy, cohesion: p.cohesion, reputation: p.reputation, readiness: p.readiness,
      organization: p.organization, research: p.research, repeatCounts: p.repeatCounts, relations: p.relations},
    polls: state.publishedPolls[partyId], districts: bundle.provinces.districts.filter(d => present(party, d.id))});
}

function playerShare(state, bundle, provinceId = null) {
  const districts = provinceId ? bundle.provinces.districts.filter(d => d.id === provinceId) : bundle.provinces.districts;
  let own = 0, total = 0;
  for (const d of districts) {
    const weights = trueWeights(state, bundle, d.id);
    const sum = Object.values(weights).reduce((s, n) => s + n, 0);
    own += (weights.P1 ?? 0) / sum * d.seats; total += d.seats;
  }
  return own / total * 100;
}

function applyAction(state, bundle, partyId, actor, item, energyBefore) {
  const c = bundle.config;
  const p = state.parties[partyId];
  const action = (actor === 'candidate' ? c.candidateActions : c.staffActions).find(a => a.id === item.id);
  const changes = [];
  const target = item.target ?? null;
  const provinceImpact = ['visit', 'organize'].includes(item.id) || (item.id === 'advertise' && target !== 'national') ? target : null;
  const beforeShare = partyId === 'P1' ? playerShare(state, bundle, provinceImpact) : null;
  const specialist = partyId === 'P1' ? c.staff.find(s => s.id === actor) : null;
  let body = '';
  if (item.id === 'organize') {
    const before = p.organization[target];
    p.organization[target] = clamp(before + 1, 0, c.resources.organization.max);
    changes.push({stat: 'organization', target, delta: p.organization[target] - before, label: `Organización en ${districtName(bundle, target)} +${p.organization[target] - before}`});
    body = `La campaña gana presencia estable en ${districtName(bundle, target)}. A partir de este turno trabajará a tu favor.`;
  }
  if (item.id === 'research') {
    p.research[target] = {from: state.turn, through: Math.max(state.turn + 1, p.research[target]?.through ?? 0)};
    changes.push({stat: 'research', target, label: `${districtName(bundle, target)}: información más precisa durante dos publicaciones`});
    body = `El equipo afina la lectura de ${districtName(bundle, target)}. Menos conjeturas para decidir dónde volver.`;
  }
  if (item.id === 'prepare') {
    changeStat(state, bundle, partyId, 'readiness', action.effect.readiness + (specialist?.bonus.extraReadiness ?? 0)
      + (partyId==='P1'&&state.candidate.profile==='preparacion'?1:0), changes);
    body = 'Quedan argumentos y respuestas preparados. El atril no perdona las improvisaciones.';
  }
  if (item.id === 'outreach') {
    rapport(state, bundle, target, action.effect.rapport + (specialist?.bonus.extraRapport ?? 0), changes);
    state.flags[target === 'C1' ? 'c1Contact' : 'c2Contact'] = true;
    state.flagOrigins[target === 'C1' ? 'c1Contact' : 'c2Contact'] = {turn: state.turn, actionId: item.id, entryId: `entry-${state.timeline.length + 1}`};
    body = `${civilianName(bundle, target)} encuentra un hueco para hablar. Las relaciones también necesitan agenda.`;
  }
  if (item.id === 'mediate') {
    relationship(state, bundle, partyId, target, action.effect.relation, changes);
    body = `Se abre conversación con ${partyMeta(bundle, target).name}. Un acuerdo futuro tendrá que empezar por algún sitio.`;
  }
  if (item.id === 'advertise') {
    support(state, bundle, partyId, target, target === 'national' ? action.effect.nationalSupport : action.effect.localSupport, changes);
    body = target === 'national' ? 'La campaña compra presencia en medios de alcance nacional.' : `La campaña ocupa espacio publicitario en ${districtName(bundle, target)}.`;
  }
  if (item.id === 'rehearse') {
    changeStat(state, bundle, partyId, 'readiness', action.effect.readiness + (partyId === 'P1' && state.candidate.profile === 'preparacion' ? 1 : 0), changes);
    body = 'El candidato ensaya hasta que la respuesta deja de sonar ensayada.';
  }
  if (item.id === 'rest') {
    changeStat(state, bundle, partyId, 'energy', action.effect.energy, changes);
    body = 'Un hueco sin focos permite recuperar energía. Mañana también hay campaña.';
  }
  if (item.id === 'wait') body = 'El colaborador conserva su disponibilidad y la campaña conserva recursos.';
  if (item.id === 'fundraise') {
    const repeats = p.repeatCounts.fundraise ?? 0;
    const abuse = repeats >= action.effect.abuseAfter;
    changeStat(state, bundle, partyId, 'budget', abuse ? action.effect.lateBudget : action.effect.budget, changes);
    if (abuse) changeStat(state, bundle, partyId, 'reputation', action.effect.abuseReputation, changes);
    p.repeatCounts.fundraise = repeats + 1;
    body = abuse ? 'La nueva recaudación funciona, pero insistir tanto empieza a pesar en la imagen del candidato.' : 'La recaudación llena parte de la caja. Ese tiempo ya no podrá dedicarse a una visita.';
  }
  if (item.id === 'visit' || item.id === 'interview') {
    const key = item.id === 'visit' ? 'visit:' + target : 'interview';
    const repeats = p.repeatCounts[key] ?? 0;
    const repeatFactor = c.support.repeatPercent[Math.min(repeats, c.support.repeatPercent.length - 1)] / 100;
    let base = item.id === 'visit' ? action.effect.localSupport : action.effect.nationalSupport;
    if (item.id === 'interview' && p.readiness > 0) {
      changeStat(state, bundle, partyId, 'readiness', -1, changes); base += action.effect.perReadinessBonus;
    }
    const energyFactor = energyBefore < c.support.energyLowBelow ? c.support.energyLowPercent / 100 : 1;
    const cohesionFactor = p.cohesion < c.support.cohesionLowBelow ? c.support.cohesionLowPercent / 100 : 1;
    const delta = Math.floor(base * repeatFactor * energyFactor * cohesionFactor);
    support(state, bundle, partyId, item.id === 'visit' ? target : 'national', delta, changes);
    p.repeatCounts[key] = repeats + 1;
    if (partyId === 'P1' && item.id === 'visit') state.lastVisitedProvince = target;
    body = item.id === 'visit' ? `El candidato pisa ${districtName(bundle, target)} y gana presencia allí.` : 'La entrevista pone la campaña ante un público nacional.';
    if (repeatFactor < 1) body += ' Repetir reduce la novedad de la intervención.';
    if (energyFactor < 1 || cohesionFactor < 1) body += ' El cansancio o la coordinación limitan su efecto.';
  }
  if (item.id === 'contrast') {
    const repeatKey = 'contrast:' + target;
    const repeats = p.repeatCounts[repeatKey] ?? 0;
    const repeatFactor = c.support.repeatPercent[Math.min(repeats, c.support.repeatPercent.length - 1)] / 100;
    const scope = bundle.provinces.districts.filter(d => present(partyMeta(bundle, partyId), d.id)
      && present(partyMeta(bundle, target), d.id)).map(d => d.id);
    const prepared = p.readiness > 0;
    if (prepared) changeStat(state, bundle, partyId, 'readiness', -1, changes);
    const risk = prepared ? action.effect.riskPreparedPercent : action.effect.riskUnpreparedPercent;
    const boomerang = randomInt('contrast-v2', state.seed, [state.turn, partyId, target], 1, 100) <= risk;
    relationship(state, bundle, partyId, target, action.effect.relation, changes);
    if (boomerang) {
      support(state, bundle, partyId, 'national', action.effect.boomerangSupport, changes, scope);
      changeStat(state, bundle, partyId, 'reputation', action.effect.boomerangReputation, changes);
      if (partyId !== 'P1') {
        state.flags.rivalBlunder = true;
        state.flagOrigins.rivalBlunder = {turn: state.turn, partyId, actionId: 'contrast'};
      }
      body = `El contraste con ${partyMeta(bundle, target).name} se vuelve contra quien lo plantea. El rival encuentra el punto débil del argumento.`;
    } else {
      support(state, bundle, partyId, 'national', Math.floor(action.effect.nationalSupport * repeatFactor), changes, scope);
      support(state, bundle, target, 'national', -Math.floor(Math.abs(action.effect.rivalSupport) * repeatFactor), changes, scope);
      body = `El contraste disputa atención a ${partyMeta(bundle, target).name}. La relación queda más fría para después del recuento.`;
    }
    p.repeatCounts[repeatKey] = repeats + 1;
    if (repeatFactor < 1) body += ' El argumento empieza a sonar conocido: repetir el mismo contraste reduce su alcance.';
    if (partyId !== 'P1' && target === 'P1') {
      state.flags.underContrast = true;
      state.flagOrigins.underContrast = {turn: state.turn, partyId, actionId: 'contrast'};
    }
  }
  const afterShare = partyId === 'P1' ? playerShare(state, bundle, provinceImpact) : null;
  if (beforeShare !== null && Math.abs(afterShare - beforeShare) >= 0.01) {
    changes.push({stat: 'modelImpact', target: provinceImpact ?? 'national', delta: Math.round((afterShare - beforeShare) * 10) / 10,
      label: `Impacto del modelo: ${signed(Math.round((afterShare - beforeShare) * 10) / 10)} puntos ${provinceImpact ? 'en ' + districtName(bundle, provinceImpact) : 'nacionales'} antes del ruido del sondeo`});
  }
  if (partyId === 'P1') record(state, {kind: 'plan', title: action.label, body, changes, actionId: item.id, actorId: actor, target});
  return {partyId, actionId: item.id, target, title: `${partyMeta(bundle, partyId).name}: ${action.label.toLowerCase()}`, body, changes};
}

function teamThoughts(state) {
  const p = state.parties.P1;
  const thoughts = {
    S1: p.readiness < 2 ? 'Podemos afinar el argumento antes de volver a los focos. Todavía hay margen.' : 'Ahora tenemos respuestas preparadas. Elegir dónde usarlas importa tanto como tenerlas.',
    S2: p.budget < 12 ? 'La caja empieza a sonar hueca. Antes de abrir otra tarea, habrá que conseguir recursos.' : 'La organización trabaja mientras el candidato está en otra provincia. Conviene sembrar pronto.',
    S3: p.energy < 35 ? 'El candidato necesita un respiro. Las cámaras no distinguen agotamiento de desgana.' : 'Se nos ha visto. Para la próxima intervención, busquemos algo que todavía no hayamos dicho tres veces.',
    S4: Object.values(p.relations).some(n => n < 0) ? 'Hay puertas que hemos enfriado. La noche electoral llega antes de que se nos olvide.' : 'Los escaños se cuentan al final. Las conversaciones pueden empezar bastante antes.',
  };
  return state.selectedStaff.map(id => ({staffId: id, text: thoughts[id], body: thoughts[id]}));
}

function confirmPlan(state, command, bundle) {
  const validation = validatePlan(state, command.plan, bundle);
  if (!validation.ok) return validation;
  const rivals = bundle.config.parties.filter(p => p.id !== 'P1').map(p => ({id: p.id, plan: choosePlan(observe(state, p.id, bundle))}));
  for (const rival of rivals) {
    const result = validatePlan(state, rival.plan, bundle, rival.id);
    if (!result.ok) throw new Error('Plan rival inválido: ' + result.error.message);
  }
  const previousPoll = state.publishedPolls.P1;
  const start = state.timeline.length;
  state.flags.underContrast = false;
  state.flags.rivalBlunder = false;
  const rivalMoves = [], organizationReturns=[];
  for (const {id, plan} of [{id: 'P1', plan: command.plan}, ...rivals]) {
    const valid = validatePlan(state, plan, bundle, id);
    const energyBefore = state.parties[id].energy;
    const costs = [];
    changeStat(state, bundle, id, 'budget', -valid.cost.budget, costs);
    changeStat(state, bundle, id, 'energy', -valid.cost.energy, costs);
    if (id === 'P1') record(state, {kind: 'plan', title: 'La agenda queda confirmada', body: 'El equipo se pone en marcha.', changes: costs});
    const staff = Object.entries(plan.staff).sort(([a], [b]) => compareId(a, b));
    const staffMoves = staff.map(([actor, item]) => applyAction(state, bundle, id, actor, item, energyBefore));
    const move = applyAction(state, bundle, id, 'candidate', plan.candidate, energyBefore);
    if (id !== 'P1') {
      move.body += ' ' + staffMoves.filter(m => m.actionId !== 'wait').map(m => m.body).join(' ');
      rivalMoves.push(move);
      record(state, {...move, kind: 'rival'});
    }
  }
  for (const party of bundle.config.parties) {
    const p = state.parties[party.id];
    for (const d of bundle.provinces.districts) if (present(party, d.id) && p.organization[d.id] > 0) {
      const before=p.campaignDelta[d.id];
      p.campaignDelta[d.id] = clamp(before + p.organization[d.id] * bundle.config.support.organizationYieldPerTurn,
        bundle.config.support.campaignDeltaMin, bundle.config.support.campaignDeltaMax);
      if(party.id==='P1')organizationReturns.push({provinceId:d.id,level:p.organization[d.id],delta:p.campaignDelta[d.id]-before,remainingTurns:bundle.config.turns-state.turn});
    }
    changeStat(state, bundle, party.id, 'energy', bundle.config.resources.energy.recovery);
  }
  state.publishedPolls = publishPolls(state, bundle);
  const provinceChanges = bundle.provinces.districts.map(d => {
    const before = previousPoll.districts[d.id].values.P1?.center ?? 0;
    const after = state.publishedPolls.P1.districts[d.id].values.P1?.center ?? 0;
    return {provinceId: d.id, before, after, change: after - before, estimated: true,
      reason: 'Cambio del sondeo tras las agendas de todos los partidos'};
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || compareId(a.provinceId, b.provinceId));
  state.lastTransition = {title: `Turno ${state.turn}: la campaña se mueve`,
    body: 'Tu agenda y las de tus rivales ya tienen consecuencias. Elige qué necesitas cambiar en el siguiente turno.',
    entries: state.timeline.slice(start).filter(e => e.kind !== 'rival'), rivalMoves, provinceChanges,
    organizationReturns, teamOpinions: teamThoughts(state)};
  state.phase = 'debrief';
  if (state.turn === bundle.config.turns) {
    for (const promise of state.promises) if (promise.status === 'open') {promise.status = 'missed'; promise.closedTurn = state.turn;}
    state.electionResult = countElection(state, bundle);
  }
  return {ok: true};
}

function castVote(state, command, bundle) {
  const n = state.negotiation;
  if (n.stage !== 'vote' || !['yes', 'no', 'abstain'].includes(command.vote)) return fail('INVALID_VOTE', 'Elige sí, no o abstención');
  const preview = getNegotiationPreview(state, bundle, null, command.vote);
  const result = evaluateInvestiture({round: n.ballot, ...preview.totals, firstRoundFailed: n.ballot === 2});
  if (!result.ok) throw new Error('Investidura no válida: ' + result.error);
  const bridges=Object.fromEntries(Object.entries(preview.details).filter(([,d])=>d.bridge).map(([id,d])=>[id,d.bridge]));
  const voteRecord = {proponent: n.proponent, offer: [...n.offer], ballot: n.ballot, votes: preview.votes, totals: preview.totals, bridges, invested: result.invested};
  n.history.push(voteRecord);
  const title = `${partyMeta(bundle, n.proponent).name}: ${result.invested ? 'investidura aprobada' : 'no alcanza la mayoría'}`;
  record(state, {kind: 'negotiation', title, body: `${preview.totals.yes} síes, ${preview.totals.no} noes y ${preview.totals.abstain} abstenciones.`, changes: []});
  state.lastTransition = {title, body: state.timeline.at(-1).body, entries: [state.timeline.at(-1)]};
  if (result.invested) {
    const reviewedCommitments = n.proponent === 'P1' ? state.commitments.filter(id => n.offer[bundle.config.topics.findIndex(t => t.id === id)] < bundle.config.negotiation.commitmentMinUnits) : [];
    if (reviewedCommitments.length) changeStat(state, bundle, 'P1', 'reputation', -reviewedCommitments.length * bundle.config.negotiation.brokenCommitmentReputationCost);
    state.outcome = {type: n.proponent === 'P1' ? 'government' : preview.votes.P1 === 'yes' ? 'support' : 'opposition', winner: n.proponent, reviewedCommitments, votes: voteRecord};
    state.phase = 'ending';
  } else if (n.ballot === 1) {
    n.ballot = 2;
    state.lastTransition.body += ' La segunda votación se sitúa 48 horas después: ahora bastan más síes que noes.';
  } else {
    n.index++;
    if (n.index >= n.proponents.length) {
      state.outcome = {type: 'deadlock', winner: null, reviewedCommitments: []}; state.phase = 'ending';
    } else {
      n.proponent = n.proponents[n.index]; n.ballot = 1;
      n.stage = n.proponent === 'P1' ? 'offer' : 'vote';
      n.offer = n.proponent === 'P1' ? null : chooseOffer(state, bundle, n.proponent);
    }
  }
  return {ok: true};
}

export function dispatch(state, command, bundle) {
  try {
    const selected=selectBundle(bundle,state);
    if(selected.config.rulesVersion==='0.6.1')return previousEngine.dispatch(state,command,selected);
    if(selected.config.rulesVersion==='0.7.0')return engineV070.dispatch(state,command,selected);
    if(selected.config.rulesVersion==='0.8.1')return engineV081.dispatch(state,command,selected);
    if(selected.config.rulesVersion==='0.8.2')return engineV082.dispatch(state,command,selected);
  if(selected.config.rulesVersion==='0.8.0')return engineV080.dispatch(state,command,selected);
    bundle = resolveCampaignBundle(bundle, state);
    assertSafeTree(command);
    if (!command || typeof command.id !== 'string' || command.id.length < 1 || command.id.length > 128) return fail('INVALID_COMMAND_ID', 'La decisión no tiene un identificador válido');
    if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision !== state.revision) return fail('STALE_COMMAND', 'La partida ha cambiado; revisa la pantalla actual');
    if (state.commandLog.some(c => c.id === command.id)) return fail('DUPLICATE_COMMAND', 'Esa decisión ya está registrada');
    const allowed = {CHOOSE_OPTION: ['event'], CONFIRM_PLAN: ['planning'], CONTINUE: ['debrief'],
      BEGIN_NEGOTIATION: ['election'], PROPOSE: ['negotiation'], COUNTEROFFER: ['negotiation'], REVISE_OFFER: ['negotiation'], VOTE: ['negotiation']};
    if (!allowed[command.type]?.includes(state.phase)) return fail('INVALID_PHASE', 'Esa decisión no corresponde a esta fase');
    if (state.commandLog.length >= bundle.config.runtime.maxCommands) return fail('COMMAND_LIMIT', 'Se ha alcanzado el límite del registro de partida');
    const next = clone(state);
    let result = {ok: true};
    if (command.type === 'CHOOSE_OPTION') result = chooseOption(next, command, bundle);
    if (command.type === 'CONFIRM_PLAN') result = confirmPlan(next, command, bundle);
    if (command.type === 'CONTINUE') {
      if (next.turn < bundle.config.turns) beginTurn(next, bundle); else next.phase = 'election';
    }
    if (command.type === 'BEGIN_NEGOTIATION') {startNegotiation(next, bundle); next.phase = 'negotiation';}
    if (command.type === 'PROPOSE') {
      if (next.negotiation.stage !== 'offer' || next.negotiation.proponent !== 'P1' || !validOffer(command.offer, bundle.config)) return fail('INVALID_OFFER', 'Reparte seis unidades entre los cuatro temas, con un máximo de tres por tema');
      next.negotiation.offer = [...command.offer]; next.negotiation.stage = 'vote';
    }
    if(command.type==='COUNTEROFFER'){
      const preview=counterofferPreview(next,bundle,command.offer,command.target);
      if(!preview.ok)return preview;
      const changes=[];
      changeStat(next,bundle,'P1','budget',-preview.cost,changes);
      if(preview.accepted){next.negotiation.offer=[...command.offer];if(preview.relationBonus)relationship(next,bundle,'P1',command.target,preview.relationBonus,changes);}
      const exchange={proponent:next.negotiation.proponent,target:command.target,originalOffer:[...preview.originalOffer],offer:[...command.offer],accepted:preview.accepted,cost:preview.cost,reason:preview.reason};
      if(preview.accepted)next.negotiation.exchanges.push(exchange);
      const entry=record(next,{kind:'negotiation',title:preview.accepted?'La contraoferta acerca el acuerdo':'La contraoferta no prospera',body:preview.reason,changes});
      next.lastTransition={title:entry.title,body:entry.body,entries:[entry]};
    }
    if(command.type==='REVISE_OFFER'){
      const preview=revisionPreview(next,bundle,command.offer);
      if(!preview.ok)return preview;
      const changes=[];changeStat(next,bundle,'P1','budget',-preview.cost,changes);
      const previous=[...next.negotiation.offer];next.negotiation.offer=[...command.offer];next.negotiation.revisionUsed=true;
      const entry=record(next,{kind:'negotiation',title:'Una última revisión del programa',body:'Mueves una prioridad antes de la segunda votación. Los partidos reconsideran el conjunto.',changes,originalOffer:previous,offer:[...command.offer]});
      next.lastTransition={title:entry.title,body:entry.body,entries:[entry]};
    }
    if (command.type === 'VOTE') result = castVote(next, command, bundle);
    if (!result.ok) return result;
    next.revision++;
    next.commandLog.push(clone(command));
    return {ok: true, state: next};
  } catch (error) {
    return fail('RULE_ERROR', 'No se pudo resolver la decisión: ' + error.message);
  }
}
