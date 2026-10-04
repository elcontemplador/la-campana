import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle,newGame,command,freePlan,finishEvent} from './helpers.mjs';
import {actionRepeatPercent} from '../app/js/core/action-yield.mjs';
import {bundleV083} from '../app/js/core/bundles.mjs';
import {actionPreview} from '../app/js/ui/preview.mjs';
import {validateBundle} from '../app/js/core/scenario.mjs';
import {exportGame,importGame} from '../app/js/storage/save.mjs';

test('084: entrevistas conservan tres primeros usos, pierden novedad después y no penalizan visitas ni guardados083',()=>{
 const percentages=[100,80,60,40,25,20,20,20,20,20];
 for(let repeats=0;repeats<10;repeats++){
  assert.equal(actionRepeatPercent('interview',repeats,bundle.config),percentages[repeats]);
  assert.equal(actionRepeatPercent('interview',repeats,bundleV083.config),[100,80,60][Math.min(repeats,2)]);
  assert.equal(actionRepeatPercent('visit',repeats,bundle.config),[100,80,60][Math.min(repeats,2)]);
 }
 for(const value of [[100,80,60],[100,80,60,40,25,0],[100,80,60,40,25,NaN]]){
  const edited=structuredClone(bundle);edited.config.support.interviewRepeatPercent=value;assert.throws(()=>validateBundle(edited));
 }
});

test('084: diez Medios preparados legales muestran y ejecutan la pérdida de novedad sin reinicio por turno',()=>{
 let state=newGame('media-repetition-legal',{staff:['S1','S3'],difficulty:'iniciacion'});
 const percentages=[100,80,60,40,25,20,20,20,20,20];
 for(let index=0;index<10;index++){
  state=finishEvent(state);assert.equal(state.turn,index+1);
  const plan=freePlan(state);plan.candidate={id:'interview',target:null};plan.staff.S3={id:'prepare',target:null};
  const before=JSON.stringify(state),preview=actionPreview(state,bundle,plan.candidate,{plan});
  assert.equal(preview.yield.repeatPercent,percentages[index]);assert.equal(preview.yield.readinessConsumed,1);
  assert.equal(JSON.stringify(state),before);
  state=command(state,'CONFIRM_PLAN',{plan});
  const gain=state.lastTransition.entries.find(e=>e.actorId==='candidate').changes.find(c=>c.stat==='support');
  assert.equal(gain.requested,Math.floor(100*preview.yield.repeatPercent*preview.yield.energyPercent*preview.yield.cohesionPercent/1000000));
  assert.equal(state.parties.P1.repeatCounts.interview,index+1);
  assert.ok(importGame(exportGame(state,bundle),bundle).ok);
  if(index<9)state=command(state,'CONTINUE');
 }
 assert.equal(state.turn,10);assert.equal(state.phase,'debrief');assert.ok(state.electionResult);
});
