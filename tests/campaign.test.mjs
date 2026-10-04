import {secondTurnEvent} from './current-event-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, dispatch, getEventView, observe, actionCost, validatePlan, getNegotiationPreview} from '../app/js/core/engine.mjs';
import {choosePlan} from '../app/js/ai/rivals.mjs';
import {allOffers, startNegotiation} from '../app/js/core/negotiation.mjs';
import {countElection, districtTotals, trueWeights} from '../app/js/core/polls.mjs';
import {canonical, distribute, hashKey} from '../app/js/core/utils.mjs';
import {validateBundle} from '../app/js/core/scenario.mjs';
import {bundle, newGame, defaultSetup, command, finishEvent, freePlan, playCampaign} from './helpers.mjs';

const initial = newGame();
const copy = () => structuredClone(initial);
const planning = () => finishEvent(copy());

test('el escenario se valida, publica turno0 y abre la primera situación', () => {
  assert.equal(validateBundle(bundle), true);
  assert.equal(initial.phase, 'event');
  assert.equal(initial.turn, 1);
  assert.equal(initial.activeEvent, 'E01');
  assert.equal(initial.publishedPolls.P1.turn, 0);
  assert.equal(Object.keys(initial.publishedPolls).length, 6);
  assert.equal(Object.keys(initial.publishedPolls.P1.districts).length, 52);
});

test('la distribución entera conserva total e ignora orden de claves', () => {
  assert.deepEqual(distribute(7, {B: 1, A: 1, C: 1}), {A: 3, B: 2, C: 2});
  assert.deepEqual(distribute(100, {A: 97, B: 3}), {A: 97, B: 3});
  assert.throws(() => distribute(10, {A: 0}));
  assert.equal(hashKey('a', 'seed', 'x'), hashKey('a', 'seed', 'x'));
  assert.notEqual(hashKey('a', 'seed', 'x'), hashKey('b', 'seed', 'x'));
});

test('comandos inválidos, repetidos o atrasados dejan el estado intacto', () => {
  const s = copy(); const before = canonical(s);
  const r = dispatch(s, {id: 'x', expectedRevision: 0, type: 'CONFIRM_PLAN', plan: freePlan(s)}, bundle);
  assert.equal(r.ok, false); assert.equal(canonical(s), before);
  const after = command(s, 'CHOOSE_OPTION', {optionId: 'keep_interval'});
  assert.equal(dispatch(after, {id: 'x', expectedRevision: 0, type: 'CONTINUE'}, bundle).ok, false);
  assert.equal(s.phase, 'event');
  assert.equal(after.revision, 1);
});

test('costes de perfiles y especialistas se aplican una vez', () => {
  let s = copy();
  assert.deepEqual(actionCost(s, bundle, 'P1', 'candidate', 'visit', '09'), {budget: 6, energy: 14});
  assert.deepEqual(actionCost(s, bundle, 'P1', 'S1', 'research', '09'), {budget: 3, energy: 0});
  assert.deepEqual(actionCost(s, bundle, 'P1', 'S2', 'organize', '09'), {budget: 2, energy: 0});
  s.candidate.profile = 'conexion';
  assert.deepEqual(actionCost(s, bundle, 'P1', 'S1', 'research', '09'), {budget: 4, energy: 0});
  s.candidate.profile = 'coordinacion';
  assert.equal(actionCost(s, bundle, 'P1', 'candidate', 'interview').energy, 12);
  assert.equal(actionCost(s, bundle, 'P1', 'S1', 'advertise', 'national').budget, 14);
});

test('todos los eventos y etapas permiten salir con recursos cero', () => {
  for (const event of bundle.content.events) for (let i = 0; i < (event.stages?.length ?? 1); i++) {
    const s = copy(); s.activeEvent = event.id; s.eventStage = i;
    s.parties.P1.budget = 0; s.parties.P1.energy = 0; s.parties.P1.readiness = 0;
    s.reservedStaff = [...s.selectedStaff];
    assert.ok(getEventView(s, bundle).options.some(o => o.availability.available), event.id + ':' + i);
  }
});

test('delegar ocupa una acción y no permite que el plan la reutilice', () => {
  const s = command(secondTurnEvent('E02'), 'CHOOSE_OPTION', {optionId: 'delegate', staffId: 'S1'});
  assert.deepEqual(s.reservedStaff, ['S1']);
  const p = freePlan(s); assert.deepEqual(Object.keys(p.staff), ['S2']);
  p.staff.S1 = {id: 'wait', target: null};
  assert.equal(validatePlan(s, p, bundle).ok, false);
});

test('el plan completo no puede pagar con recuperación o recaudación futura', () => {
  const s = planning(); s.parties.P1.budget = 1; s.parties.P1.energy = 0;
  const p = freePlan(s); p.candidate = {id: 'fundraise', target: null}; p.staff.S1 = {id: 'advertise', target: '28'};
  assert.equal(validatePlan(s, p, bundle).ok, false);
  p.staff.S1 = {id: 'wait', target: null}; assert.equal(validatePlan(s, p, bundle).ok, false);
  assert.equal(validatePlan(s, freePlan(s), bundle).ok, true);
});

test('investigar ocupa exactamente dos publicaciones de sondeo', () => {
  let s = planning(); const p = freePlan(s); p.staff.S1 = {id: 'research', target: '09'};
  s = command(s, 'CONFIRM_PLAN', {plan: p});
  assert.equal(s.publishedPolls.P1.districts['09'].researched, true);
  assert.deepEqual(s.parties.P1.research['09'], {from: 1, through: 2});
  s = finishEvent(command(s, 'CONTINUE'));
  s = command(s, 'CONFIRM_PLAN', {plan: freePlan(s)});
  assert.equal(s.publishedPolls.P1.districts['09'].researched, true);
  s = finishEvent(command(s, 'CONTINUE'));
  s = command(s, 'CONFIRM_PLAN', {plan: freePlan(s)});
  assert.equal(s.publishedPolls.P1.districts['09'].researched, false);
});

test('preparar en equipo precede a entrevista y se consume preparación', () => {
  const s = planning(); s.parties.P1.readiness = 0;
  const p = freePlan(s); p.candidate = {id: 'interview', target: 'national'};
  p.staff.S1 = {id: 'prepare', target: null};
  const after = command(s, 'CONFIRM_PLAN', {plan: p});
  assert.equal(after.parties.P1.readiness, 1, 'Ensayo del equipo +2 por Preparación, entrevista consume 1');
  assert.equal(after.parties.P1.campaignDelta['09'], 100);
});

test('el debate exige preparación; Ada puede preparar el momento posterior', () => {
  let s = copy(); s.activeEvent = 'E07'; s.eventStage = 0; s.selectedStaff = ['S3', 'S4']; s.candidate.profile = 'coordinacion';
  assert.equal(getEventView(s, bundle).options.find(o => o.id === 'full_opening').availability.available, false);
  s = command(s, 'CHOOSE_OPTION', {optionId: 'ada_outline', staffId: 'S3'});
  assert.equal(s.parties.P1.readiness, 1);
  assert.equal(s.parties.P1.cohesion, 61);
  s = command(s, 'CHOOSE_OPTION', {optionId: 'compare_programmes'});
  assert.equal(s.parties.P1.readiness, 0);
  assert.equal(s.eventStage, 2);
});

test('el seguimiento civil mejora agenda y puede coexistir con dos tareas', () => {
  const s = copy(); s.activeEvent = 'E11'; s.rapport.C1 = 3; s.rapport.C2 = 4;
  s.promises = [{id: 'C1_REPLY', target: 'C1', status: 'open', dueTurn: bundle.config.turns}, {id: 'C2_REVIEW', target: 'C2', status: 'open', dueTurn: 6}];
  const option = getEventView(s, bundle).options.find(o => o.id === 'fulfil');
  assert.deepEqual(option.availability.cost, {budget: 4, energy: 2});
  const after = command(s, 'CHOOSE_OPTION', {optionId: 'fulfil'});
  assert.ok(after.promises.every(p => p.status === 'fulfilled'));
  assert.equal(after.parties.P1.reputation, 52);
  assert.deepEqual(after.parties.P1.campaignDelta, s.parties.P1.campaignDelta);
});

test('recaudar abre economía y el abuso tiene coste visible', () => {
  let s = planning(); const p = freePlan(s); p.candidate = {id: 'fundraise', target: null};
  s = command(s, 'CONFIRM_PLAN', {plan: p});
  assert.equal(s.parties.P1.budget, 82);
  assert.equal(s.parties.P1.energy, 62);
  s = finishEvent(command(s, 'CONTINUE')); s.parties.P1.repeatCounts.fundraise = 2;
  const before = s.parties.P1.budget; const rep = s.parties.P1.reputation;
  s = command(s, 'CONFIRM_PLAN', {plan: {...freePlan(s), candidate: {id: 'fundraise', target: null}}});
  assert.equal(s.parties.P1.budget, before + 16);
  assert.equal(s.parties.P1.reputation, rep - 4);
});

test('publicidad no cansa candidato y organización produce rendimiento acumulado', () => {
  const s = planning(); const p = freePlan(s); p.staff.S1 = {id: 'advertise', target: '28'}; p.staff.S2 = {id: 'organize', target: '09'};
  const after = command(s, 'CONFIRM_PLAN', {plan: p});
  assert.equal(after.parties.P1.campaignDelta['28'], 380);
  assert.equal(after.parties.P1.organization['09'], 1);
  assert.equal(after.parties.P1.campaignDelta['09'], 35);
  assert.equal(after.parties.P1.budget, 50);
});

test('contrastar deteriora relación y nunca afecta provincias ajenas a rival territorial', () => {
  const scenario = structuredClone(bundle);
  scenario.config.parties.find(p => p.id === 'R1').eligibility = ['15','27','32','36'];
  const s = command(createGame(scenario, 'territorial-contrast', defaultSetup), 'CHOOSE_OPTION', {optionId:'keep_interval'}, scenario);
  s.parties.P1.readiness = 2;
  const p = freePlan(s); p.candidate = {id: 'contrast', target: 'R1'};
  const after = command(s, 'CONFIRM_PLAN', {plan: p}, scenario);
  assert.equal(after.parties.P1.relations.R1, s.parties.P1.relations.R1 - 2);
  assert.equal(after.parties.R1.relations.P1, after.parties.P1.relations.R1);
  assert.equal(after.parties.P1.campaignDelta['28'], 0);
  assert.ok(Math.abs(after.parties.P1.campaignDelta['15']) > 0);
});

test('rivales usan observación publicada, reservan gasto y actúan dentro de su ámbito', () => {
  const s = planning(); const observation = observe(s, 'R1', bundle);
  assert.deepEqual(observation.party.campaignDelta,s.parties.R1.campaignDelta,'El rival conoce únicamente su propio alcance acumulado');
  assert.equal('parties' in observation.party,false);
  const original = choosePlan(observation);
  s.parties.R1.campaignDelta['15'] = 2000;
  assert.deepEqual(choosePlan(observe(s, 'R1', bundle)), original);
  for (const id of ['P2', 'P3', 'P4', 'R1', 'R2']) for (const budget of [0, 2, 8, 15, 60]) {
    const state = copy(); state.phase = 'planning'; state.parties[id].budget = budget;
    const plan = choosePlan(observe(state, id, bundle));
    assert.equal(validatePlan(state, plan, bundle, id).ok, true, id + ' budget ' + budget);
  }
});

test('posturas generan afinidad ficticia y no una ventaja moral universal', () => {
  const s = copy(); const first = trueWeights(s, bundle, '09').P1;
  for (const key of Object.keys(s.parties.P1.positions)) s.parties.P1.positions[key] *= -1;
  assert.notEqual(trueWeights(s, bundle, '09').P1, first);
  const d = bundle.provinces.districts.find(d => d.id === '09');
  assert.equal(districtTotals(bundle, d).electorate, 400000);
});

test('un recorrido completo produce 350 escaños, población conservada y rivales visibles', () => {
  const state = playCampaign(copy());
  assert.equal(state.phase, 'election');
  assert.equal(Object.values(state.electionResult.national.seatsByParty).reduce((s, n) => s + n, 0), 350);
  assert.equal(state.lastTransition.rivalMoves.length, 5);
  for (const [id, d] of Object.entries(state.electionResult.districts)) {
    assert.equal(d.electorate, d.abstentions + d.castVotes);
    assert.equal(d.castVotes, Object.values(d.partyVotes).reduce((s, n) => s + n, 0) + d.blankVotes + d.invalidVotes);
    for (const p of bundle.config.parties) assert.equal(Object.hasOwn(d.partyVotes, p.id), true);
  }
});

test('la proyección depende del sondeo y el recuento permanece congelado', () => {
  const s = copy(); s.electionResult = countElection(s, bundle); s.phase = 'election';
  const frozen = structuredClone(s.electionResult);
  const after = command(s, 'BEGIN_NEGOTIATION');
  assert.deepEqual(after.electionResult, frozen);
  assert.equal(after.negotiation.proponent, 'P1');
});

test('pactos exigen relación previa, respetan posturas y conservan 350 sentidos de voto', () => {
  const s = copy(); s.electionResult = countElection(s, bundle); startNegotiation(s, bundle);
  const offer = [2,2,1,1];
  const before = getNegotiationPreview(s, bundle, offer);
  assert.equal(before.votes.P2, 'no');
  s.parties.P1.relations.P2 = s.parties.P2.relations.P1 = 5;
  const after = getNegotiationPreview(s, bundle, offer);
  assert.equal(after.votes.P2, 'yes');
  assert.equal(Object.values(after.totals).reduce((sum, n) => sum + n, 0), 350);
  assert.ok(allOffers(bundle.config).every(o => o.reduce((sum, n) => sum + n, 0) === 6));
});

test('mayoría absoluta, simple, bloqueo y candidatura sin escaños terminan legalmente', () => {
  for (const votes of [{P1:176,P2:174,P3:0,P4:0,R1:0,R2:0}, {P1:175,P2:175,P3:0,P4:0,R1:0,R2:0}]) {
    let s = copy(); s.electionResult = countElection(s, bundle); s.electionResult.national.seatsByParty = votes; s.phase = 'election';
    s = command(s, 'BEGIN_NEGOTIATION'); s = command(s, 'PROPOSE', {offer:[2,2,1,1]});
    s = command(s, 'VOTE', {vote:'yes'});
    if (votes.P1 === 176) assert.equal(s.outcome.type, 'government');
    else {assert.equal(s.negotiation.ballot, 2); s = command(s,'VOTE',{vote:'yes'}); assert.equal(s.negotiation.proponent, 'P2');}
  }
  const s = copy(); s.electionResult = countElection(s, bundle); s.electionResult.national.seatsByParty.P1 = 0;
  startNegotiation(s, bundle); assert.notEqual(s.negotiation.proponent, 'P1');
});

test('el setup rechaza entradas materiales erróneas y conserva texto como texto', () => {
  for (const setup of [{staff:['S1','S1']}, {commitments:['T1','T1']}, {positions:{T1:0}}, {portrait:'https://x'}]) {
    assert.throws(() => createGame(bundle, 'test', {...defaultSetup,...setup}));
  }
  assert.throws(() => createGame(bundle, '\n', defaultSetup));
});

test('la abstención permite investidura simple tras fracaso de la absoluta sin recalcular escaños', () => {
  let s=copy();s.electionResult=countElection(s,bundle);s.phase='election';
  s.electionResult.national.seatsByParty={P1:150,P2:130,P3:70,P4:0,R1:0,R2:0};
  s.parties.P1.relations.P3=s.parties.P3.relations.P1=2;
  const counted=structuredClone(s.electionResult);
  s=command(s,'BEGIN_NEGOTIATION');s=command(s,'PROPOSE',{offer:[2,2,1,1]});
  s=command(s,'VOTE',{vote:'yes'});
  assert.equal(s.negotiation.ballot,2);assert.equal(s.phase,'negotiation');
  assert.deepEqual(s.negotiation.history[0].totals,{yes:150,no:130,abstain:70});
  s=command(s,'VOTE',{vote:'yes'});
  assert.equal(s.outcome.type,'government');assert.equal(s.outcome.votes.ballot,2);
  assert.deepEqual(s.electionResult,counted);
});

test('rechazo de todas las propuestas, apoyo ajeno y oposición tienen finales distintos', () => {
  for(const ending of ['deadlock','support','opposition']) {
    let s=copy();s.electionResult=countElection(s,bundle);s.phase='election';
    s.electionResult.national.seatsByParty={P1:120,P2:115,P3:0,P4:0,R1:115,R2:0};
    if(ending!=='deadlock')s.parties.P2.relations.R1=s.parties.R1.relations.P2=4;
    s=command(s,'BEGIN_NEGOTIATION');s=command(s,'PROPOSE',{offer:[2,2,1,1]});
    while(s.phase==='negotiation')s=command(s,'VOTE',{vote:ending==='support'?'yes':'no'});
    assert.equal(s.outcome.type,ending);
    assert.equal(s.negotiation.history.length,ending==='deadlock'?6:3);
  }
});

test('los rivales pagan sus acciones durante diez turnos y mantienen relaciones recíprocas', () => {
 let s=newGame('revision-flags-presupuesto');const actions=new Set();
 while(s.phase!=='election'){
  s=finishEvent(s);s=command(s,'CONFIRM_PLAN',{plan:freePlan(s)});
  for(const move of s.lastTransition.rivalMoves)actions.add(move.actionId);
  for(const [id,p] of Object.entries(s.parties)){
   assert.ok(p.budget>=0&&p.budget<=160);assert.ok(p.energy>=0&&p.energy<=100);
   for(const [other,value] of Object.entries(p.relations))assert.equal(value,s.parties[other].relations[id]);
  }
  s=command(s,'CONTINUE');
 }
 assert.equal(s.turn,10);assert.ok(actions.has('fundraise'));assert.ok(actions.has('contrast'));
});

test('abrir diálogo no garantiza ni un sí ni una abstención automática', () => {
  const s = copy(); s.electionResult = countElection(s, bundle); startNegotiation(s, bundle);
  for (const id of ['P2', 'P3']) s.parties.P1.relations[id] = s.parties[id].relations.P1 = 1;
  for (const offer of allOffers(bundle.config)) {
    const preview = getNegotiationPreview(s, bundle, offer);
    assert.equal(preview.votes.P2, 'no');
    assert.equal(preview.votes.P3, 'no');
  }
  s.parties.P1.relations.P3 = s.parties.P3.relations.P1 = 2;
  assert.equal(getNegotiationPreview(s, bundle, [3,1,1,1]).votes.P3, 'abstain');
  assert.equal(getNegotiationPreview(s, bundle, [2,1,3,0]).votes.P3, 'yes');
});

test('repetir contraste contra el mismo rival reduce alcance y conserva su coste', () => {
  let ready = null;
  for (let i = 0; i < 40 && !ready; i++) {
    const trial = finishEvent(newGame('contrast-repeat-'+i)); trial.parties.P1.readiness = 6;
    const result = command(trial, 'CONFIRM_PLAN', {plan:{...freePlan(trial),candidate:{id:'contrast',target:'P2'}}});
    const move = result.timeline.findLast(e=>e.kind==='plan'&&e.actionId==='contrast');
    if (move.changes.some(e=>e.stat==='support'&&e.partyId==='P1'&&e.delta>0)) ready = trial;
  }
  assert.ok(ready);
  for (const [repeats,expected] of [[0,75],[1,60],[2,45],[5,45]]) {
    const s = structuredClone(ready); s.parties.P1.repeatCounts['contrast:P2'] = repeats;
    const after = command(s,'CONFIRM_PLAN',{plan:{...freePlan(s),candidate:{id:'contrast',target:'P2'}}});
    const move = after.timeline.findLast(e=>e.kind==='plan'&&e.actionId==='contrast');
    assert.equal(move.changes.find(e=>e.stat==='support'&&e.partyId==='P1').delta,expected);
    assert.equal(after.parties.P1.repeatCounts['contrast:P2'],repeats+1);
    assert.equal(after.parties.P1.budget,s.parties.P1.budget-4);
    assert.equal(after.parties.P1.relations.P2,s.parties.P1.relations.P2-2);
  }
});
