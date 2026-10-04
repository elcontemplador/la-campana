import test from 'node:test';
import assert from 'node:assert/strict';
import {eventLimitDescriptions} from '../app/js/ui/event-limits.mjs';
import {getEventView} from '../app/js/core/engine.mjs';
import {exportGame, importGame} from '../app/js/storage/save.mjs';
import {bundle, newGame, command} from './helpers.mjs';
import {narrativeFixtures} from './narrative-fixtures.mjs';
import {bundleChecksum} from '../app/js/core/scenario.mjs';

const option = (state, id, source = bundle) => getEventView(state, source).options.find(o => o.id === id);
const choose = (state, id, source = bundle, staffId = null) => command(state, 'CHOOSE_OPTION', {optionId: id, staffId}, source);
const deltas = (state, stat) => state.timeline.at(-1).changes.filter(c => c.stat === stat).map(c => c.delta);

function directed(effects, {profile = 'preparacion', cost = null, reserved = false, optionId = 'contrast'} = {}) {
  // Current080 directed primitive fixture: clone launch_first, give it a test-only
  // name/effects and recompute the source checksum. This is not old E01 content,
  // a historical campaign or a legal replay fixture. Global helpers stay current.
  const state = newGame('news-legal-0', {profile}), source = structuredClone(bundle);
  const choice = source.content.events.find(e => e.id === 'E01').options.find(o => o.id === 'launch_first');
  assert.ok(choice, 'La fixture dirigida parte de la opción actual launch_first');
  choice.id = optionId;
  choice.effects = effects;
  if (cost) choice.cost = cost;
  if (reserved) {choice.reserveStaff = true; choice.requiresStaff = 'any';}
  state.bundleChecksum = bundleChecksum(source);
  return {state, source};
}

test('E35 muestra una relación Morado 5/5 sin aumento y 4/5 con el aumento real', () => {
  const original = narrativeFixtures().get('E35');
  for (const [initial, expected] of [[5, 0], [4, 1]]) {
    // Directed public-identity and resource boundary: P3 maps to Morado for Rojo.
    const state = structuredClone(original); state.initialSetup.partyIdentity = 'rojo'; state.parties.P1.relations.P3 = initial;
    const selected = option(state, 'act'), texts = eventLimitDescriptions(selected, state, bundle);
    assert.equal(texts.length, selected.availability.effects.length);
    assert.equal(texts[0], initial === 5 ? 'Partido Morado: relación sin cambio (máximo 5)' : 'Partido Morado: relación +1');
    assert.deepEqual(deltas(choose(state, 'act'), 'relation'), [expected]);
  }
});

test('una pérdida en el mínimo y una pérdida parcial reflejan los límites, sin prometer un descenso imposible', () => {
  for (const [initial, expected] of [[-5, 0], [-4, -1]]) {
    const {state, source} = directed([{type: 'relation', target: 'P2', delta: -2}]);
    state.parties.P1.relations.P2 = initial;
    const texts = eventLimitDescriptions(option(state, 'contrast', source), state, source);
    if (expected === 0) assert.match(texts[0], /sin cambio \(mínimo -5\)/);
    else assert.match(texts[0], /relación -1 \(límite -5\)/);
    assert.deepEqual(deltas(choose(state, 'contrast', source), 'relation'), [expected]);
  }
});

test('preparación al máximo o a un punto del límite coincide con la resolución real', () => {
  for (const [initial, expected] of [[6, 0], [5, 1], [4, 2]]) {
    const {state, source} = directed([{type: 'stat', stat: 'readiness', delta: 2}]); state.parties.P1.readiness = initial;
    const texts = eventLimitDescriptions(option(state, 'contrast', source), state, source);
    assert.equal(texts[0], expected === 0 ? 'Preparación: sin cambio (máximo 6)'
      : expected === 1 ? 'Preparación +1 (límite 6)' : 'Preparación +2');
    assert.deepEqual(deltas(choose(state, 'contrast', source), 'readiness'), [expected]);
  }
});

test('los pagos se aplican antes de recuperar caja o energía y no se confunden con esa recuperación', () => {
  // Explicit hypothetical order boundary: budget/energy recovery is not current event content.
  const {state, source} = directed([{type: 'stat', stat: 'budget', delta: 10}, {type: 'stat', stat: 'energy', delta: 10}],
    {cost: {budget: 6, energy: 4}});
  state.parties.P1.budget = 158; state.parties.P1.energy = 98;
  const selected = option(state, 'contrast', source), texts = eventLimitDescriptions(selected, state, source);
  assert.equal(texts[0], 'Presupuesto +8 (límite 160)'); assert.equal(texts[1], 'Energía +6 (límite 100)');
  const after = choose(state, 'contrast', source);
  assert.deepEqual(deltas(after, 'budget'), [-6, 8]); assert.deepEqual(deltas(after, 'energy'), [-4, 6]);
  assert.deepEqual(selected.availability.cost, {budget: 6, energy: 4});
});

test('dos cambios sobre una relación se calculan secuencialmente, incluyendo un primer cambio saturado', () => {
  const {state, source} = directed([{type: 'relation', target: 'P2', delta: 2}, {type: 'relation', target: 'P2', delta: -2}]);
  state.parties.P1.relations.P2 = 5;
  const texts = eventLimitDescriptions(option(state, 'contrast', source), state, source);
  assert.match(texts[0], /sin cambio \(máximo 5\)/); assert.match(texts[1], /relación -2$/);
  assert.deepEqual(deltas(choose(state, 'contrast', source), 'relation'), [0, -2]);
  const opposite = directed([{type: 'relation', target: 'P2', delta: -2}, {type: 'relation', target: 'P2', delta: 2}]);
  opposite.state.parties.P1.relations.P2 = -5;
  assert.match(eventLimitDescriptions(option(opposite.state, 'contrast', opposite.source), opposite.state, opposite.source)[1], /relación \+2$/);
  assert.deepEqual(deltas(choose(opposite.state, 'contrast', opposite.source), 'relation'), [0, 2]);
});

test('Conexión se integra una sola vez, sin añadir un bonus ficticio al primer contacto saturado', () => {
  const {state, source} = directed([{type: 'rapport', target: 'C1', delta: 1}, {type: 'rapport', target: 'C2', delta: 1}], {profile: 'conexion'});
  state.rapport.C1 = 5;
  const texts = eventLimitDescriptions(option(state, 'contrast', source), state, source);
  assert.deepEqual(texts, ['Mesa Abierta: relación sin cambio (máximo 5)', 'Taller Cívico: relación +1']);
  const after = choose(state, 'contrast', source);
  assert.deepEqual(deltas(after, 'rapport'), [0, 1]); assert.equal(after.profileUsed.rapport, true);
  const partial = directed([{type: 'rapport', target: 'C1', delta: 2}], {profile: 'conexion'});
  partial.state.rapport.C1 = 4;
  assert.deepEqual(eventLimitDescriptions(option(partial.state, 'contrast', partial.source), partial.state, partial.source), ['Mesa Abierta: relación +1 (límite 5)']);
  assert.deepEqual(deltas(choose(partial.state, 'contrast', partial.source), 'rapport'), [1]);
  const full = directed([{type: 'rapport', target: 'C1', delta: 1}], {profile: 'conexion'});
  assert.deepEqual(eventLimitDescriptions(option(full.state, 'contrast', full.source), full.state, full.source), ['Mesa Abierta: relación +2 (incluye perfil)']);
  assert.deepEqual(deltas(choose(full.state, 'contrast', full.source), 'rapport'), [2]);
});

test('el primer contacto negativo no consume Conexión, pero un bonus ya usado no vuelve a aparecer', () => {
  const {state, source} = directed([{type: 'rapport', target: 'C1', delta: -1}, {type: 'rapport', target: 'C2', delta: 1}], {profile: 'conexion'});
  state.rapport.C1 = -5;
  const texts = eventLimitDescriptions(option(state, 'contrast', source), state, source);
  assert.match(texts[0], /sin cambio \(mínimo -5\)/); assert.match(texts[1], /\+2 \(incluye perfil\)/);
  assert.deepEqual(deltas(choose(state, 'contrast', source), 'rapport'), [0, 2]);
  state.profileUsed.rapport = true;
  assert.match(eventLimitDescriptions(option(state, 'contrast', source), state, source)[1], /relación \+1$/);
});

test('Coordinación se aplica antes del efecto de cohesión y ajusta tanto el bonus como el efecto al máximo', () => {
  for (const [initial, expected] of [[99, [1, 0]], [100, [0, 0]], [98, [1, 1]]]) {
    const {state, source} = directed([{type: 'stat', stat: 'readiness', delta: 1}, {type: 'stat', stat: 'cohesion', delta: 1}],
      {profile: 'coordinacion', reserved: true, optionId: 'team_review', cost: {budget: 0, energy: 0}});
    state.parties.P1.cohesion = initial;
    const selected = option(state, 'team_review', source), texts = eventLimitDescriptions(selected, state, source);
    assert.equal(texts.filter(t => t.startsWith('Perfil Coordinación')).length, 1);
    assert.ok(!texts.some(t => t === 'Tu perfil añade +1 cohesión'));
    if (initial === 99) {assert.match(texts[0], /cohesión \+1$/); assert.ok(texts.some(t => t === 'Cohesión: sin cambio (máximo 100)'));}
    if (initial === 100) assert.match(texts[0], /sin cambio \(máximo 100\)/);
    assert.deepEqual(deltas(choose(state, 'team_review', source, 'S1'), 'cohesion'), expected);
  }
});

test('organización conserva nombres compatibles y no promete otro equipo al máximo', () => {
  for (const [initial, expected] of [[4, 1], [5, 0]]) {
    const {state, source} = directed([{type: 'organization', target: 'focus', delta: 1}]);
    state.focusProvince = '28'; state.parties.P1.organization['28'] = initial;
    const texts = eventLimitDescriptions(option(state, 'contrast', source), state, source);
    assert.equal(texts[0], expected ? 'Voluntarios en Madrid +1' : 'Voluntarios en Madrid: ya al máximo (5)');
    assert.deepEqual(deltas(choose(state, 'contrast', source), 'organization'), [expected]);
  }
});

test('soporte calculado, temas, banderas y promesas mantienen sus descripciones originales', () => {
  for (const id of ['E33', 'E02', 'E11']) {
    const state = narrativeFixtures().get(id);
    for (const selected of getEventView(state, bundle).options) {
      const texts = eventLimitDescriptions(selected, state, bundle);
      for (const text of selected.availability.effects.filter(t => /^Atractivo |^Respuesta |^Entregas |^Acuerdas |^La respuesta /.test(t)))
        assert.ok(texts.includes(text), `${id}: ${text}`);
    }
  }
  const state = newGame('news-legal-0'), selected = option(state, 'keep_interval');
  assert.deepEqual(eventLimitDescriptions(selected, state, bundle), selected.availability.effects);
  const fallback = {availability: {effects: ['Atractivo local −90', 'Respuesta comprometida para el cierre']}};
  assert.deepEqual(eventLimitDescriptions(fallback, state, bundle), fallback.availability.effects);
});

test('sin acceso a pesos ocultos, sondeos o futuro; el cálculo es inmutable y conserva replay de una ruta legal', () => {
  const state = narrativeFixtures().get('E35'), selected = option(state, 'act'), before = JSON.stringify(state), original = JSON.stringify(selected), data = JSON.stringify(bundle);
  const expected = eventLimitDescriptions(selected, state, bundle), altered = structuredClone(state);
  altered.publishedPolls = null;
  for (const [id, party] of Object.entries(altered.parties)) {
    Object.defineProperty(party, 'campaignDelta', {get() {throw Error('Hidden support read');}});
    if (id !== 'P1') Object.defineProperty(party, 'relations', {get() {throw Error('Hidden rival relations read');}});
  }
  altered.timeline.push({id: 'future', turn: 99, kind: 'event', eventId: 'E35', optionId: 'act', changes: [{stat: 'relation', target: 'P3', delta: 999}]});
  assert.deepEqual(eventLimitDescriptions(selected, altered, bundle), expected);
  assert.equal(JSON.stringify(state), before); assert.equal(JSON.stringify(selected), original); assert.equal(JSON.stringify(bundle), data);
  const restored = importGame(exportGame(state, bundle), bundle); assert.equal(restored.ok, true, restored.error?.message);
  assert.deepEqual(eventLimitDescriptions(option(restored.state, 'act'), restored.state, bundle), expected);
  const resolved = choose(state, 'act'); assert.ok(resolved.timeline.at(-1).changes.some(c => c.stat === 'relation'));
  const reconstructed = importGame(exportGame(resolved, bundle), bundle); assert.equal(reconstructed.ok, true);
  assert.deepEqual(reconstructed.state, resolved);
});
