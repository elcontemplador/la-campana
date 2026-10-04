// UI guidance and preferences only: no game commands, resource changes or DOM effects.
export const TUTORIAL_STORAGE_KEY = 'la-campana-v061-tutorial';
export const TUTORIAL_STEP_IDS = Object.freeze(['province', 'action', 'consequence', 'rival', 'pact']);

const phases = new Set(['event', 'planning', 'debrief', 'election', 'negotiation', 'ending']);
const target = id => `[data-tutorial-target="${id}"]`;

function normalized(progress) {
  const completed = progress?.completed === true;
  return {
    enabled: progress?.enabled === true && !completed,
    step: Number.isInteger(progress?.step) && progress.step >= 0 && progress.step < TUTORIAL_STEP_IDS.length
      ? progress.step : 0,
    completed,
    ...(Number.isSafeInteger(progress?.introCompletedTurn) && progress.introCompletedTurn >= 0
      ? {introCompletedTurn: progress.introCompletedTurn} : {}),
  };
}

function minimumStep(state) {
  if (['election', 'negotiation', 'ending'].includes(state?.phase)) return 4;
  return state?.phase === 'debrief' ? 2 : 0;
}

function shownStep(state, progress) {
  return Math.max(progress.step, minimumStep(state));
}

function candidateWasPlayed(state) {
  return (state.lastTransition?.entries || []).some(entry => entry.actorId === 'candidate'
    && (!entry.partyId || entry.partyId === 'P1'));
}

function rivalsWereRevealed(state) {
  const moves = state.lastTransition?.rivalMoves
    || (state.timeline || []).filter(entry => entry.kind === 'rival' && entry.turn === state.turn);
  return moves.some(entry => entry.partyId && entry.partyId !== 'P1');
}

function waiting(state) {
  if (state.phase === 'event') return {
    title: state.activeEvent==='E07'?'Estás en el debate':'Responde a la noticia',
    body: ['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)&&state.activeEvent==='E31'?'Elige qué intervención quieres reforzar mañana. Hoy no gastas recursos. Comparar o abrir con fuerza necesitará una ficha: el equipo puede ensayar en la agenda de hoy. Puedes elegir otra respuesta en el debate.':state.activeEvent==='E07'?'Compara lo que dirías y su coste. Cada respuesta conduce al siguiente momento; después prepararás tu jugada.':state.activeEvent==='E01'&&['0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)?'Elige con qué problema abres la campaña. Mira el apoyo o rechazo del sondeo local y el coste. También puedes reservar el anuncio; después eliges tu jugada en el mapa.':'Compara qué consigues y a qué renuncias. Hay una opción gratuita; después prepararás tu jugada en el mapa.',
    selector: '[data-option]:not(:disabled)',
  };
  if (state.phase === 'planning') return {
    title: 'Prepara tu jugada',
    body: 'Revisa tu jugada y pulsa Jugar para ver el resultado. Si te faltan recursos, elige Descansar y pon al equipo a Ahorrar en Cambiar tareas.',
    selector: target('action'),
  };
  return {
    title: 'Sigue la campaña',
    body: 'Continúa la campaña con los controles del juego. Los escaños y el programa determinarán qué acuerdos puedes buscar.',
    selector: '[data-command="CONTINUE"]',
  };
}

export function tutorialStep(state, progress) {
  const preference = normalized(progress);
  if (!preference.enabled || !state || !phases.has(state.phase)) return null;
  const index = shownStep(state, preference);
  const id = TUTORIAL_STEP_IDS[index];
  if (id === 'pact' && !['election', 'negotiation', 'ending'].includes(state.phase)) {
    if (state.phase !== 'debrief' || preference.introCompletedTurn !== state.turn) return null;
    return {id, title: 'Ya sabes jugar un turno',
      body: 'Elige tu jugada, aprovecha el equipo y responde a los rivales. La guía volverá al llegar al recuento para explicar los pactos.',
      targetSelector: '[data-command="CONTINUE"]', canAdvance: false, teamTips: null, chapter: 'initial-complete'};
  }
  let title, body, targetSelector, canAdvance = false;
  if (id === 'province') {
    title = 'Elige una provincia';
    body = 'Pulsa una provincia para preparar una visita. Puedes comparar destinos; seleccionar no ejecuta la jugada.';
    targetSelector = target(id);
    // Selection belongs to the UI; this step introduces the available planning control.
    canAdvance = state.phase === 'planning';
  } else if (id === 'action') {
    title = 'Una jugada y hasta dos tareas de equipo';
    const reserved = state.reservedStaff?.length || 0;
    const team = reserved
      ? 'Una tarea del equipo puede estar ocupada por la noticia; ese colaborador no hará otra tarea.'
      : 'El equipo propone dos tareas; puedes dejarlas o pulsar Cambiar tareas.';
    body = `El candidato hace una sola jugada por turno; puedes cambiarla antes de Jugar. ${team} Las tareas se hacen junto a tu jugada: gastan caja, no energía del candidato. Jugar confirma todo; descansar también es una jugada.`;
    targetSelector = target(id);
  } else if (id === 'consequence') {
    title = 'Reconoce lo que cambió';
    body = 'Mira qué consiguió tu jugada y qué hizo el equipo. Ensayar prepara próximas intervenciones, los voluntarios suman apoyo y las reuniones ayudan a pactar. Ahorrar conserva caja.';
    targetSelector = target(id);
    canAdvance = state.phase === 'debrief' && candidateWasPlayed(state);
  } else if (id === 'rival') {
    title = 'Responde a un rival';
    body = 'Mira la jugada del rival destacado. ¿Te disputa un destino o enfría un acuerdo? Puedes cambiar el siguiente plan o mantenerlo.';
    targetSelector = target(id);
    canAdvance = state.phase === 'debrief' && rivalsWereRevealed(state);
  } else {
    title = state.phase === 'ending' ? 'Tu campaña deja un resultado' : 'Construye un acuerdo';
    body = 'Comprueba apoyos y prioridades. En primera votación hacen falta 176 síes; en segunda, más síes que noes. Proponer y votar son decisiones tuyas.';
    targetSelector = target('pact');
    canAdvance = state.phase === 'ending' || (state.phase === 'negotiation' && (state.negotiation?.history?.length || 0) > 0);
    if (state.phase === 'election') {
      body = 'Ya se han repartido los escaños. Mira qué candidaturas pueden proponer un Gobierno y abre los acuerdos. Puedes buscar apoyos para tu propuesta o apoyar la de otro partido. Primera votación: 176 síes; segunda: más síes que noes.';
      targetSelector = '[data-command="BEGIN_NEGOTIATION"]';
    } else if (state.phase === 'ending') {
      body = 'Revisa el acuerdo y tus prioridades. Puedes repetir la misma campaña y cambiar una decisión; terminar el tutorial no cambia este resultado.';
      targetSelector = '#phase-heading';
    }
  }
  const supported = (['province', 'action'].includes(id) && state.phase === 'planning')
    || (['consequence', 'rival'].includes(id) && state.phase === 'debrief')
    || (id === 'pact' && ['election', 'negotiation', 'ending'].includes(state.phase));
  if (!supported) {
    const context = waiting(state);
    title = context.title;
    body = context.body;
    targetSelector = context.selector;
  }
  const teamTips = id === 'action' && supported ? [
    'Voluntarios: deja un equipo en una provincia; suma apoyo al terminar este turno y los siguientes. Cuanto antes lo organices, más turnos trabajará.',
    'Ensayo: mejora Medios incluso hoy y sirve para el debate. En el último turno comprueba que vayas a usarlo.',
    'Reunión: escoge un rival y mejora la relación para los pactos; no asegura su voto.',
    'Ahorrar: el colaborador no hace una tarea adicional y no gasta. Conserva caja; no recauda dinero.',
    'Prueba opcional: abre Cambiar tareas, elige un colaborador y cambia su tarea o destino. Pulsa Listo para comparar el coste junto a Jugar. Hasta confirmar, no se ejecuta nada.',
  ] : null;
  return {id, title, body, targetSelector, canAdvance, teamTips};
}

export function startTutorial(state = null) {
  return {enabled: true, step: minimumStep(state), completed: false};
}

export function resumeTutorial(progress, state = null) {
  const preference = normalized(progress);
  if (preference.completed) return startTutorial(state);
  if (preference.step === 4 && !['election', 'negotiation', 'ending'].includes(state?.phase)) return startTutorial(state);
  return {...preference, enabled: true, step: shownStep(state, preference)};
}

export function nextTutorial(progress, state = null) {
  const preference = normalized(progress);
  if (!preference.enabled) return preference;
  let current = preference.step;
  if (state) {
    const view = tutorialStep(state, preference);
    if (!view?.canAdvance) return preference;
    current = TUTORIAL_STEP_IDS.indexOf(view.id);
  }
  return current === TUTORIAL_STEP_IDS.length - 1
    ? {enabled: false, step: current, completed: true}
    : {...preference, step: current + 1,
      ...(current === 3 && state ? {introCompletedTurn: state.turn} : {})};
}

export function skipTutorial(progress) {
  return {...normalized(progress), enabled: false};
}

function validPreference(progress) {
  return progress && typeof progress === 'object' && !Array.isArray(progress)
    && [3, 4].includes(Object.keys(progress).length)
    && (Object.keys(progress).length === 3 || Number.isSafeInteger(progress.introCompletedTurn) && progress.introCompletedTurn >= 0)
    && Object.keys(progress).every(key => ['enabled', 'step', 'completed', 'introCompletedTurn'].includes(key))
    && Object.hasOwn(progress, 'enabled')
    && Object.hasOwn(progress, 'step') && Object.hasOwn(progress, 'completed')
    && typeof progress.enabled === 'boolean' && typeof progress.completed === 'boolean'
    && Number.isInteger(progress.step) && progress.step >= 0 && progress.step < TUTORIAL_STEP_IDS.length;
}

export function loadTutorialProgress(storage) {
  try {
    const text = (storage ?? globalThis.localStorage)?.getItem(TUTORIAL_STORAGE_KEY);
    if (typeof text !== 'string' || text.length > 512) return null;
    const record = JSON.parse(text);
    if (record?.format !== 'la-campana-tutorial' || ![1, 2].includes(record.version)
      || record.version === 1 && Object.keys(record.progress || {}).length !== 3 || !validPreference(record.progress)) return null;
    return normalized(record.progress);
  } catch {
    return null;
  }
}

export function saveTutorialProgress(progress, storage) {
  try {
    if (!validPreference(progress)) return {ok: false};
    const destination = storage ?? globalThis.localStorage;
    if (!destination?.setItem) return {ok: false};
    destination.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({
      format: 'la-campana-tutorial', version: 2, progress: normalized(progress),
    }));
    return {ok: true};
  } catch {
    return {ok: false};
  }
}
