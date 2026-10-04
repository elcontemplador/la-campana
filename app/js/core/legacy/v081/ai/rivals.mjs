import {compareId, distance, hashKey, present} from '../core/utils.mjs';
import {choosePlan as previousPlan} from '../../v061/ai/rivals.mjs';

// Skill changes how public information is used, never costs or access to truth.
const skills = {
  iniciacion: {baseline: 1, opportunity: 4, defense: 0.5, reaction: 0, protect: false},
  normal: {baseline: 0.35, opportunity: 16, defense: 0.75, reaction: 12, protect: true},
  exigente: {baseline: 0.15, opportunity: 18, defense: 1.25, reaction: 18, protect: true},
};

// This policy accepts an observation, never GameState or hidden support weights.
export function choosePlan(observation) {
  if(observation.config.rulesVersion==='0.6.1')return previousPlan(observation);
  const {config: c, partyId: id, party: own, districts, polls, seed, turn, parties} = observation;
  const meta = parties.find(p => p.id === id);
  const skill = skills[observation.difficulty] ?? skills.normal;
  const findCandidate = action => c.candidateActions.find(a => a.id === action);
  const findStaff = action => c.staffActions.find(a => a.id === action);
  let budget = own.budget;
  let energy = own.energy;
  const plan = {candidate: {id: 'rest', target: null}, staff: {G1: {id: 'wait', target: null}, G2: {id: 'wait', target: null}}};
  const lastVisit = observation.lastPlayerMove?.actionId === 'visit'
    && observation.lastPlayerMove.turn === turn - 1 ? observation.lastPlayerMove.target : null;
  const ranked = districts.filter(d => present(meta, d.id)).map(d => {
    const poll = polls.districts[d.id];
    const values = poll.values;
    const ownPct = Math.round(values[id].center / 100);
    const scores = Object.entries(values).map(([p, v]) => [p, Math.round(v.center / 100)]).sort((a, b) => b[1] - a[1] || compareId(a[0], b[0]));
    const rivalPct = Math.max(...scores.filter(x => x[0] !== id).map(x => x[1]));
    const rank = scores.findIndex(x => x[0] === id);
    let priority = d.seats / (1 + Math.abs(ownPct - rivalPct)) / (1 + (own.repeatCounts['visit:' + d.id] ?? 0));
    if (meta.archetype === 'prudente' && rank === 0) priority *= 1.2;
    if (meta.archetype === 'territorial' && rank === 1) priority *= 1.2;
    if (meta.archetype === 'agresivo' && own.organization[d.id] < 2) priority *= 1.2;
    const opportunity = poll.opportunity;
    // Normalize the public ballot margin to compare districts of different sizes.
    const e = c.electorate;
    const ballots = d.seats * e.perSeat * e.turnoutPermille / 1000
      * (1000 - e.blankPermilleOfCast - e.invalidPermilleOfCast) / 1000;
    const marginBp = votes => Math.max(0, votes) / Math.max(1, ballots) * 10000;
    const attack = opportunity?.attack ? 1 / (1 + marginBp(opportunity.attack.votesNeeded) / 120) : 0;
    const defense = opportunity?.defense ? 1 / (1 + marginBp(opportunity.defense.votesMargin) / 80) : 0;
    const reacts = d.id === lastVisit && (opportunity?.defense?.against === 'P1'
      || opportunity?.attack?.against === 'P1');
    const threat = opportunity?.defense?.against === 'P1' ? defense : attack;
    const repeatFactor = c.support.repeatPercent[Math.min(own.repeatCounts['visit:' + d.id] ?? 0, c.support.repeatPercent.length - 1)] / 100;
    const styleAttack = meta.archetype === 'agresivo' ? 1.15 : 1;
    const styleDefense = meta.archetype === 'prudente' ? 1.15 : 1;
    priority = priority * skill.baseline + skill.opportunity
      * Math.max(attack * styleAttack * repeatFactor, defense * skill.defense * styleDefense)
      + (reacts ? skill.reaction * threat : 0);
    return {id: d.id, priority, reacts, attack, defense};
  }).sort((a, b) => b.priority - a.priority || hashKey('rival-v1', seed, turn, id, a.id) - hashKey('rival-v1', seed, turn, id, b.id) || compareId(a.id, b.id));
  const target = ranked[0]?.id;
  const organization = {...own.organization};
  let readiness = own.readiness;
  function reserve(actor, action, destination = null) {
    const spec = actor === 'candidate' ? findCandidate(action) : findStaff(action);
    const cost = destination === 'national' && spec.nationalCost ? spec.nationalCost : spec.cost;
    if (budget < cost.budget || energy < cost.energy) return false;
    if (action === 'organize' && organization[destination] >= c.resources.organization.max) return false;
    if (action === 'prepare' && readiness >= c.resources.readiness.max) return false;
    budget -= cost.budget; energy -= cost.energy;
    if (action === 'organize') organization[destination] = (organization[destination] ?? 0) + spec.effect.organization;
    if (action === 'prepare') readiness = Math.min(c.resources.readiness.max, readiness + spec.effect.readiness);
    const item = {id: action, target: destination};
    if (actor === 'candidate') plan.candidate = item; else plan.staff[actor] = item;
    return true;
  }
  const rhythm={prudente:{cash:24,energy:34},territorial:{cash:11,energy:24},agresivo:{cash:17,energy:20}}[meta.archetype];
  const offset=hashKey('rival-rhythm-v07',seed,id)%5-2;
  if(turn===c.turns){
    if(!target||!reserve('candidate','visit',target))reserve('candidate','interview','national');
  } else if (energy < rhythm.energy+offset) reserve('candidate', 'rest');
  else if (budget < rhythm.cash+offset) {
    if(!reserve('candidate', 'fundraise'))reserve('candidate','rest');
  }
  else if (meta.archetype === 'agresivo' && c.deck.rivalContrastTurns.includes(turn)) {
    const leaders = Object.entries(polls.national).filter(([p]) => p !== id)
      .filter(([partyId]) => ranked.some(d => present(parties.find(p => p.id === partyId), d.id)))
      .map(([partyId, poll]) => {
        const rival = parties.find(p => p.id === partyId);
        const disagreements = c.topics.filter(t => meta.positions[t.id] !== rival.positions[t.id]).length;
        return [partyId, poll.center + disagreements * c.deck.rivalContrastDisagreementBp];
      }).sort((a, b) => b[1] - a[1] || compareId(a[0], b[0]));
    if (!leaders.length || !reserve('candidate', 'contrast', leaders[0][0])) reserve('candidate', 'rest');
  } else if (!target || !reserve('candidate', 'visit', target)) {
    if (!reserve('candidate', 'interview', 'national')) reserve('candidate', 'rest');
  }
  let mediated = false;
  if ((c.negotiation.rivalMediationTurns ?? [c.negotiation.rivalMediationTurn]).includes(turn)) {
    const candidates = parties.filter(p => p.id !== id && (own.relations[p.id] ?? 0) < c.resources.relation.max)
      .map(p => ({...p, compatibility: distance(meta.policyIdeal, p.policyIdeal)
        + c.topics.filter(t => meta.positions[t.id] !== p.positions[t.id]).length * c.negotiation.rivalStancePriorityWeight
        - (own.relations[p.id] ?? 0)}))
      .sort((a, b) => a.compatibility - b.compatibility || compareId(a.id, b.id));
    // Reserve a scheduled agreement before optional publicity can empty the box.
    if (candidates.length) mediated = reserve('G2', 'mediate', candidates[0].id);
  }
  let prepared = false;
  if (!mediated && skill.protect && plan.candidate.id === 'contrast' && readiness === 0) {
    prepared = reserve('G2', 'prepare');
  }
  if (target) {
    const immediate = skill.protect && (ranked[0].reacts || turn >= c.turns - 1 && ranked[0].attack > 0.5);
    const advertising = immediate || meta.archetype === 'agresivo' && turn % 2 === 0;
    if (!(advertising && reserve('G1', 'advertise', target))) reserve('G1', 'organize', target);
  }
  if (!mediated && !prepared && target && turn<c.turns) {
    const research = own.research[target];
    if (!(research && research.from <= turn && research.through >= turn)) reserve('G2', 'research', target);
    const nextContrast = meta.archetype === 'agresivo' && c.deck.rivalContrastTurns.some(t => t >= turn && t <= turn + 1);
    if (plan.staff.G2.id === 'wait' && (!skill.protect || nextContrast && readiness === 0)) reserve('G2', 'prepare');
    if (plan.staff.G2.id === 'wait' && skill.protect) reserve('G2', 'organize', target);
  }
  return plan;
}
