import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle, command, newGame, playCampaign} from './helpers.mjs';
import {completeForRecap} from './political-recap-fixture.mjs';
import {atTurn} from './discipline-fixture.mjs';
import {campaignCover} from '../app/js/ui/campaign-cover.mjs';
import {firstPactTable} from '../app/js/ui/pact-rematch.mjs';
import {exportGame, importGame} from '../app/js/storage/save.mjs';

test('la revancha recupera la mesa exacta y cada desenlace se puede reconstruir por separado', () => {
  const opening = command(playCampaign(newGame('dos-mesas')), 'BEGIN_NEGOTIATION');
  function finish(start, vote) {
    let state = start;
    while (state.phase === 'negotiation') {
      if (state.negotiation.stage === 'offer') state = command(state, 'PROPOSE', {offer: [2,2,1,1]});
      state = command(state, 'VOTE', {vote});
    }
    return state;
  }
  const first = finish(opening, 'no');
  const original = exportGame(first, bundle);
  const retry = firstPactTable(first, bundle);
  assert.deepEqual(retry, opening);
  const second = finish(retry, 'yes');
  assert.deepEqual(second.electionResult, first.electionResult);
  assert.notDeepEqual(second.commandLog, first.commandLog);
  assert.equal(exportGame(first, bundle), original);
  assert.deepEqual(importGame(exportGame(second, bundle), bundle).state, second);
  const corrupted = structuredClone(first);
  corrupted.electionResult.national.seatsByParty.P1++;
  assert.throws(() => firstPactTable(corrupted, bundle), /recuento/);
  assert.throws(() => firstPactTable(opening, bundle), /Termina/);
});

test('dos respuestas al mismo portavoz dejan carteles distintos con el retrato y las prioridades elegidas', () => {
  const prefix = atTurn('discipline-follow-47');
  assert.equal(campaignCover(prefix,bundle), null);
  const records = ['correct_publicly','let_it_pass'].map(optionId => {
    const finished = completeForRecap(command(prefix, 'CHOOSE_OPTION', {optionId}), {E34:'act'});
    const cover = campaignCover(finished,bundle);
    const vote = finished.negotiation.history.find(v => v.invested) ||
      finished.negotiation.history.findLast(v => v.proponent === 'P1') || finished.negotiation.history.at(-1);
    assert.ok(cover.ballot.includes(vote.totals.yes + ' síes'));
    assert.equal(cover.totalSeats, 350);
    assert.equal(cover.seats, finished.electionResult.national.seatsByParty.P1);
    assert.equal(cover.name, prefix.candidate.name);
    assert.equal(cover.portraitId, prefix.candidate.portrait);
    assert.equal(cover.priorities.length, 2);
    assert.ok(finished.timeline.some(e => e.id === cover.memory.references[0].entryId && e.optionId === optionId));
    return cover;
  });
  assert.match(records[0].memoryText, /Corregiste/);
  assert.match(records[1].memoryText, /Dejaste pasar/);
});
