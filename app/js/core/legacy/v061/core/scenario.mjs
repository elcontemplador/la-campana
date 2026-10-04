import {assertSafeTree, checksum, present} from './utils.mjs';
import {campaignDefinition, difficultyDefinition, partyIdentityDefinition, resolveCampaignBundle} from './campaign.mjs';

const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const insist = (condition, message) => { if (!condition) throw new Error(message); };
const ids = items => items.map(x => x.id);
const unique = values => new Set(values).size === values.length;
const allowedEffects = {
  topic_support: ['type','topicId','base'],
  stat: ['type', 'stat', 'delta'], rapport: ['type', 'target', 'delta'],
  relation: ['type', 'target', 'delta'], organization: ['type', 'target', 'delta'],
  support: ['type', 'target', 'delta'], flag: ['type', 'flag', 'value'],
  promise_open: ['type', 'id', 'target', 'dueTurn'], promise_close: ['type', 'id', 'status'],
};

export function validateBundle(bundle) {
  assertSafeTree(bundle);
  const {config: c, provinces: p, content} = bundle;
  insist(c && p && content, 'Faltan datos del escenario');
  insist([6,8,10,12].includes(c.turns) && c.playerParty === 'P1' && c.staffSelection === 2, 'Escenario no compatible');
  insist(c.runtime.externalAI === false, 'Este juego requiere el escenario local');
  insist(p.districts.length === 52 && unique(ids(p.districts)), 'Circunscripciones no válidas');
  insist(p.districts.reduce((s, d) => s + d.seats, 0) === 350, 'Deben existir 350 escaños');
  const provinces = new Set(ids(p.districts));
  for (const d of p.districts) {
    insist(/^\d{2}$/.test(d.id) && integer(d.seats, 1, 37), 'Ficha provincial no válida');
    insist(d.system === (['51', '52'].includes(d.id) ? 'single_member' : 'dhondt'), 'Método de reparto no válido');
  }
  insist(c.parties.length === 6 && unique(ids(c.parties)), 'Partidos no válidos');
  const parties = new Set(ids(c.parties));
  insist(['P1','P2','P3','P4','R1','R2'].every(id => parties.has(id)), 'Roles de candidatura no válidos');
  insist(Array.isArray(c.partyIdentities) && c.partyIdentities.length === 6 && unique(ids(c.partyIdentities)), 'Identidades de partido no válidas');
  const identities = new Set(ids(c.partyIdentities));
  insist([-1,1].every(pole => c.partyIdentities.filter(p => p.positions?.T3 === pole).length === 3), 'La apertura necesita dos familias de tres perfiles');
  insist(identities.has(c.defaultPartyIdentity) && c.parties.every(p => identities.has(p.identityId))
    && unique(c.parties.map(p => p.identityId)), 'Cada color debe aparecer una sola vez');
  insist(unique(c.partyIdentities.map(p => p.color)) && unique(c.partyIdentities.map(p => p.short)), 'Colores y abreviaturas deben ser distintos');
  for (const p of c.partyIdentities) {
    insist(['name','short','ideology','summary','playHint'].every(k => typeof p[k] === 'string' && p[k].trim())
      && /^#[0-9a-f]{6}$/i.test(p.color), 'Ficha ideológica no válida');
    insist(Array.isArray(p.keys) && p.keys.length >= 2 && p.keys.every(k => typeof k === 'string' && k.trim()), 'Claves ideológicas no válidas');
    insist(validOffer(p.policyIdeal, c) && Object.keys(p.positions).length === c.topics.length
      && c.topics.every(t => p.positions[t.id] === -1 || p.positions[t.id] === 1), 'Programa ideológico no válido');
    insist(Array.isArray(p.defaultCommitments) && p.defaultCommitments.length === 2 && unique(p.defaultCommitments)
      && p.defaultCommitments.every(id => c.topics.some(t => t.id === id)
        && p.policyIdeal[c.topics.findIndex(t => t.id === id)] >= c.negotiation.commitmentMinUnits), 'Prioridades ideológicas incoherentes');
    insist(['prudente','territorial','agresivo'].includes(p.archetype), 'Estilo rival no válido');
  }
  insist(Array.isArray(c.partyRelations) && c.partyRelations.every(r => identities.has(r.a) && identities.has(r.b)
    && r.a !== r.b && integer(r.value, -1, 1))
    && unique(c.partyRelations.map(r => [r.a,r.b].sort().join(':'))), 'Relaciones ideológicas iniciales no válidas');
  insist(integer(c.negotiation.rivalStancePriorityWeight, 0, 6) && integer(c.negotiation.stanceDisagreementPenalty, 0, 6)
    && integer(c.deck.rivalContrastDisagreementBp, 0, 1000), 'Coeficientes ideológicos no válidos');
  insist(integer(c.negotiation.broadDisagreementThreshold, 1, c.topics.length)
    && integer(c.negotiation.broadDisagreementPenalty, 0, 4)
    && integer(c.negotiation.rivalCommitmentMinUnits, 1, c.negotiation.commitmentMinUnits), 'Condiciones de acuerdo ideológico no válidas');
  const bridge=c.negotiation.dialogueBridge;
  insist(bridge&&integer(bridge.minPlayerRelation,c.negotiation.minRelationForAutomaticSupport+1,c.resources.relation.max)
    &&integer(bridge.minDirectRelation,c.resources.relation.min,c.negotiation.minRelationForAutomaticSupport)
    &&integer(bridge.relationDiscount,1,bridge.minPlayerRelation-c.negotiation.minRelationForAutomaticSupport),
    'Condiciones de diálogo no válidas');
  const staff = new Set(ids(c.staff));
  const civilians = new Set(ids(c.civilActors));
  const profiles = new Set(ids(c.candidateProfiles));
  insist(staff.size === 4 && civilians.size === 2 && profiles.size === 3, 'Reparto de personajes no válido');
  for (const party of c.parties) {
    insist(integer(party.baseWeight, 100, 10000), 'Peso inicial no válido');
    insist(party.eligibility === 'all' || (Array.isArray(party.eligibility)
      && unique(party.eligibility) && party.eligibility.every(id => provinces.has(id))), 'Ámbito de candidatura no válido');
    if (party.id !== 'P1') insist(validOffer(party.policyIdeal, c), 'Ideal de un rival no válido');
  }
  for (const r of Object.values(c.resources)) {
    insist(integer(r.min, -10, 100) && integer(r.max, r.min, 160)
      && integer(r.initial, r.min, r.max), 'Recurso inicial fuera de límites');
  }
  insist(Array.isArray(c.campaignScenarios) && c.campaignScenarios.length === 4 && unique(ids(c.campaignScenarios)), 'Campañas no válidas');
  insist(Array.isArray(c.difficulties) && c.difficulties.length === 3 && unique(ids(c.difficulties)), 'Dificultades no válidas');
  insist(c.campaignScenarios.some(s=>s.id===c.defaultCampaignScenario) && c.difficulties.some(d=>d.id===c.defaultDifficulty), 'Falta la campaña o dificultad inicial');
  const resourceKeys = ['budget','energy','cohesion','reputation','readiness'];
  const validResources = values => values && typeof values === 'object' && !Array.isArray(values)
    && Object.entries(values).every(([key,n])=>resourceKeys.includes(key) && integer(n,c.resources[key].min,c.resources[key].max));
  for (const s of c.campaignScenarios) {
    insist(/^[a-z]+$/.test(s.id) && ['label','tagline','description'].every(k=>typeof s[k]==='string' && s[k].trim()), 'Ficha de campaña no válida');
    insist(Array.isArray(s.partyOverrides) && unique(ids(s.partyOverrides)), 'Cambios de candidatura no válidos');
    for (const o of s.partyOverrides) {
      insist(parties.has(o.id) && Object.keys(o).every(k=>['id','name','baseWeight','eligibility'].includes(k)), 'Cambio de partido desconocido');
      if (Object.hasOwn(o,'baseWeight')) insist(integer(o.baseWeight,100,10000), 'Peso de campaña no válido');
      if (Object.hasOwn(o,'name')) insist(typeof o.name==='string' && o.name.trim().length>0, 'Nombre de campaña no válido');
      if (Object.hasOwn(o,'eligibility')) insist(o.eligibility==='all' || Array.isArray(o.eligibility) && o.eligibility.length && unique(o.eligibility) && o.eligibility.every(id=>provinces.has(id)), 'Ámbito de campaña no válido');
    }
    const effective = resolveCampaignBundle(bundle,{campaignScenario:s.id}).config;
    insist(provinces.has(s.initialProvince) && present(effective.parties.find(p=>p.id==='P1'),s.initialProvince), 'Inicio de campaña fuera de ámbito');
    insist(Array.isArray(s.defaultCommitments) && s.defaultCommitments.length===2 && unique(s.defaultCommitments) && s.defaultCommitments.every(id=>c.topics.some(t=>t.id===id)), 'Prioridades iniciales no válidas');
    const priorityOverrides = s.priorityOverrides ?? [];
    insist(Array.isArray(priorityOverrides) && unique(priorityOverrides.map(p=>p.partyIdentity))
      && priorityOverrides.every(p=>identities.has(p.partyIdentity) && typeof p.description==='string' && p.description.trim()
        && Array.isArray(p.commitments) && p.commitments.length===2 && unique(p.commitments)
        && p.commitments.every(id=>c.topics.some(t=>t.id===id))), 'Agenda regional de partido no válida');
    insist(validResources(s.playerResources), 'Recursos de campaña no válidos');
    insist(Array.isArray(s.initialRelations) && s.initialRelations.every(r=>parties.has(r.a)&&parties.has(r.b)&&r.a!==r.b&&integer(r.value,c.resources.relation.min,c.resources.relation.max)), 'Relaciones iniciales no válidas');
    insist(new Set(s.initialRelations.map(r=>[r.a,r.b].sort().join(':'))).size===s.initialRelations.length, 'Relaciones iniciales duplicadas');
    insist(Array.isArray(s.initialOrganization) && s.initialOrganization.every(o=>parties.has(o.partyId)&&integer(o.level,c.resources.organization.min,c.resources.organization.max)&&Array.isArray(o.provinces)&&unique(o.provinces)&&o.provinces.every(id=>provinces.has(id)&&present(effective.parties.find(p=>p.id===o.partyId),id))), 'Organización inicial no válida');
    const g=s.objective;
    insist(g && ['government','seats','territorial'].includes(g.kind) && typeof g.title==='string' && typeof g.description==='string', 'Objetivo de campaña no válido');
    if (g.kind==='seats'||g.kind==='territorial') insist(integer(g.seatTarget,1,350), 'Objetivo de escaños no válido');
    if (g.kind==='territorial') insist(c.topics.some(t=>t.id===g.topicId)&&integer(g.minUnits,1,c.negotiation.maxUnitsPerTopic), 'Objetivo territorial no válido');
    if (Object.hasOwn(g,'requireCommitments')) insist(typeof g.requireCommitments==='boolean', 'Compromisos de objetivo no válidos');
  }
  for (const d of c.difficulties) {
    insist(/^[a-z]+$/.test(d.id)&&typeof d.label==='string'&&typeof d.description==='string'&&typeof d.playerFirstProposal==='boolean', 'Ficha de dificultad no válida');
    insist(validResources(d.rivalResources), 'Recursos rivales no válidos');
    insist(d.playerResourceBonus&&Object.entries(d.playerResourceBonus).every(([key,n])=>resourceKeys.includes(key)&&integer(n,0,20)), 'Ayuda inicial no válida');
  }
  for (const list of [c.candidateActions, c.staffActions]) {
    insist(Array.isArray(list) && unique(ids(list)), 'Catálogo de acciones no válido');
    for (const a of list) insist(integer(a.cost.budget, 0, 60) && integer(a.cost.energy, 0, 100), 'Coste de acción no válido');
  }
  insist(content.events.length === c.deck.eventCount && unique(ids(content.events)), 'Mazo de situaciones no válido');
  for (let turn = 1; turn <= c.turns; turn++) {
    const fallback = content.events.filter(e => e.turn === turn && e.fallback);
    insist(fallback.length === 1 && !fallback[0].requiresFlags.length
      && !fallback[0].forbidsFlags.length && fallback[0].requiresOpenPromise === null, 'Falta una salida general de turno');
  }
  for (const e of content.events) {
    insist(integer(e.turn, 1, c.turns) && typeof e.title === 'string' && typeof e.body === 'string', 'Situación no válida');
    const shortText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
    if (Object.hasOwn(e,'shortBody')) insist(shortText(e.shortBody,180), 'Resumen de situación no válido');
    insist(Array.isArray(e.requiresFlags) && Array.isArray(e.forbidsFlags), 'Condición no válida');
    insist([null, 'ANY', 'C1_REPLY', 'C2_REVIEW'].includes(e.requiresOpenPromise), 'Condición de tarea no válida');
    for (const stage of e.stages ?? [e]) {
      if (Object.hasOwn(stage,'shortBody')) insist(shortText(stage.shortBody,180), 'Resumen de intervención no válido');
      insist(Array.isArray(stage.options) && unique(ids(stage.options)), 'Opciones no válidas');
      let free = false;
      for (const o of stage.options) {
        insist(integer(o.cost.budget, 0, 8) && integer(o.cost.energy, 0, 12), 'Coste de situación fuera de límites');
        insist([null, 'any', ...staff].includes(o.requiresStaff)
          && Boolean(o.reserveStaff) === (o.requiresStaff !== null), 'Reserva de equipo no válida');
        insist(typeof o.label === 'string' && typeof o.feedback === 'string' && typeof o.learning === 'string', 'Texto de opción no válido');
        if (Object.hasOwn(o,'shortLabel')) insist(shortText(o.shortLabel,45), 'Opción breve no válida');
        if (Object.hasOwn(o,'shortFeedback')) insist(shortText(o.shortFeedback,160), 'Respuesta breve no válida');
        insist(Array.isArray(o.effects), 'Efectos no válidos');
        for (const effect of o.effects) {
          const fields = allowedEffects[effect.type];
          insist(fields && Object.keys(effect).every(k => fields.includes(k)) && fields.every(k => Object.hasOwn(effect, k)), 'Tipo o campo de efecto desconocido');
          if (effect.type === 'stat') insist(['cohesion', 'reputation', 'readiness'].includes(effect.stat)
            && integer(effect.delta, effect.stat === 'readiness' ? -2 : -4, effect.stat === 'readiness' ? 2 : 4) && effect.delta !== 0, 'Atributo no válido');
          if (effect.type === 'rapport' || effect.type === 'relation') insist(
            (effect.type === 'rapport' ? civilians.has(effect.target) : parties.has(effect.target) && effect.target !== 'P1')
            && integer(effect.delta, -2, 2) && effect.delta !== 0, 'Relación no válida');
          if (effect.type === 'organization') insist(effect.target === 'focus' && effect.delta === 1, 'Organización no válida');
          if (effect.type === 'support') insist(['focus', 'national'].includes(effect.target)
            && integer(effect.delta, -(effect.target === 'national' ? (e.id === 'E07' ? 60 : c.support.eventNationalMaxAbs) : c.support.eventLocalMaxAbs), effect.target === 'national' ? (e.id === 'E07' ? 60 : c.support.eventNationalMaxAbs) : c.support.eventLocalMaxAbs)
            && effect.delta !== 0, 'Efecto electoral no válido');
          if (effect.type === 'topic_support') insist(c.topics.some(t=>t.id===effect.topicId) && integer(effect.base,1,40),'Tema no válido');
          if (effect.type === 'flag') insist(/^[a-zA-Z][a-zA-Z0-9]{0,60}$/.test(effect.flag) && typeof effect.value === 'boolean', 'Memoria no válida');
          if (effect.type === 'promise_open') insist(['C1_REPLY', 'C2_REVIEW'].includes(effect.id)
            && effect.target === (effect.id === 'C1_REPLY' ? 'C1' : 'C2') && effect.dueTurn === c.turns, 'Tarea no válida');
          if (effect.type === 'promise_close') insist(['C1_REPLY', 'C2_REVIEW', 'ALL_OPEN'].includes(effect.id)
            && ['fulfilled', 'reduced', 'missed'].includes(effect.status), 'Cierre de tarea no válido');
        }
        if (!o.cost.budget && !o.cost.energy && !o.reserveStaff
          && !o.effects.some(x => x.type === 'stat' && x.stat === 'readiness' && x.delta < 0)) free = true;
      }
      insist(free, 'Una situación no tiene salida gratuita');
    }
  }
  return true;
}

export function validOffer(offer, config) {
  return Array.isArray(offer) && offer.length === config.topics.length
    && offer.every(n => integer(n, 0, config.negotiation.maxUnitsPerTopic))
    && offer.reduce((s, n) => s + n, 0) === config.negotiation.topicsUnits;
}

export function normalizeSetup(bundle, seed, setup) {
  const campaign = campaignDefinition(bundle, setup);
  const difficulty = difficultyDefinition(bundle, setup);
  const identity = partyIdentityDefinition(bundle, setup);
  const c = resolveCampaignBundle(bundle, setup).config;
  const normalizedSeed = String(seed ?? '').normalize('NFC');
  insist(normalizedSeed.length >= 1 && normalizedSeed.length <= 64 && !/[\u0000-\u001f\u007f]/.test(normalizedSeed), 'El código de campaña debe tener entre 1 y 64 caracteres');
  insist(setup && typeof setup.name === 'string' && setup.name.trim().length >= 1 && setup.name.trim().length <= 40, 'El nombre debe tener entre 1 y 40 caracteres');
  insist(/^portrait-[1-6]$/.test(setup.portrait), 'Elige un retrato de la biblioteca');
  insist(c.candidateProfiles.some(x => x.id === setup.profile), 'Elige un perfil de candidato');
  insist(Array.isArray(setup.staff) && setup.staff.length === 2 && unique(setup.staff)
    && setup.staff.every(id => c.staff.some(x => x.id === id)), 'Elige dos colaboradores distintos');
  insist(Array.isArray(setup.commitments) && setup.commitments.length === 2 && unique(setup.commitments)
    && setup.commitments.every(id => c.topics.some(x => x.id === id)), 'Elige dos prioridades distintas');
  insist(bundle.provinces.districts.some(d => d.id === setup.province) && present(c.parties.find(p => p.id === 'P1'), setup.province), 'Provincia inicial no válida');
  const positions = Object.fromEntries(c.topics.map(t => [t.id, setup.positions?.[t.id] ?? c.parties.find(p => p.id === 'P1').positions[t.id]]));
  insist(Object.values(positions).every(n => n === -1 || n === 1), 'Elige una postura válida en cada tema');
  return {seed: normalizedSeed, setup: {name: setup.name.trim().normalize('NFC'), portrait: setup.portrait,
    profile: setup.profile, staff: [...setup.staff].sort(), commitments: [...setup.commitments].sort(), positions, province: setup.province,
    campaignScenario: campaign.id, difficulty: difficulty.id, partyIdentity: identity.id}};
}

export const bundleChecksum = bundle => {const source = bundle.campaignBase ?? bundle; return checksum({config: source.config, provinces: source.provinces, content: source.content});};
