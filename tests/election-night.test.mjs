import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle, freePlan, newGame, playCampaign} from './helpers.mjs';
import {resolveCampaignBundle} from '../app/js/core/campaign.mjs';
import {allocateDistrict} from '../app/js/core/polls.mjs';
import {electionRevealSteps, electionBulletin, congressBulletin} from '../app/js/ui/election-night.mjs';

function visitTwice(state) {
  const plan = freePlan(state);
  if ([1, 4].includes(state.turn)) plan.candidate = {id: 'visit', target: state.initialSetup.province};
  return plan;
}

function sumSeats(ids, results) {
  const seats = Object.fromEntries(bundle.config.parties.map(party => [party.id, 0]));
  for (const id of ids) {
    for (const [party, value] of Object.entries(results[id].seatsByParty)) seats[party] += value;
  }
  return seats;
}

test('los tres avances se reconcilian con las actas publicadas y el Congreso congelado', () => {
  const state = playCampaign(newGame('ensayo-noche', {partyIdentity: 'naranja'}), visitTwice);
  const snapshot = JSON.stringify(state);
  const stages = electionRevealSteps(state, bundle);
  const effective = resolveCampaignBundle(bundle, state);
  assert.equal(stages[0].provinceId, state.initialSetup.province);
  assert.deepEqual(stages[0].visit, {count: 2, lastTurn: 4});
  assert.deepEqual(stages.map(s => s.partial.districts.length), [1, 26, 51]);
  let previous = [];
  for (const stage of stages) {
    const {districts, seats, seatsByParty, totalSeats} = stage.partial;
    assert.ok(districts.includes(stage.provinceId));
    assert.equal(new Set(districts).size, districts.length);
    assert.deepEqual(districts.slice(0, previous.length), previous);
    assert.deepEqual(seatsByParty, sumSeats(districts, state.electionResult.districts));
    assert.equal(seats, Object.values(seatsByParty).reduce((a, b) => a + b, 0));
    assert.ok(seats < totalSeats);
    assert.equal(totalSeats, 350);
    previous = districts;
  }
  const [pending] = effective.provinces.districts.filter(d => !previous.includes(d.id));
  assert.deepEqual(stages[2].partial.lastPending, {name: pending.name, seats: pending.seats});
  assert.deepEqual(sumSeats([...previous, pending.id], state.electionResult.districts), state.electionResult.national.seatsByParty);
  assert.equal(JSON.stringify(state), snapshot);
  assert.deepEqual(electionRevealSteps(state, bundle, {limit: 1}), stages.slice(0, 1));

  // Check the bulletin's actual counterfactual against a fresh provincial allocation.
  const duel = stages[1];
  const actual = state.electionResult.districts[duel.provinceId];
  const district = effective.provinces.districts.find(d => d.id === duel.provinceId);
  const extraVotes = {...actual.partyVotes, [duel.challenger]: actual.partyVotes[duel.challenger] + duel.marginVotes};
  const changed = allocateDistrict(effective, district, extraVotes, state.seed);
  assert.ok(changed.seatsByParty[duel.challenger] > actual.seatsByParty[duel.challenger]);
  assert.ok(changed.seatsByParty[duel.lastSeatHolder] < actual.seatsByParty[duel.lastSeatHolder]);
  assert.ok(electionBulletin(duel, effective.config.parties).story.includes(String(duel.marginVotes)));
});

test('una candidatura territorial sigue con un acta propia pendiente al pedir el resultado nacional', () => {
  const state = playCampaign(newGame('urnas-territoriales', {campaignScenario: 'bisagra', province: '15'}));
  const effective = resolveCampaignBundle(bundle, state);
  const eligible = effective.config.parties.find(p => p.id === 'P1').eligibility;
  const steps = electionRevealSteps(state, bundle);
  assert.deepEqual(steps[0].visit, null);
  assert.ok(steps[0].isStart);
  assert.ok(steps.every(step => eligible.includes(step.provinceId)));
  const pending = effective.provinces.districts.filter(d => !steps.at(-1).partial.districts.includes(d.id));
  assert.equal(pending.length, 1);
  assert.ok(eligible.includes(pending[0].id));
});

test('el relato distingue una visita propia, un empate y un sondeo ausente', () => {
  const state = playCampaign(newGame('ensayo-noche', {partyIdentity: 'naranja'}));
  const origin = state.initialSetup.province;
  state.timeline.push({kind: 'rival', actionId: 'visit', actorId: 'candidate', partyId: 'P2', target: '28', turn: 10});
  delete state.publishedPolls.P1.districts[origin];
  const actual = state.electionResult.districts[origin];
  actual.partyVotes = {...actual.partyVotes, P1: 600000, P2: 600000};
  const first = electionRevealSteps(state, bundle)[0];
  assert.equal(first.provinceId, origin);
  assert.equal(first.visit, null);
  assert.equal(first.projectedPlayerSeats, null);
  assert.equal(first.change, null);
  assert.deepEqual(first.leaders, ['P1', 'P2']);
  assert.equal(first.leaderChanged, false);
  assert.doesNotMatch(electionBulletin(first, bundle.config.parties).story, /visita|sondeo/i);
});

test('el titular del Congreso distingue pluralidad, empate y mayoría antes de negociar', () => {
  const parties = [{id: 'P1', name: 'Partido Verde'}, {id: 'P2', name: 'Partido Rojo'}, {id: 'P3', name: 'Partido Azul'}];
  const narrow = congressBulletin({P1: 175, P2: 150, P3: 25}, parties);
  assert.match(narrow.title, /encabeza.*175 escaños/);
  assert.match(narrow.story, /un voto más/);
  const tie = congressBulletin({P1: 155, P2: 155, P3: 40}, parties);
  assert.match(tie.title, /Empatas/);
  assert.match(tie.story, /Verde y Rojo empatan a 155/);
  assert.match(congressBulletin({P1: 176, P2: 134, P3: 40}, parties).title, /Mayoría absoluta con 176/);
  const rival = congressBulletin({P1: 0, P2: 218, P3: 132}, parties);
  assert.match(rival.title, /sin escaños/);
  assert.match(rival.story, /Rojo suma 218.*mayoría absoluta/);
});
