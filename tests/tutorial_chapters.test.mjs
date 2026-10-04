import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialStep,startTutorial,nextTutorial,skipTutorial,resumeTutorial,saveTutorialProgress,loadTutorialProgress,TUTORIAL_STORAGE_KEY} from '../app/js/ui/tutorial.mjs';
const state=(phase,turn=1)=>({phase,turn,lastTransition:{entries:[{actorId:'candidate'}],rivalMoves:[{partyId:'P2'}]},negotiation:{history:[]}});

test('el capítulo inicial se cierra en T1 y los pactos esperan al recuento, sin panel permanente en T2',()=>{
 let progress=startTutorial();progress=nextTutorial(progress,state('planning'));
 progress=nextTutorial(progress,state('debrief'));progress=nextTutorial(progress,state('debrief'));
 assert.equal(progress.step,4);assert.equal(progress.introCompletedTurn,1);
 assert.equal(tutorialStep(state('debrief'),progress).title,'Ya sabes jugar un turno');
 assert.equal(tutorialStep(state('event',2),progress),null);
 assert.equal(tutorialStep(state('planning',2),progress),null);
 assert.equal(tutorialStep(state('debrief',2),progress),null);
 assert.equal(progress.completed,false);
 assert.equal(tutorialStep(state('election',10),progress).id,'pact');
 assert.equal(tutorialStep(state('negotiation',10),progress).title,'Construye un acuerdo');
 assert.equal(tutorialStep(state('negotiation',10),skipTutorial(progress)),null);
});

test('guardar el cierre inicial respeta ocultar, retomar y reiniciar sin escribir la partida',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const progress={enabled:true,step:4,completed:false,introCompletedTurn:1};
 assert.equal(saveTutorialProgress(progress,storage).ok,true);assert.deepEqual(loadTutorialProgress(storage),progress);
 assert.deepEqual([...values.keys()],[TUTORIAL_STORAGE_KEY]);
 assert.equal(tutorialStep(state('planning',2),loadTutorialProgress(storage)),null);
 const resumed=resumeTutorial(skipTutorial(progress),state('planning',2));
 assert.equal(resumed.step,0);assert.equal(tutorialStep(state('planning',2),resumed).id,'province');
 const pacts=resumeTutorial(skipTutorial(progress),state('negotiation',10));
 assert.equal(tutorialStep(state('negotiation',10),pacts).id,'pact');
});

test('preferencias versión1 conservan el capítulo de pactos pendiente y no rompen slots',()=>{
 const storage={getItem:()=>JSON.stringify({format:'la-campana-tutorial',version:1,progress:{enabled:true,step:4,completed:false}})};
 const progress=loadTutorialProgress(storage);
 assert.equal(progress.step,4);assert.equal(tutorialStep(state('planning',2),progress),null);
 assert.equal(tutorialStep(state('election',10),progress).id,'pact');
 assert.equal(loadTutorialProgress({getItem:()=>JSON.stringify({format:'la-campana-tutorial',version:2,progress:{...progress,introCompletedTurn:-1}})}),null);
});
