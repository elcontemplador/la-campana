import test from 'node:test';
import assert from 'node:assert/strict';
import {setupIssues, counterofferAssessment, loadSetupDraft, saveSetupDraft, SETUP_DRAFT_KEY} from '../app/js/ui/usability.mjs';
import {bundle} from './helpers.mjs';
import {randomQuickSetup} from '../app/js/ui/setup.mjs';

function storageOf() {
  const map = new Map([['la-campana-v061-slot-0', 'original'], ['la-campana-v061-tutorial', 'guide'], ['la-campana-v061-reserve', 'off']]);
  return {map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value)};
}
const choice = (before, after, accepted = true) => ({accepted, cost: 3, before: {totals: before}, after: {totals: after}});

test('la creación informa todos los requisitos pendientes y no modifica la selección', () => {
  const setup = {name: '', seed: '', staff: [], commitments: ['T1']}, before = structuredClone(setup);
  assert.deepEqual(setupIssues(setup).map(issue => issue.target), ['#candidate-name', '#campaign-seed', '#staff-title', '#topics-title']);
  assert.deepEqual(setup, before);
  assert.deepEqual(setupIssues(randomQuickSetup(bundle, 'creacion-valida')), []);
});

test('nombre y clave se validan en NFC y no admiten controles ni pares duplicados', () => {
  const setup = randomQuickSetup(bundle, 'valida');
  assert.deepEqual(setupIssues({...setup, seed: 'e\u0301'.repeat(64)}), []);
  for (const seed of ['', 'x'.repeat(65), 'salto\n', 'clave\u007f']) {
    assert.ok(setupIssues({...setup, seed}).some(issue => issue.target === '#campaign-seed'));
  }
  assert.ok(setupIssues({...setup, name: 'Nombre\t'}).some(issue => issue.target === '#candidate-name'));
  assert.ok(setupIssues({...setup, staff: ['S1', 'S1']}).some(issue => issue.target === '#staff-title'));
  assert.ok(setupIssues({...setup, commitments: ['T1', 'T1']}).some(issue => issue.target === '#topics-title'));
});

test('la evaluación compara margen y vías de mayoría, no sólo síes', () => {
  const data = choice({yes: 171, no: 180}, {yes: 170, no: 174}), before = structuredClone(data);
  assert.deepEqual(counterofferAssessment(data), {kind: 'better', title: 'Mejora los apoyos', marginBefore: -9, marginAfter: -4, warning: ''});
  assert.deepEqual(data, before);
  assert.equal(counterofferAssessment(choice({yes: 163, no: 164}, {yes: 164, no: 163})).kind, 'better');
  assert.equal(counterofferAssessment(choice({yes: 150, no: 120}, {yes: 163, no: 164})).kind, 'worse');
});

test('la mayoría absoluta pesa antes que un mejor margen de segunda votación', () => {
  assert.equal(counterofferAssessment(choice({yes: 176, no: 174}, {yes: 175, no: 20})).kind, 'worse');
  assert.equal(counterofferAssessment(choice({yes: 175, no: 20}, {yes: 176, no: 174})).kind, 'better');
  assert.equal(counterofferAssessment(choice({yes: 163, no: 164}, {yes: 163, no: 164})).kind, 'same');
});

test('aceptación y utilidad se distinguen; rechazar o empeorar avisa del coste', () => {
  const worse = counterofferAssessment(choice({yes: 163, no: 164}, {yes: 144, no: 164}));
  assert.equal(worse.kind, 'worse');
  assert.match(worse.warning, /aceptar/);
  assert.match(worse.warning, /3 de caja/);
  const rejected = counterofferAssessment(choice({yes: 163, no: 164}, {yes: 200, no: 100}, false));
  assert.equal(rejected.kind, 'rejected');
  assert.match(rejected.warning, /3 de caja/);
  assert.equal(counterofferAssessment({accepted: true}).marginAfter, null);
});

test('el borrador conserva una configuración completa sin tocar partida ni preferencias', () => {
  const storage = storageOf(), setup = randomQuickSetup(bundle, 'borrador');
  const original = structuredClone(setup), originalEntries = [...storage.map];
  assert.deepEqual(saveSetupDraft(setup, bundle, storage), {ok: true});
  assert.deepEqual(loadSetupDraft(bundle, storage), setup);
  assert.deepEqual(setup, original);
  for (const [key, value] of originalEntries) assert.equal(storage.map.get(key), value);
  const loaded = loadSetupDraft(bundle, storage);
  loaded.staff.length = 0;
  loaded.positions.T1 *= -1;
  assert.deepEqual(loadSetupDraft(bundle, storage), setup);
});

test('un borrador incompleto válido admite blancos y selecciones parciales', () => {
  const storage = storageOf(), setup = {...randomQuickSetup(bundle, 'incompleto'), name: '', seed: '', staff: [], commitments: ['T1'], positions: {T1: -1}};
  assert.deepEqual(saveSetupDraft(setup, bundle, storage), {ok: true});
  assert.deepEqual(loadSetupDraft(bundle, storage), setup);
  assert.ok(setupIssues(loadSetupDraft(bundle, storage)).length);
  assert.deepEqual(saveSetupDraft({name: '', positions: {}}, bundle, storage), {ok: true});
  assert.deepEqual(loadSetupDraft(bundle, storage), {name: '', positions: {}});
});

test('se rechazan catálogos, posiciones, controles y provincias ajenos al reto', () => {
  const storage = storageOf(), setup = randomQuickSetup(bundle, 'seguro');
  assert.equal(saveSetupDraft(setup, bundle, storage).ok, true);
  const preserved = storage.map.get(SETUP_DRAFT_KEY);
  const invalid = [
    {...setup, name: 'Nombre\n'}, {...setup, seed: 'clave\u0000'}, {...setup, staff: ['S1', 'S1']},
    {...setup, commitments: ['T1', 'falso']}, {...setup, profile: 'falso'}, {...setup, portrait: 'portrait-7'},
    {...setup, partyIdentity: 'real'}, {...setup, difficulty: 'falsa'}, {...setup, campaignScenario: 'falso'},
    {...setup, positions: {T1: '1'}}, {...setup, positions: {T1: 0}}, {...setup, positions: {inventado: 1}},
    {...setup, province: '99'}, {...setup, campaignScenario: 'bisagra', province: '28'},
    {...setup, staff: ['S1', 'S2', 'S3']}, {...setup, commands: []},
    {...setup, positions: JSON.parse('{"__proto__":1}')},
  ];
  for (const value of invalid) assert.equal(saveSetupDraft(value, bundle, storage).ok, false);
  assert.equal(storage.map.get(SETUP_DRAFT_KEY), preserved);
  assert.equal(saveSetupDraft({...setup, campaignScenario: 'bisagra', province: '15'}, bundle, storage).ok, true);
});

test('JSON corrupto, formatos ajenos y almacenamiento inaccesible no borran datos', () => {
  const storage = storageOf();
  for (const value of ['{', 'x'.repeat(4097), '{"format":"la-campana-save","version":1,"setup":{}}',
    '{"format":"la-campana-setup","version":2,"setup":{}}',
    '{"format":"la-campana-setup","version":1,"setup":{"__proto__":{}}}']) {
    storage.map.set(SETUP_DRAFT_KEY, value);
    assert.equal(loadSetupDraft(bundle, storage), null);
    assert.equal(storage.map.get(SETUP_DRAFT_KEY), value);
  }
  const denied = {getItem() {throw Error('unavailable');}, setItem() {throw Error('quota');}};
  assert.equal(loadSetupDraft(bundle, denied), null);
  assert.equal(saveSetupDraft(randomQuickSetup(bundle, 'quota'), bundle, denied).ok, false);
  assert.equal(storage.map.get('la-campana-v061-slot-0'), 'original');
});
