import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle,command,finishEvent,freePlan,newGame} from './helpers.mjs';
import {secondTurnEvent} from './current-event-fixture.mjs';
import {getEventView} from '../app/js/core/engine.mjs';
import {eventStory} from '../app/js/ui/stories.mjs';
import {eventLocalReception} from '../app/js/ui/local-reception.mjs';
import {newsReaction} from '../app/js/ui/news-reaction.mjs';
import {promiseThreads} from '../app/js/ui/promises.mjs';
import {exportGame,importGame} from '../app/js/storage/save.mjs';
import {guidedSetupIssues,setupIssues} from '../app/js/ui/usability.mjs';

function replay(state){const saved=exportGame(state,bundle),restored=importGame(saved,bundle);assert.ok(restored.ok,restored.error?.message);assert.deepEqual(restored.state,state);return restored.state;}
function continueTo(state,turn){
 while(state.turn<turn){
  if(state.phase==='event'){
   const view=getEventView(state,bundle),option=view.options.find(o=>o.id==='cancel'&&o.availability.available)
    ||view.options.find(o=>o.availability.available&&!o.reserveStaff&&!o.availability.cost.budget&&!o.availability.cost.energy);
   state=command(state,'CHOOSE_OPTION',{optionId:option.id});
  }else if(state.phase==='planning')state=command(state,'CONFIRM_PLAN',{plan:freePlan(state)});
  else state=command(state,'CONTINUE');
 }
 return state;
}

test('E04 tiene tres renuncias mecánicas distintas, una jugada posterior y replay exacto',()=>{
 const initial=secondTurnEvent('E04',{staff:['S1','S4']}),story=eventStory(initial,bundle),before=JSON.stringify(initial);
 const view=getEventView(initial,bundle);
 assert.deepEqual(view.options.map(o=>o.id),['announce_now','costed_commitment','postpone_answer']);
 for(const option of view.options){
  assert.equal(option.reserveStaff,false);assert.equal(option.requiresStaff,null);
  const after=command(initial,'CHOOSE_OPTION',{optionId:option.id}),entry=after.timeline.at(-1);
  assert.equal(after.phase,'planning');assert.equal(after.revision,initial.revision+1);
  assert.deepEqual(after.reservedStaff,[]);assert.deepEqual(after.parties.P1.positions,initial.parties.P1.positions);
  assert.deepEqual(after.publishedPolls,initial.publishedPolls);
  assert.equal(after.parties.P1.budget,initial.parties.P1.budget-option.availability.cost.budget);
  assert.equal(after.parties.P1.energy,initial.parties.P1.energy-option.availability.cost.energy);
  const support=entry.changes.find(c=>c.stat==='support');
  if(option.id==='announce_now'){
   const local=eventLocalReception(initial,bundle,option.id);
   assert.equal(support.delta,(local.matches?1:-1)*35*local.salience);
   assert.equal(after.promises.length,0);assert.equal(after.rapport.C2,initial.rapport.C2);
  }else{
   assert.equal(support,undefined);
   if(option.id==='costed_commitment'){
    const thread=promiseThreads(after,bundle).find(p=>p.id==='C2_REVIEW');
    assert.equal(thread.question,story.economicDecision.question);assert.equal(thread.explanation,story.economicDecision.explanation);
    assert.equal(thread.dueTurn,10);assert.equal(thread.status,'open');
    assert.equal(after.parties.P1.readiness,initial.parties.P1.readiness+1);
   }else{assert.equal(after.promises.length,0);assert.equal(after.parties.P1.readiness,initial.parties.P1.readiness);}
  }
  const reaction=newsReaction(after,bundle);assert.ok(reaction.headline.length<=80);assert.ok(reaction.summary.length<=180);
  const restored=replay(after);assert.deepEqual(newsReaction(restored,bundle),reaction);
  const played=command(restored,'CONFIRM_PLAN',{plan:freePlan(restored)});assert.equal(played.phase,'debrief');
 }
 assert.equal(JSON.stringify(initial),before);
});

test('la explicación vuelve en E11 y todas las entregas legales conservan su asunto',()=>{
 const original=secondTurnEvent('E04',{staff:['S1','S4']}),opening=eventStory(original,bundle);
 let state=command(original,'CHOOSE_OPTION',{optionId:'costed_commitment'});
 state=continueTo(state,10);assert.equal(state.activeEvent,'E11');
 const scene=eventStory(state,bundle),thread=promiseThreads(state,bundle).find(p=>p.id==='C2_REVIEW');
 assert.equal(thread.question,opening.economicDecision.question);
 assert.ok(scene.optionSpeeches.fulfil.includes(opening.economicDecision.explanation));
 assert.ok(scene.optionSpeeches.acknowledge_miss.includes(opening.economicDecision.request));
 for(const option of getEventView(state,bundle).options.filter(o=>o.availability.available)){
  const after=command(state,'CHOOSE_OPTION',{optionId:option.id,staffId:option.reserveStaff?option.availability.staffChoices[0]:null});
  const result=promiseThreads(replay(after),bundle).find(p=>p.id==='C2_REVIEW');
  assert.equal(result.question,thread.question);assert.equal(result.entryId,thread.entryId);
  assert.equal(result.status,option.id==='reduce_with_saul'?'reduced':option.id==='acknowledge_miss'?'missed':'fulfilled');
  assert.equal(after.phase,'planning');
 }
});

test('la creación guiada no pide datos de pasos futuros y la validación final sigue completa',()=>{
 const setup={name:'',seed:'partida',staff:[],commitments:[]};
 assert.deepEqual(guidedSetupIssues(setup,{step:0}),[]);
 assert.deepEqual(guidedSetupIssues(setup,{step:1}).map(x=>x.target),['#candidate-name']);
 assert.deepEqual(guidedSetupIssues(setup,{step:2}).map(x=>x.target),['#staff-title','#topics-title']);
 assert.deepEqual(guidedSetupIssues(setup,{step:3}),setupIssues(setup));
 assert.deepEqual(guidedSetupIssues(setup,{all:true}),setupIssues(setup));
});

test('E10 crea, mantiene o no asume la promesa sin cambiar su relato tras confirmarlo o cerrarla',()=>{
 let initial=finishEvent(newGame('v080-second-3',{difficulty:'iniciacion',staff:['S1','S4']}));
 initial=command(command(initial,'CONFIRM_PLAN',{plan:freePlan(initial)}),'CONTINUE');
 assert.equal(initial.activeEvent,'E04');
 for(const opening of ['announce_now','costed_commitment','postpone_answer']){
  const at8=continueTo(command(initial,'CHOOSE_OPTION',{optionId:opening}),8);
  assert.equal(at8.activeEvent,'E10');const scene=eventStory(at8,bundle);
  for(const choice of ['limited_statement','saul_limits','no_statement']){
   const option=getEventView(at8,bundle).options.find(o=>o.id===choice);assert.ok(option.availability.available);
   const after=command(at8,'CHOOSE_OPTION',{optionId:choice,staffId:option.reserveStaff?'S4':null});
   assert.deepEqual(eventStory(after,bundle),scene,'El propio comando no se convierte en una promesa anterior');
   const thread=promiseThreads(after,bundle).find(p=>p.id==='C2_REVIEW');
   if(opening==='costed_commitment'||choice!=='no_statement'){
    assert.equal(thread.status,'open');assert.ok(newsReaction(after,bundle).summary.includes('pendiente'));
    let close=continueTo(after,10);assert.equal(close.activeEvent,'E11');
    close=command(close,'CHOOSE_OPTION',{optionId:'fulfil'});
    assert.deepEqual(eventStory(replay(close),bundle,{eventId:'E10',turn:8}),scene);
   }else assert.equal(thread,undefined);
  }
 }
});
