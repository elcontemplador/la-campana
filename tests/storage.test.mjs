import test from 'node:test';
import assert from 'node:assert/strict';
import {exportGame, importGame, saveGame, loadGame, snapshotOf} from '../app/js/storage/save.mjs';
import {canonical, checksum} from '../app/js/core/utils.mjs';
import {getEventView} from '../app/js/core/engine.mjs';
import {bundle, newGame, command, finishEvent, freePlan, playCampaign} from './helpers.mjs';

const initial = newGame('test-guardado');
function memoryStorage() {
  const map = new Map();
  return {map, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v)};
}

test('exportar/importar conserva evento, planificación y cada momento del debate', () => {
  let s = structuredClone(initial);
  let debateChecks = 0;
  while (s.phase !== 'election') {
    const result = importGame(exportGame(s, bundle), bundle);
    assert.equal(result.ok, true, result.error?.message);
    assert.equal(checksum(result.state), checksum(s));
    if (s.phase === 'event') {
      if (s.activeEvent === 'E07') debateChecks++;
      const option = getEventView(s, bundle).options.find(o => o.availability.available
        && !o.reserveStaff && o.availability.cost.budget === 0 && o.availability.cost.energy === 0);
      s = command(s, 'CHOOSE_OPTION', {optionId: option.id});
    } else if (s.phase === 'planning') {
      s = command(s, 'CONFIRM_PLAN', {plan: freePlan(s)});
    } else if (s.phase === 'debrief') {
      s = command(s, 'CONTINUE');
    }
  }
  assert.equal(debateChecks, 3);
  assert.ok(new TextEncoder().encode(exportGame(s, bundle)).byteLength < bundle.config.runtime.maxImportBytes);
});

test('snapshot adulterado, log cambiado y versión errónea se rechazan', () => {
  const envelope = JSON.parse(exportGame(initial, bundle));
  envelope.snapshot.parties.P1.budget = 999;
  envelope.checksum = checksum(envelope.snapshot);
  assert.equal(importGame(JSON.stringify(envelope), bundle).ok, false);
  const version = JSON.parse(exportGame(initial, bundle)); version.rulesVersion = 'future';
  assert.equal(importGame(JSON.stringify(version), bundle).error.code, 'INCOMPATIBLE_SAVE');
  assert.equal(importGame('{', bundle).ok, false);
  assert.equal(importGame('x'.repeat(bundle.config.runtime.maxImportBytes + 1), bundle).error.code, 'SAVE_TOO_LARGE');
  const polluted = exportGame(initial, bundle).replace('"snapshot":{', '"snapshot":{"__proto__":{"polluted":true},');
  assert.equal(importGame(polluted, bundle).ok, false);
  assert.equal({}.polluted, undefined);
});

test('guardar dos slots conserva copia recuperable si el nuevo se corrompe', () => {
  const storage = memoryStorage();
  assert.equal(saveGame(initial, bundle, storage).ok, true);
  const after = command(initial, 'CHOOSE_OPTION', {optionId: 'keep_interval'});
  assert.equal(saveGame(after, bundle, storage).ok, true);
  assert.equal(loadGame(bundle, storage).state.revision, 1);
  const latestKey = [...storage.map.keys()].find(k => k.endsWith('latest'));
  const latest = storage.map.get(latestKey);
  const slotKey = [...storage.map.keys()].find(k => k.endsWith('slot-' + latest));
  storage.map.set(slotKey, '{broken');
  const recovered = loadGame(bundle, storage);
  assert.equal(recovered.ok, true); assert.equal(recovered.recovered, true);
  assert.equal(recovered.state.revision, 0);
});

test('fallo de cuota o almacenamiento no destruye el último guardado válido', () => {
  const storage = memoryStorage(); saveGame(initial, bundle, storage);
  const keysBefore = canonical([...storage.map.entries()]);
  const broken = {getItem: storage.getItem, setItem: () => {throw new Error('quota');}};
  assert.equal(saveGame(initial, bundle, broken).ok, false);
  assert.equal(canonical([...storage.map.entries()]), keysBefore);
  assert.equal(loadGame(bundle, storage).ok, true);
  const unavailable = {getItem: () => {throw new Error('blocked');}};
  assert.equal(loadGame(bundle, unavailable).error.code, 'STORAGE_UNAVAILABLE');
});

test('campaña reproducible, carga completa y desenlace permanecen iguales', () => {
  let s = playCampaign(structuredClone(initial));
  s = command(s, 'BEGIN_NEGOTIATION');
  while (s.phase === 'negotiation') {
    if (s.negotiation.stage === 'offer') s = command(s, 'PROPOSE', {offer:[2,2,1,1]});
    else s = command(s, 'VOTE', {vote:'no'});
  }
  const text = exportGame(s, bundle);
  const result = importGame(text, bundle);
  assert.equal(result.ok, true, result.error?.message);
  assert.equal(canonical(snapshotOf(result.state)), canonical(snapshotOf(s)));
  assert.equal(s.phase, 'ending');
});
