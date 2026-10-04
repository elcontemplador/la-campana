import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, getEventView, validatePlan} from '../app/js/core/engine.mjs';
import {campaignCommitments, resolveCampaignBundle} from '../app/js/core/campaign.mjs';
import {canonical, present} from '../app/js/core/utils.mjs';
import {exportGame, importGame} from '../app/js/storage/save.mjs';
import {randomQuickSetup} from '../app/js/ui/setup.mjs';
import {bundle, command, freePlan} from './helpers.mjs';

const keys = Array.from({length: 32}, (_, i) => `quick-${(Math.imul(i + 1, 2654435761) >>> 0).toString(16)}-${i}`);

test('las partidas rápidas son legales, sencillas y coherentes con el color elegido', () => {
  for (const seed of keys) {
    const setup = randomQuickSetup(bundle, seed);
    const identity = bundle.config.partyIdentities.find(p => p.id === setup.partyIdentity);
    assert.ok(identity);
    assert.equal(setup.campaignScenario, 'abierta');
    assert.equal(setup.difficulty, 'iniciacion');
    assert.equal(setup.seed, seed);
    assert.deepEqual(setup.positions, identity.positions);
    assert.deepEqual(setup.commitments, campaignCommitments(bundle, setup));
    assert.equal(new Set(setup.staff).size, 2);
    const state = createGame(bundle, seed, setup);
    const player = resolveCampaignBundle(bundle, setup).config.parties.find(p => p.id === 'P1');
    assert.ok(present(player, setup.province));
    assert.equal(state.candidate.name, setup.name);
    assert.equal(state.candidate.profile, setup.profile);
    assert.equal(state.candidate.portrait, setup.portrait);
    assert.equal(state.focusProvince, setup.province);
  }
});

test('la clave reproduce la configuración sin mutar datos ni compartir posturas y prioridades', () => {
  const before = canonical(bundle);
  const setup = randomQuickSetup(bundle, 'rápida-reproducible');
  assert.deepEqual(randomQuickSetup(bundle, 'ra\u0301pida-reproducible'), setup);
  assert.deepEqual(randomQuickSetup(resolveCampaignBundle(bundle, {partyIdentity: 'verde'}), setup.seed), setup);
  const pristine = structuredClone(setup);
  setup.positions.T1 *= -1;
  setup.commitments.reverse();
  setup.staff[0] = 'inventado';
  assert.deepEqual(randomQuickSetup(bundle, pristine.seed), pristine);
  assert.equal(canonical(bundle), before);
});

test('una muestra corta ofrece los seis partidos y variedad de candidatos y equipos', () => {
  const setups = keys.map(seed => randomQuickSetup(bundle, seed));
  assert.deepEqual([...new Set(setups.map(s => s.partyIdentity))].sort(), bundle.config.partyIdentities.map(p => p.id).sort());
  assert.ok(new Set(setups.map(s => s.name)).size > 8);
  assert.equal(new Set(setups.map(s => s.portrait)).size, 6);
  assert.equal(new Set(setups.map(s => s.profile)).size, bundle.config.candidateProfiles.length);
  assert.ok(new Set(setups.map(s => [...s.staff].sort().join(','))).size > 2);
  assert.ok(new Set(setups.map(s => s.province)).size > 8);
});

test('el arranque rápido keep_interval y una jugada se reconstruyen exactamente al importar', () => {
  const seed = 'rápida-replay-real';
  const setup = randomQuickSetup(bundle, seed);
  let state = createGame(bundle, seed, setup);
  assert.ok(getEventView(state, bundle).options.find(o => o.id === 'keep_interval').availability.available);
  state = command(state, 'CHOOSE_OPTION', {optionId: 'keep_interval', staffId: null});
  assert.equal(state.phase, 'planning');
  const plan = freePlan(state);
  assert.ok(validatePlan(state, plan, bundle).ok);
  state = command(state, 'CONFIRM_PLAN', {plan});
  assert.equal(state.phase, 'debrief');
  const restored = importGame(exportGame(state, bundle), bundle);
  assert.ok(restored.ok);
  assert.deepEqual(restored.state, state);
});

test('no generar una clave no se convierte silenciosamente en otra campaña', () => {
  for (const seed of [undefined, null, '', 'a'.repeat(65), 'clave\n']) {
    assert.throws(() => randomQuickSetup(bundle, seed), /clave de campaña válida/);
  }
});
