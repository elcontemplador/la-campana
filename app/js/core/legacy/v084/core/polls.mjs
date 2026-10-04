import {allocateSeats} from './electoral.mjs';
import {resolveCampaignBundle} from './campaign.mjs';
import {clamp, compareId, distribute, hashKey, present, randomInt} from './utils.mjs';

export function districtIssues(bundle, seed, districtId) {
  return Object.fromEntries(bundle.config.topics.map(topic => [topic.id, {
    position: randomInt('issue-v2', seed, [districtId, topic.id, 'position'], 0, 1) ? 1 : -1,
    salience: randomInt('issue-v2', seed, [districtId, topic.id, 'salience'], 1, 3),
  }]));
}

export function districtTotals(bundle, district) {
  const e = bundle.config.electorate;
  const electorate = district.seats * e.perSeat;
  const castVotes = Math.floor(electorate * e.turnoutPermille / 1000);
  const blankVotes = Math.floor(castVotes * e.blankPermilleOfCast / 1000);
  const invalidVotes = Math.floor(castVotes * e.invalidPermilleOfCast / 1000);
  return {electorate, castVotes, blankVotes, invalidVotes, abstentions: electorate - castVotes,
    candidateVotes: castVotes - blankVotes - invalidVotes};
}

export function trueWeights(state, bundle, districtId) {
  bundle = resolveCampaignBundle(bundle, state);
  const c = bundle.config;
  const issues = districtIssues(bundle, state.seed, districtId);
  return Object.fromEntries(c.parties.filter(p => present(p, districtId)).map(p => {
    const party = state.parties[p.id];
    const affinity = c.topics.reduce((sum, topic) => sum + issues[topic.id].salience
      * (party.positions[topic.id] === issues[topic.id].position ? 1 : -1) * c.support.affinityWeight, 0);
    const base = p.baseWeight + randomInt('base-v1', state.seed, [districtId, p.id],
      -c.support.baseJitter, c.support.baseJitter);
    return [p.id, Math.max(c.support.minWeight, base + affinity + party.campaignDelta[districtId]
      + c.support.organizationWeight * party.organization[districtId]
      + c.support.reputationWeight * (party.reputation - 50))];
  }));
}

export function tieOrdersFor(votes, seed, districtId) {
  const groups = new Map();
  for (const [id, n] of Object.entries(votes)) {
    if (n <= 0) continue;
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(id);
  }
  return Object.fromEntries([...groups.entries()].filter(([, members]) => members.length > 1)
    .map(([n, members]) => [String(n), members.sort((a, b) =>
      hashKey('electoral-tie-v1', seed, districtId, n, a) - hashKey('electoral-tie-v1', seed, districtId, n, b)
      || compareId(a, b))]));
}

export function allocateDistrict(bundle, district, partyVotes, seed) {
  const totals = districtTotals(bundle, district);
  const result = allocateSeats({method: district.system, seats: district.seats, partyVotes,
    blankVotes: totals.blankVotes, invalidVotes: totals.invalidVotes,
    tieOrders: tieOrdersFor(partyVotes, seed, district.id)});
  if (!result.ok) throw new Error('Recuento no válido: ' + result.error);
  return {...totals, ...result, partyVotes};
}

export function lastSeatInfo(result, method) {
  const holder = result.seatOrder.at(-1);
  const contenders = Object.keys(result.partyVotes).filter(id => id !== holder && result.partyVotes[id] > 0);
  if (!contenders.length) return {holder, challenger: null, votesNeeded: 0};
  const holderDivisor = method === 'single_member' ? 1 : result.seatsByParty[holder];
  const candidates = contenders.map(id => {
    const divisor = method === 'single_member' ? 1 : (result.seatsByParty[id] ?? 0) + 1;
    const threshold = Math.floor(result.partyVotes[holder] * divisor / holderDivisor) + 1;
    const valid = result.validVotes;
    // Also require crossing the 3% threshold if the challenger was excluded.
    const thresholdExtra = method === 'dhondt' ? Math.max(0, Math.ceil((3 * valid - 100 * result.partyVotes[id]) / 97)) : 0;
    return {id, needed: Math.max(1, threshold - result.partyVotes[id], thresholdExtra)};
  }).sort((a, b) => a.needed - b.needed || compareId(a.id, b.id));
  return {holder, challenger: candidates[0].id, votesNeeded: candidates[0].needed};
}

// Counterfactual margins use only the published center, holding other ballots fixed.
// Count quotients above P1's nth quotient; fall back to the exact allocator at ties.
export function playerSeatOpportunity(bundle, district, result, seed, player = 'P1') {
  const votes = result.partyVotes;
  const ownSeats = result.seatsByParty[player] ?? 0;
  if (!Object.hasOwn(votes, player)) return {player, present:false, seats:0, attack:null, defense:null};
  const hasSeats = (changed, n) => {
    if (n > district.seats) return false;
    const own = changed[player] ?? 0;
    const valid = Object.values(changed).reduce((s,v)=>s+v,0) + result.blankVotes;
    if (!own || district.system === 'dhondt' && 100 * own < 3 * valid) return false;
    let above = n - 1, tie = false;
    for (const [id, count] of Object.entries(changed)) {
      if (id === player || !count || district.system === 'dhondt' && 100 * count < 3 * valid) continue;
      const product = count * n;
      above += Math.min(district.seats, Math.floor((product - 1) / own));
      if (product % own === 0 && product / own <= district.seats) tie = true;
      if (above >= district.seats) return false;
    }
    return tie ? (allocateDistrict(bundle,district,changed,seed).seatsByParty[player] ?? 0) >= n : true;
  };
  const minimum = predicate => {
    let low = 0, high = 1;
    while (!predicate(high)) {
      high *= 2;
      if (!Number.isSafeInteger(high) || high > 2 ** 40) throw new Error('Margen electoral fuera de límites');
    }
    while (low + 1 < high) {const middle = Math.floor((low + high) / 2);if(predicate(middle))high=middle;else low=middle;}
    return high;
  };
  let attack = null, defense = null;
  if (ownSeats < district.seats) {
    const extra = minimum(n => hasSeats({...votes,[player]:votes[player]+n}, ownSeats+1));
    const next = allocateDistrict(bundle,district,{...votes,[player]:votes[player]+extra},seed);
    const displaced = Object.keys(votes).filter(id=>id!==player && (result.seatsByParty[id]??0) > (next.seatsByParty[id]??0)).sort(compareId);
    attack = {votesNeeded:extra,against:displaced[0]??null,estimated:true,basis:'own_votes_added'};
  }
  if (ownSeats > 0) {
    let low=0,high=votes[player];
    while(low+1<high){const middle=Math.floor((low+high)/2);if(!hasSeats({...votes,[player]:votes[player]-middle},ownSeats))high=middle;else low=middle;}
    const next=allocateDistrict(bundle,district,{...votes,[player]:votes[player]-high},seed);
    const beneficiaries=Object.keys(votes).filter(id=>id!==player&&(next.seatsByParty[id]??0)>(result.seatsByParty[id]??0)).sort(compareId);
    defense = {votesMargin:high,against:beneficiaries[0]??null,estimated:true,basis:'own_votes_removed'};
  }
  return {player,present:true,seats:ownSeats,attack,defense};
}

function pollValues(weights, amplitude, seed, turn, districtId, observer, sample = null) {
  const namespace = sample === null ? 'poll-v1' : 'projection-v1';
  const perturbed = Object.fromEntries(Object.entries(weights).map(([id, n]) => [id,
    Math.max(1, n + randomInt(namespace, seed, [turn, districtId, id, observer, sample ?? 'center'], -amplitude, amplitude))]));
  return distribute(10000, perturbed);
}

export function publishPolls(state, bundle) {
  bundle = resolveCampaignBundle(bundle, state);
  const c = bundle.config;
  const truth = Object.fromEntries(bundle.provinces.districts.map(d => [d.id, distribute(10000, trueWeights(state, bundle, d.id))]));
  const polls = {};
  for (const observer of c.parties.map(p => p.id)) {
    const districts = {};
    const nationalVotes = Object.fromEntries(c.parties.map(p => [p.id, 0]));
    // NPC policies use their published provincial estimates, never a seat forecast.
    // Only the player's visible projection is generated; no unused hidden displays.
    const samples = Array.from({length: observer === 'P1' ? c.polls.projectionSamples : 0}, () => Object.fromEntries(c.parties.map(p => [p.id, 0])));
    for (const d of bundle.provinces.districts) {
      const research = state.parties[observer].research[d.id];
      const researched = Boolean(research && research.from <= state.turn && research.through >= state.turn);
      const amplitude = researched ? c.polls.researchNoiseBp : c.polls.defaultNoiseBp;
      const centers = pollValues(truth[d.id], amplitude, state.seed, state.turn, d.id, observer);
      const values = Object.fromEntries(Object.entries(centers).map(([id, bp]) => [id, {
        center: bp, low: Math.floor(clamp(bp - amplitude, 0, 10000) / 100),
        high: Math.ceil(clamp(bp + amplitude, 0, 10000) / 100),
      }]));
      const total = districtTotals(bundle, d).candidateVotes;
      const estimatedVotes = distribute(total, centers);
      for (const [id, count] of Object.entries(estimatedVotes)) nationalVotes[id] += count;
      const centralResult = allocateDistrict(bundle, d, estimatedVotes, state.seed);
      const topics = districtIssues(bundle, state.seed, d.id);
      const issueId = Object.keys(topics).sort((a, b) => topics[b].salience - topics[a].salience || compareId(a, b))[0];
      districts[d.id] = {values, researched, amplitude, issues: topics, issue: {topicId: issueId, ...topics[issueId]},
        lastSeat: {...lastSeatInfo(centralResult, d.system), estimated: true}};
      districts[d.id].opportunity = playerSeatOpportunity(bundle,d,centralResult,state.seed,observer);
      // The observer's own campaign limit is known independently of noisy votes.
      if(c.rulesVersion==='0.8.4')districts[d.id].campaignReachAtLimit=
        state.parties[observer].campaignDelta[d.id]>=c.support.campaignDeltaMax;
      for (let sample = 0; sample < samples.length; sample++) {
        const sampled = pollValues(centers, amplitude, state.seed, state.turn, d.id, observer, sample);
        const projected = allocateDistrict(bundle, d, distribute(total, sampled), state.seed);
        for (const [id, seats] of Object.entries(projected.seatsByParty)) samples[sample][id] += seats;
      }
    }
    const nationalCenters = distribute(10000, nationalVotes);
    const national = Object.fromEntries(Object.entries(nationalCenters).map(([id, bp]) => [id, {
      center: bp, low: Math.floor(clamp(bp - c.polls.defaultNoiseBp, 0, 10000) / 100),
      high: Math.ceil(clamp(bp + c.polls.defaultNoiseBp, 0, 10000) / 100),
    }]));
    const projection = samples.length ? Object.fromEntries(c.parties.map(p => {
      const distribution = samples.map(s => s[p.id]).sort((a, b) => a - b);
      return [p.id, {min: distribution[0], median: distribution[Math.floor(distribution.length / 2)], max: distribution.at(-1)}];
    })) : {};
    polls[observer] = {turn: state.turn, districts, national, projection};
  }
  return polls;
}

export function countElection(state, bundle) {
  bundle = resolveCampaignBundle(bundle, state);
  const national = {seatsByParty: {}, votesByParty: {}, blankVotes: 0, invalidVotes: 0,
    abstentions: 0, electorate: 0, castVotes: 0};
  for (const p of bundle.config.parties) {
    national.seatsByParty[p.id] = 0;
    national.votesByParty[p.id] = 0;
  }
  const districts = {};
  for (const d of bundle.provinces.districts) {
    const totals = districtTotals(bundle, d);
    const votes = distribute(totals.candidateVotes, trueWeights(state, bundle, d.id));
    const result = allocateDistrict(bundle, d, votes, state.seed);
    result.lastSeat = {...lastSeatInfo(result, d.system), estimated: false};
    districts[d.id] = result;
    for (const [id, n] of Object.entries(result.seatsByParty)) national.seatsByParty[id] += n;
    for (const [id, n] of Object.entries(votes)) national.votesByParty[id] += n;
    for (const key of ['blankVotes', 'invalidVotes', 'abstentions', 'electorate', 'castVotes']) national[key] += totals[key];
  }
  return {districts, national};
}
