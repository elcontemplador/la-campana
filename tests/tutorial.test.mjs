import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TUTORIAL_STORAGE_KEY, TUTORIAL_STEP_IDS, tutorialStep, startTutorial, resumeTutorial,
  nextTutorial, skipTutorial, loadTutorialProgress, saveTutorialProgress,
} from '../app/js/ui/tutorial.mjs';

function game(phase = 'planning') {
  return {
    phase, turn: 1, selectedStaff: ['S1', 'S2'], reservedStaff: [],
    parties: {P1: {budget: 0, energy: 0}},
    lastTransition: {entries: [{partyId: 'P1', actorId: 'candidate', actionId: 'rest'}],
      rivalMoves: [{partyId: 'P2', actorId: 'candidate', actionId: 'rest'}]},
    negotiation: {stage: 'offer', history: []}, timeline: [],
  };
}

function freeze(value) {
  for (const child of Object.values(value || {})) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

function memoryStorage() {
  const values = new Map([['la-campana-v06-slot-0', 'partida intacta']]);
  return {values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
}

test('el recorrido usa controles reales y solo avanza después de la acción, respuesta y voto', () => {
  const state = game();
  let progress = startTutorial(state);
  assert.equal(tutorialStep(state, progress).id, 'province');
  assert.equal(tutorialStep(state, progress).canAdvance, true);
  assert.equal(tutorialStep(state, progress).targetSelector, '[data-tutorial-target="province"]');
  progress = nextTutorial(progress, state);
  assert.equal(tutorialStep(state, progress).id, 'action');
  assert.match(tutorialStep(state, progress).body, /dos tareas/);
  assert.match(tutorialStep(state, progress).body, /junto a tu jugada/);
  assert.match(tutorialStep(state, progress).body, /no energía/);
  assert.equal(tutorialStep(state, progress).teamTips.length, 5);
  assert.match(tutorialStep(state, progress).teamTips[4], /Prueba opcional.*Hasta confirmar, no se ejecuta nada/);
  assert.match(tutorialStep(state, progress).teamTips[2], /no asegura su voto/);
  assert.equal(tutorialStep(state, progress).canAdvance, false);
  assert.deepEqual(nextTutorial(progress, state), progress);

  state.phase = 'debrief';
  assert.equal(tutorialStep(state, progress).id, 'consequence');
  assert.equal(tutorialStep(state, progress).canAdvance, true);
  progress = nextTutorial(progress, state);
  assert.equal(tutorialStep(state, progress).id, 'rival');
  progress = nextTutorial(progress, state);
  assert.equal(tutorialStep(state, progress).id, 'pact');
  assert.equal(tutorialStep(state, progress).title, 'Ya sabes jugar un turno');
  assert.equal(tutorialStep(state, progress).canAdvance, false);
  assert.equal(tutorialStep(state, progress).targetSelector, '[data-command="CONTINUE"]');

  state.phase = 'election';
  assert.equal(tutorialStep(state, progress).targetSelector, '[data-command="BEGIN_NEGOTIATION"]');
  state.phase = 'negotiation';
  assert.equal(tutorialStep(state, progress).canAdvance, false);
  state.negotiation.history.push({ballot: 1, invested: false});
  assert.deepEqual(nextTutorial(progress, state), {enabled: false, step: 4, completed: true});
});

test('caja y energía cero, reservas y cualquier resultado no bloquean juego ni exigen una victoria', () => {
  const state = game();
  state.reservedStaff = ['S1'];
  const progress = nextTutorial(startTutorial(), state);
  assert.match(tutorialStep(state, progress).body, /ocupada por la noticia/);
  assert.match(tutorialStep(state, progress).body, /descansar/);
  assert.equal(tutorialStep(state, progress).canAdvance, false);
  for (const type of ['government', 'support', 'opposition', 'deadlock']) {
    const ended = {...state, phase: 'ending', outcome: {type}};
    const view = tutorialStep(ended, startTutorial());
    assert.equal(view.id, 'pact');
    assert.equal(view.canAdvance, true);
    assert.equal(view.targetSelector, '#phase-heading');
    assert.equal(nextTutorial(startTutorial(), ended).completed, true);
  }
});

test('retomar y reiniciar a medias muestran una fase alcanzable sin repetir decisiones del motor', () => {
  const paused = skipTutorial({enabled: true, step: 3, completed: false});
  assert.equal(tutorialStep(game('debrief'), paused), null);
  assert.equal(tutorialStep(game('debrief'), resumeTutorial(paused)).id, 'rival');
  assert.equal(startTutorial(game('debrief')).step, 2);
  assert.equal(startTutorial(game('election')).step, 4);
  assert.equal(resumeTutorial(paused, game('negotiation')).step, 4);
  assert.equal(startTutorial(game('planning')).step, 0);
  const event = tutorialStep(game('event'), startTutorial());
  assert.equal(event.canAdvance, false);
  assert.equal(event.targetSelector, '[data-option]:not(:disabled)');
  assert.equal(event.teamTips, null);
  assert.match(event.body, /gratuita/);
});

test('consecuencia y rival requieren evidencia revelada, sin completar pasos ausentes', () => {
  const state = game('debrief');
  state.lastTransition = {entries: [], rivalMoves: []};
  assert.equal(tutorialStep(state, {enabled: true, step: 2, completed: false}).canAdvance, false);
  assert.equal(tutorialStep(state, {enabled: true, step: 3, completed: false}).canAdvance, false);
  state.timeline.push({kind: 'rival', turn: 0, partyId: 'P2'});
  assert.equal(tutorialStep(state, {enabled: true, step: 3, completed: false}).canAdvance, false);
  delete state.lastTransition.rivalMoves;
  state.timeline.push({kind: 'rival', turn: 1, partyId: 'P2'});
  assert.equal(tutorialStep(state, {enabled: true, step: 3, completed: false}).canAdvance, true);
});

test('las funciones son puras con estados congelados y ayuda desactivada o completada', () => {
  const state = freeze(game('debrief'));
  const progress = freeze({enabled: true, step: 2, completed: false});
  const before = JSON.stringify(state);
  tutorialStep(state, progress); startTutorial(state); nextTutorial(progress, state);
  skipTutorial(progress); resumeTutorial(progress, state);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(progress, {enabled: true, step: 2, completed: false});
  assert.equal(tutorialStep(state, skipTutorial(progress)), null);
  assert.equal(tutorialStep(state, {enabled: true, step: 4, completed: true}), null);
  assert.equal(tutorialStep(null, startTutorial()), null);
  assert.equal(tutorialStep({phase: 'unknown'}, startTutorial()), null);
  assert.equal(TUTORIAL_STEP_IDS.length, 5);
});

test('las preferencias propias conservan salto/reanudación y no escriben slots de partida', () => {
  const storage = memoryStorage();
  assert.equal(loadTutorialProgress(storage), null);
  const paused = skipTutorial({enabled: true, step: 3, completed: false});
  assert.deepEqual(saveTutorialProgress(paused, storage), {ok: true});
  assert.deepEqual(loadTutorialProgress(storage), paused);
  assert.deepEqual([...storage.values.keys()].sort(), ['la-campana-v06-slot-0', TUTORIAL_STORAGE_KEY].sort());
  assert.equal(storage.values.get('la-campana-v06-slot-0'), 'partida intacta');
  const completed = {enabled: false, step: 4, completed: true};
  saveTutorialProgress(completed, storage);
  assert.deepEqual(loadTutorialProgress(storage), completed);
  assert.equal(resumeTutorial(completed, game()).step, 0);
});

test('datos rotos, versión distinta, formato desconocido y almacenamiento bloqueado son recuperables', () => {
  const storage = memoryStorage();
  for (const text of ['{', 'x'.repeat(513),
    JSON.stringify({format: 'la-campana-tutorial', version: 3, progress: startTutorial()}),
    JSON.stringify({format: 'otro', version: 1, progress: startTutorial()}),
    JSON.stringify({format: 'la-campana-tutorial', version: 1, progress: {enabled: true, step: 99, completed: false}}),
    JSON.stringify({format: 'la-campana-tutorial', version: 1, progress: {enabled: true, step: 0, completed: false, command: 'VOTE'}}),
  ]) {
    storage.values.set(TUTORIAL_STORAGE_KEY, text);
    assert.equal(loadTutorialProgress(storage), null);
  }
  const blocked = {getItem() {throw new Error('blocked');}, setItem() {throw new Error('quota');}};
  assert.equal(loadTutorialProgress(blocked), null);
  assert.deepEqual(saveTutorialProgress(startTutorial(), blocked), {ok: false});
  assert.deepEqual(saveTutorialProgress({enabled: true}, storage), {ok: false});
  assert.deepEqual(saveTutorialProgress(startTutorial(), {}), {ok: false});
});
