import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checksum} from '../app/js/core/utils.mjs';
import {campaignIssue, ISSUE_CASES} from '../app/js/ui/issue-cases.mjs';
import {economicDilemma} from '../app/js/ui/economic-dilemma.mjs';

const data = name => JSON.parse(readFileSync(new URL('../data/' + name, import.meta.url), 'utf8'));
const bundle = {config: data('game_config.json'), provinces: data('provinces_2023.json'), content: data('events.json')};
const optionIds = ['announce_now', 'costed_commitment', 'postpone_answer'];
const caseIds = ['autonomos', 'primer-empleo', 'energia'];

// Public presentation fixtures only. They are not campaigns, never dispatched
// or exported. Mechanical execution and save compatibility have separate tests.
function displayState(seed = 'economic-text-0', pole = -1, identity = bundle.config.partyIdentities[0], source = bundle) {
  const positions = {...identity.positions, T3: pole};
  return {
    rulesVersion: source.config.rulesVersion, contentVersion: source.content.version,
    scenarioId: source.config.scenarioId, bundleChecksum: checksum(source), seed,
    phase: 'event', turn: 2, activeEvent: 'E04', timeline: [],
    initialSetup: {partyIdentity: identity.id, campaignScenario: source.config.defaultCampaignScenario,
      difficulty: source.config.defaultDifficulty, commitments: ['T1', 'T3'], positions, province: '09'},
    commitments: ['T1', 'T3'], parties: {P1: {positions}},
  };
}

let seeds;
function caseSeeds() {
  if (seeds) return seeds;
  seeds = new Map();
  for (let index = 0; index < 30 && seeds.size < caseIds.length; index++) {
    const seed = `economic-text-${index}`, state = displayState(seed);
    const issue = campaignIssue(state, bundle, {topicId: 'T3', sceneKey: 'E04', provinceId: '09'});
    seeds.set(issue.id, seed);
  }
  assert.deepEqual([...seeds.keys()].sort(), [...caseIds].sort());
  return seeds;
}

test('E04 0.8.5 conserva sus tres decisiones reales en los tres casos, dos polos y seis colores', () => {
  assert.equal(bundle.config.rulesVersion, '0.8.5');
  assert.equal(bundle.content.version, '0.8.5');
  const event = bundle.content.events.find(item => item.id === 'E04');
  assert.deepEqual(event.options.map(option => option.id), optionIds);
  let checked = 0;
  for (const identity of bundle.config.partyIdentities) for (const [caseId, seed] of caseSeeds()) for (const pole of [-1, 1]) {
    const state = displayState(seed, pole, identity), scene = economicDilemma(state, bundle);
    const issue = campaignIssue(state, bundle, {topicId: 'T3', sceneKey: 'E04', provinceId: '09'});
    assert.ok(scene, `${identity.id}/${caseId}/${pole}`);
    assert.equal(scene.eventId, 'E04'); assert.equal(scene.turn, 2);
    assert.equal(scene.provinceId, '09'); assert.equal(scene.issueId, caseId);
    assert.equal(scene.topicId, 'T3'); assert.equal(scene.speaker.id, 'C2');
    assert.equal(scene.speaker.kind, 'civil'); assert.equal(scene.format, 'politics');
    assert.equal(scene.icon, 'interview'); assert.equal(scene.title, issue.title);
    for (const name of ['optionLabels', 'optionSpeeches', 'optionIntents', 'optionDetails', 'newsLines', 'newsVerbs'])
      assert.deepEqual(Object.keys(scene[name]), optionIds, name);
    assert.equal(scene.optionSpeeches.announce_now, issue.reply);
    assert.equal(scene.economicDecision.proposal, issue.proposal);
    assert.equal(scene.economicDecision.caseId, caseId);
    assert.notEqual(scene.economicDecision.question, issue.question, 'La entrega explica la propuesta; no vuelve a elegir el polo');
    assert.ok(scene.body.includes(issue.brief));
    assert.match(scene.body, /Hay prensa en el encuentro con Taller Cívico/);
    assert.ok(scene.shortBody.includes(scene.economicDecision.question));
    assert.ok(scene.shortBody.length <= 180, `${caseId}/${pole}: ${scene.shortBody.length}`);
    assert.ok(scene.title.length <= 75);
    for (const text of Object.values(scene.optionLabels)) assert.ok(text.length <= 45, text);
    for (const text of Object.values(scene.optionIntents)) assert.ok(text.length <= 150, text);
    for (const text of Object.values(scene.optionSpeeches)) assert.ok(text.length >= 35 && text.length <= 220, text);
    assert.equal(new Set(Object.values(scene.optionSpeeches)).size, 3);
    assert.doesNotMatch(JSON.stringify(scene), /ganarás|te votará|votos garantizados|ley aprobada|ayudas entregadas|bajó la factura/i);
    checked++;
  }
  assert.equal(checked, 36);
});

test('las seis explicaciones tratan financiación, controles o plazos y solo prometen entregar una explicación', () => {
  const expected = {
    autonomos: {'-1': /financiarías las ayudas.*llegasen tarde/, '1': /protección de los autónomos.*cobras menos/},
    'primer-empleo': {'-1': /ayudas crean empleo.*puestos normales/, '1': /encadenasen contratos baratos/},
    energia: {'-1': /pagaría las ayudas.*ahorraría la fábrica/, '1': /bajas los impuestos a la luz.*dinero para los servicios/},
  };
  const answers = {
    autonomos: {'-1': /partida.*anticipo.*calendario de pagos/, '1': /presupuesto general.*cuota ordinaria.*menos dinero/},
    'primer-empleo': {'-1': /puesto nuevo.*tutor.*devolverla/, '1': /primera contratación.*duración mínima.*devolverla/},
    energia: {'-1': /partida pública.*empresa pagaría.*equipos.*obras/, '1': /menos gasto.*permisos.*controles.*conexión a la red/},
  };
  const cardSubjects = {
    autonomos: {'-1': /dinero.*cobrar Marta/, '1': /protección de Marta.*recaudas menos/},
    'primer-empleo': {'-1': /empresa.*crea un puesto/, '1': /empresa encadene contratos/},
    energia: {'-1': /pagaría las obras.*ahorrar en luz/, '1': /gasto recortarías.*instalaciones/},
  };
  for (const [caseId, seed] of caseSeeds()) {
    const poles = [];
    for (const pole of [-1, 1]) {
      const scene = economicDilemma(displayState(seed, pole), bundle), decision = scene.economicDecision;
      assert.deepEqual(Object.keys(decision), ['caseId', 'question', 'proposal', 'request', 'delivery', 'explanation']);
      assert.match(decision.question, expected[caseId][pole]);
      assert.match(decision.delivery, /^una explicación /);
      assert.match(decision.explanation, /^Propondría /);
      assert.match(decision.explanation, answers[caseId][pole]);
      assert.ok(decision.explanation.length <= 350);
      assert.doesNotMatch(decision.explanation, /\d|hemos aprobado|ya se paga|ha bajado|está garantizado/i);
      assert.doesNotMatch(scene.optionSpeeches.costed_commitment, /cuánto costarían|cuánto tardarían|qué ingresos perderíamos/i);
      assert.match(scene.optionSpeeches.costed_commitment, /^Antes de las urnas (explicaré|diré) /);
      assert.match(scene.newsLines.costed_commitment, /^Prometes explicar en el turno 10 /);
      assert.match(scene.newsLines.costed_commitment, cardSubjects[caseId][pole]);
      assert.notEqual(scene.newsLines.announce_now, scene.newsLines.costed_commitment);
      assert.match(scene.optionSpeeches.postpone_answer, /^Mantengo mi propuesta\./);
      assert.match(scene.optionIntents.announce_now, /prensa.*caja y energía.*pregunta/);
      assert.match(scene.optionIntents.costed_commitment, /turno 10.*energía.*renuncias al anuncio/);
      assert.match(scene.optionIntents.postpone_answer, /Conservas recursos.*puede enfriarse/);
      assert.doesNotMatch(scene.optionSpeeches.costed_commitment, /aprobaré|pagaré|entregaré ayudas|contrataré|construiré|bajaré impuestos/i);
      poles.push(scene);
    }
    assert.notEqual(poles[0].economicDecision.question, poles[1].economicDecision.question);
    assert.notEqual(poles[0].optionSpeeches.announce_now, poles[1].optionSpeeches.announce_now);
    assert.deepEqual(poles[0].optionIntents, poles[1].optionIntents, 'La orientación no cambia premios, costes ni renuncias narradas');
    for (const pole of [-1, 1]) {
      const same = bundle.config.partyIdentities.map(identity => economicDilemma(displayState(seed, pole, identity), bundle));
      for (const scene of same) {
        assert.deepEqual(scene.economicDecision, same[0].economicDecision);
        assert.deepEqual(scene.optionSpeeches, same[0].optionSpeeches);
      }
    }
  }
});

test('el caso usa la última visita propia anterior a E04 y conserva su provincia al recordar la entrega', () => {
  const state = displayState(caseSeeds().get('energia'), 1);
  state.timeline = [
    {id: 'own-visit', turn: 1, kind: 'plan', actorId: 'candidate', actionId: 'visit', target: '28'},
    {id: 'other-party', turn: 1, kind: 'plan', partyId: 'P2', actorId: 'candidate', actionId: 'visit', target: '46'},
    {id: 'staff', turn: 1, kind: 'plan', actorId: 'S1', actionId: 'visit', target: '15'},
    {id: 'future-visit', turn: 99, kind: 'plan', actorId: 'candidate', actionId: 'visit', target: '08'},
  ];
  state.focusProvince = '51'; state.lastVisitedProvince = '52';
  const before = JSON.stringify(state), scene = economicDilemma(state, bundle);
  assert.equal(scene.provinceId, '28');
  assert.ok(scene.optionDetails.announce_now.includes('Madrid'));
  assert.equal(scene.issueId, campaignIssue(state, bundle, {topicId: 'T3', sceneKey: 'E04', provinceId: '28'}).id);
  assert.equal(JSON.stringify(state), before);
  for (const optionId of optionIds) {
    const historical = structuredClone(state);
    historical.phase = 'planning'; historical.turn = 10; historical.activeEvent = 'E11';
    historical.timeline.push({id: 'economic-choice', turn: 2, kind: 'event', eventId: 'E04', optionId},
      {id: 'later-visit', turn: 7, kind: 'plan', actorId: 'candidate', actionId: 'visit', target: '35'});
    assert.deepEqual(economicDilemma(historical, bundle, {turn: 2}), scene);
  }
});

test('ni encuestas, rivales privados, recursos o estado de la promesa alteran el relato', () => {
  const state = displayState(caseSeeds().get('autonomos'), -1), snapshot = JSON.stringify(state), original = JSON.stringify(bundle);
  const expected = economicDilemma(state, bundle);
  const player = new Proxy(state.parties.P1, {get(target, key) {
    if (key !== 'positions') throw new Error(`Dato propio no pertinente: ${String(key)}`);
    return target[key];
  }});
  const parties = new Proxy(state.parties, {get(target, key) {
    if (key !== 'P1') throw new Error('Estado rival privado');
    return player;
  }});
  const guarded = new Proxy(state, {get(target, key) {
    if (['publishedPolls', 'promises', 'lastTransition', 'draftPlan'].includes(key)) throw new Error(`Dato no pertinente: ${String(key)}`);
    return key === 'parties' ? parties : target[key];
  }});
  assert.deepEqual(economicDilemma(guarded, bundle), expected);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(JSON.stringify(bundle), original);
});

test('las guardas excluyen versiones anteriores, catálogos ajenos, futuros y recuerdos no confirmados', () => {
  const state = displayState();
  assert.equal(economicDilemma(null, bundle), null);
  for (const version of ['0.6.1', '0.7.0', '0.7.1', '0.8.0'])
    assert.equal(economicDilemma({...state, contentVersion: version}, bundle), null);
  assert.equal(economicDilemma({...state, rulesVersion: '0.8.0'}, bundle), null);
  assert.equal(economicDilemma(state, bundle, {turn: 3}), null);
  assert.equal(economicDilemma(state, bundle, {turn: 1}), null);
  assert.equal(economicDilemma(state, bundle, {turn: 2.5}), null);
  assert.equal(economicDilemma({...state, turn: 3, activeEvent: 'E29'}, bundle, {turn: 2}), null);
  const wrongActor = {...state, turn: 3, activeEvent: 'E29', timeline: [
    {id: 'not-ours', turn: 2, kind: 'event', partyId: 'P2', eventId: 'E04', optionId: 'costed_commitment'},
  ]};
  assert.equal(economicDilemma(wrongActor, bundle, {turn: 2}), null);
  assert.equal(economicDilemma({...state, parties: {P1: {positions: {T3: 0}}}}, bundle), null);
  const foreign = structuredClone(bundle); foreign.content.version = '0.8.0';
  assert.equal(economicDilemma(state, foreign), null);
  const incomplete = structuredClone(bundle);
  incomplete.content.events.find(event => event.id === 'E04').options.pop();
  assert.equal(economicDilemma(displayState('economic-text-0', -1, incomplete.config.partyIdentities[0], incomplete), incomplete), null);
  assert.deepEqual(ISSUE_CASES.filter(issue => issue.topicId === 'T3').map(issue => issue.id).sort(), [...caseIds].sort());
});
