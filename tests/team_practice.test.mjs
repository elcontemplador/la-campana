import test from 'node:test';
import assert from 'node:assert/strict';
import {beginTeamPractice,teamPracticeDraft,submitTeamPractice,teamPracticeResult} from '../app/js/ui/team-practice.mjs';
import {validatePlan} from '../app/js/core/engine.mjs';
import {bundle,newGame,finishEvent,freePlan,command} from './helpers.mjs';
const planning=()=>finishEvent(newGame('practica-equipo'));

test('el ejercicio compara tareas y destinos reales sin cambiar ni ejecutar el plan',()=>{
 const state=planning(),plan=freePlan(state),before=JSON.stringify(state);
 const practice=beginTeamPractice(state,plan,validatePlan(state,plan,bundle));
 plan.staff.S1={id:'organize',target:'09'};
 const draft=teamPracticeDraft(practice,state,plan,validatePlan(state,plan,bundle));
 assert.equal(draft.changes.length,1);assert.equal(draft.changes[0].before.id,'wait');
 assert.equal(draft.changes[0].after.target,'09');assert.equal(draft.beforeBudget,0);
 assert.ok(draft.budget>0);assert.equal(JSON.stringify(state),before);
 assert.equal(practice.before.S1.id,'wait','La copia no comparte tareas con el borrador');
 const provincePractice=beginTeamPractice(state,plan,validatePlan(state,plan,bundle));
 plan.staff.S1.target='28';
 assert.equal(teamPracticeDraft(provincePractice,state,plan,validatePlan(state,plan,bundle)).changes[0].before.target,'09');
});

test('conservar la propuesta, revertir o no poder pagar no fabrica un resultado',()=>{
 const state=planning(),plan=freePlan(state),practice=beginTeamPractice(state,plan,validatePlan(state,plan,bundle));
 assert.equal(submitTeamPractice(practice,state,plan,{ok:true,cost:{budget:0}}),null);
 plan.staff.S1={id:'prepare',target:null};
 assert.equal(submitTeamPractice(practice,state,plan,{ok:false,cost:{budget:999}}),null);
 assert.equal(teamPracticeDraft(practice,state,plan,{ok:false,cost:{budget:999}}).legal,false);
 plan.staff.S1={id:'wait',target:null};
 assert.deepEqual(teamPracticeDraft(practice,state,plan,{ok:true,cost:{budget:0}}).changes,[]);
 assert.deepEqual(teamPracticeResult(practice,state),[]);
});

test('el cierre usa el registro exacto del colaborador, incluido aporte cero por límite',()=>{
 const state=planning();state.parties.P1.readiness=6;
 const plan=freePlan(state),practice=beginTeamPractice(state,plan,validatePlan(state,plan,bundle));
 plan.staff.S1={id:'prepare',target:null};
 const submitted=submitTeamPractice(practice,state,plan,validatePlan(state,plan,bundle));
 const after=command(state,'CONFIRM_PLAN',{plan});
 const results=teamPracticeResult(submitted,after);assert.equal(results.length,1);
 assert.equal(results[0].entry,after.lastTransition.entries.find(e=>e.actorId==='S1'));
 assert.ok(!results[0].entry.changes.some(c=>c.stat==='readiness'&&c.delta>0));
 assert.deepEqual(teamPracticeResult(submitted,{...after,revision:after.revision+1}),[]);
 assert.deepEqual(teamPracticeResult(submitted,{...after,turn:after.turn+1}),[]);
 const wrong=structuredClone(after);wrong.lastTransition.entries.find(e=>e.actorId==='S1').partyId='P2';
 assert.deepEqual(teamPracticeResult(submitted,wrong),[]);
});

test('personas ocupadas, fases distintas y tareas que cambian de nuevo se respetan',()=>{
 const state=planning();state.reservedStaff=['S1'];const plan=freePlan(state);
 const practice=beginTeamPractice(state,plan,validatePlan(state,plan,bundle));
 assert.deepEqual(Object.keys(practice.before),['S2']);
 plan.staff.S2={id:'organize',target:'09'};
 plan.staff.S2={id:'prepare',target:null};
 const submitted=submitTeamPractice(practice,state,plan,validatePlan(state,plan,bundle));
 assert.equal(submitted.submitted[0].after.id,'prepare');
 assert.equal(teamPracticeDraft(practice,{...state,turn:2},plan,{}),null);
 assert.equal(beginTeamPractice({...state,phase:'event'},plan,{}),null);
 assert.equal(beginTeamPractice({...state,reservedStaff:state.selectedStaff},plan,{}),null);
});
