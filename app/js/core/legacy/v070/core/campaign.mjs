import {evaluateInvestiture} from './electoral.mjs';
import {evaluateSupport} from './negotiation.mjs';
import {clamp} from './utils.mjs';
import {selectBundle} from './bundles.mjs';

const sourceOf = bundle => bundle.campaignBase ?? bundle;
const setupOf = value => value?.initialSetup ?? value ?? {};

export function campaignDefinition(bundle, value = {}) {
  const c = sourceOf(bundle).config, setup = setupOf(value);
  const id = setup.campaignScenario ?? c.defaultCampaignScenario;
  const definition = c.campaignScenarios.find(s => s.id === id);
  if (!definition) throw new Error('Elige una campaña del catálogo');
  return definition;
}

export function difficultyDefinition(bundle, value = {}) {
  const c = sourceOf(bundle).config, setup = setupOf(value);
  const definition = c.difficulties.find(d => d.id === (setup.difficulty ?? c.defaultDifficulty));
  if (!definition) throw new Error('Elige una dificultad del catálogo');
  return definition;
}

export function partyIdentityDefinition(bundle, value = {}) {
  const c = sourceOf(bundle).config, setup = setupOf(value);
  const definition = c.partyIdentities.find(p => p.id === (setup.partyIdentity ?? c.defaultPartyIdentity));
  if (!definition) throw new Error('Elige un partido del catálogo');
  return definition;
}

export function campaignCommitments(bundle, value = {}) {
  const campaign = campaignDefinition(bundle, value), identity = partyIdentityDefinition(bundle, value);
  const regional = campaign.priorityOverrides?.find(p => p.partyIdentity === identity.id);
  if (regional) return [...regional.commitments];
  const priorities = [...identity.defaultCommitments];
  if (campaign.objective.kind !== 'territorial') return priorities;
  const territory = campaign.objective.topicId;
  return [priorities.find(id => id !== territory), territory];
}

export function resolveCampaignBundle(bundle, value = {}) {
  const source = selectBundle(sourceOf(bundle),value);
  const campaign = campaignDefinition(source, value);
  const difficulty = difficultyDefinition(source, value);
  const selected = partyIdentityDefinition(source, value);
  const allies = source.config.partyIdentities.filter(p => p.id !== selected.id && p.positions.T3 === selected.positions.T3);
  const opponents = source.config.partyIdentities.filter(p => p.positions.T3 !== selected.positions.T3);
  const identities = [selected, opponents[0], ...allies, ...opponents.slice(1)];
  const identityByRole = Object.fromEntries(['P1','P2','P3','P4','R1','R2'].map((id,index) => [id,identities[index]]));
  const key = campaign.id + ':' + difficulty.id + ':' + selected.id;
  if (bundle.campaignKey === key && bundle.campaignBase === source) return bundle;
  const parties = source.config.parties.map(p => {
    const {id: identityKey, ...identity} = identityByRole[p.id];
    const override = campaign.partyOverrides.find(o => o.id === p.id);
    return {...p, ...identity, ...override, id: p.id, identityId: identityKey,
      archetype: p.id === 'P1' ? 'jugador' : identity.archetype};
  });
  const config = {...source.config,
    parties,
    partyColors: Object.fromEntries(parties.map(p => [p.id, p.color])),
    negotiation: {...source.config.negotiation, playerFirstProposal: difficulty.playerFirstProposal},
  };
  return {...source, config, campaignBase: source, campaignKey: key};
}

export function initialResources(bundle, setup, partyId) {
  const source = sourceOf(bundle);
  const campaign = campaignDefinition(source, setup);
  const difficulty = difficultyDefinition(source, setup);
  const own = Object.fromEntries(['budget','energy','cohesion','reputation','readiness']
    .map(k => [k, source.config.resources[k].initial]));
  Object.assign(own, partyId === 'P1' ? campaign.playerResources : difficulty.rivalResources);
  if (partyId === 'P1') for (const [key, extra] of Object.entries(difficulty.playerResourceBonus)) {
    const rule = source.config.resources[key];
    own[key] = clamp(own[key] + extra, rule.min, rule.max);
  }
  return own;
}

export function campaignObjective(state, bundle) {
  const definition = campaignDefinition(bundle, state), goal = definition.objective;
  const seats = state.electionResult?.national.seatsByParty.P1;
  const projection = state.publishedPolls?.P1.projection.P1;
  const estimated = seats === undefined;
  const fulfilled = state.negotiation?.history.find(v => v.invested);
  const keepPriorities = Boolean(fulfilled && state.commitments.every(id =>
    fulfilled.offer[bundle.config.topics.findIndex(t => t.id === id)] >= bundle.config.negotiation.commitmentMinUnits));
  const leads = state.outcome?.type === 'government';
  const supports = state.outcome?.type === 'support';
  const sufficientSeats = goal.seatTarget === undefined || (seats ?? -1) >= goal.seatTarget;
  const territory = goal.topicId ? Boolean(fulfilled && fulfilled.offer[bundle.config.topics.findIndex(t => t.id === goal.topicId)] >= goal.minUnits) : true;
  const agreed = leads || supports;
  const achieved = goal.kind === 'seats' ? sufficientSeats && !estimated
    : Boolean(state.phase === 'ending' && (goal.kind === 'government' ? leads : agreed && sufficientSeats && territory)
      && (!goal.requireCommitments || keepPriorities));
  let pivotal = false, blockingPower=false;
  const concession=Boolean(fulfilled&&state.negotiation?.exchanges?.some(e=>e.accepted&&e.proponent===fulfilled.proponent&&fulfilled.proponent!=='P1'
    && e.offer.every((v,i)=>v===fulfilled.offer[i])&&state.commitments.some(id=>{const i=bundle.config.topics.findIndex(t=>t.id===id);return e.offer[i]>e.originalOffer[i];})));
  if(fulfilled&&fulfilled.proponent!=='P1'){
    const actual=fulfilled.votes.P1;
    if(actual==='yes'){
      const alternative={...fulfilled.totals,yes:fulfilled.totals.yes-seats,abstain:fulfilled.totals.abstain+seats};
      const totals=Object.keys(fulfilled.bridges||{}).length?evaluateSupport(state,bundle,fulfilled.proponent,fulfilled.offer,'abstain').totals:alternative;
      const result=evaluateInvestiture({round:fulfilled.ballot,...totals,firstRoundFailed:fulfilled.ballot===2});
      pivotal=result.ok&&!result.invested;
    }
    const alternative={...fulfilled.totals};
    alternative[actual]-=seats;alternative.no+=seats;
    const totals=Object.keys(fulfilled.bridges||{}).length?evaluateSupport(state,bundle,fulfilled.proponent,fulfilled.offer,'no').totals:alternative;
    const block=evaluateInvestiture({round:fulfilled.ballot,...totals,firstRoundFailed:fulfilled.ballot===2});
    blockingPower=block.ok&&!block.invested;
  }
  const progress = estimated
    ? projection ? 'Sondeo: ' + projection.min + '–' + projection.max + ' escaños' : 'La campaña todavía no tiene recuento'
    : String(seats) + (goal.seatTarget ? ' de ' + goal.seatTarget + ' escaños buscados' : ' escaños');
  const details = [];
  if (goal.seatTarget) details.push(estimated ? 'Objetivo: ' + goal.seatTarget + ' escaños' : sufficientSeats ? 'Has alcanzado el objetivo de escaños.' : 'Faltan ' + (goal.seatTarget - seats) + ' escaños para el objetivo.');
  if (goal.kind === 'government') details.push(state.phase !== 'ending' ? 'La investidura decidirá si encabezas el Gobierno.' : leads ? 'Tu candidatura encabeza el Gobierno.' : 'La presidencia queda fuera de tu candidatura.');
  if (goal.kind === 'territorial') {
    details.push(!fulfilled ? 'El acuerdo de Gobierno sigue pendiente.' : agreed ? 'Tu candidatura participa en el acuerdo.' : 'Has quedado fuera del acuerdo.');
    details.push(!fulfilled ? 'Territorio necesita al menos ' + goal.minUnits + ' unidades.' : territory ? 'El acuerdo reserva la prioridad territorial buscada.' : 'El acuerdo no llega a la prioridad territorial buscada.');
  }
  if (goal.requireCommitments) details.push(!fulfilled ? 'Mantén al menos dos unidades en cada prioridad.' : keepPriorities ? 'Las dos prioridades se mantienen.' : 'El acuerdo reduce alguna de tus prioridades.');
  if(pivotal)details.push('Tu apoyo fue necesario: abstenerte habría impedido esa investidura.');
  else if(blockingPower)details.push('Tenías capacidad de bloqueo con un no, aunque la investidura no necesitaba tus síes.');
  if(concession)details.push('Lograste una concesión: el acuerdo mejoró una prioridad tuya tras la contraoferta.');
  if(goal.kind==='territorial'&&agreed&&!pivotal&&!concession)details.push('Participas en el acuerdo; tu apoyo no fue imprescindible y no se registró una concesión negociada.');
  return {kind:goal.kind,title:goal.title,description:goal.description,achieved,progress,
    seatTarget:goal.seatTarget ?? null,details,estimated,pivotal,blockingPower,concession,
    influence:{participated:agreed,pivotal,blockingPower,concession,bonus:pivotal&&concession?'bisagra decisiva':pivotal?'apoyo necesario':concession?'concesión negociada':agreed?'participación':'sin acuerdo'}};
}
