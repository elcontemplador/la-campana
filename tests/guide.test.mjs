import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,bundle,defaultSetup} from './helpers.mjs';
import {guideReference,guidedLesson,loadGuideLevel,saveGuideLevel,GUIDE_LEVEL_KEY} from '../app/js/ui/guide.mjs';
import {guideView} from '../app/js/ui/guide-view.mjs';
import {tutorialStep,startTutorial,nextTutorial} from '../app/js/ui/tutorial.mjs';
import {createGame} from '../app/js/core/engine.mjs';
import {legacyBundle,bundleV070,bundleV071,bundleV080,bundleV081,bundleV082,bundleV083,bundleV084} from '../app/js/core/bundles.mjs';
const renderHelpers={esc:s=>String(s).replaceAll('<','&lt;'),fmt:String,icon:()=>''};

test('la guía muestra costes del perfil y especialista y deja intacta la campaña',()=>{
 const prepared=newGame(),before=JSON.stringify(prepared),guide=guideReference(prepared,bundle);
 assert.equal(guide.actions.find(a=>a.id==='visit').cost.energy,14);
 assert.equal(guide.tasks.find(a=>a.id==='organize').costs.find(a=>a.name.includes('Bruno')).budget,2);
 const connection=guideReference(newGame('connection',{profile:'conexion'}),bundle);
 assert.equal(connection.tasks.find(a=>a.id==='research').costs.find(a=>a.name.includes('Inés')).budget,4);
 const coordination=guideReference(newGame('coordination',{profile:'coordinacion'}),bundle);
 assert.equal(coordination.actions.find(a=>a.id==='interview').cost.energy,12);
 assert.equal(JSON.stringify(prepared),before);
 assert.deepEqual(guide.actions.map(a=>a.id),['visit','interview','fundraise','rest']);
 assert.equal(guide.tasks.length,7);
});
test('cambiar nivel no adelanta pasos ni elimina el destino real de la guía',()=>{
 const state=newGame(),progress=startTutorial(state),before=JSON.stringify({state,progress});
 const view=tutorialStep(state,progress),basic=guidedLesson(view,state),advanced=guidedLesson(view,state,'advanced');
 for(const lesson of [basic,advanced]){assert.equal(lesson.targetSelector,view.targetSelector);assert.equal(lesson.canAdvance,view.canAdvance);assert.equal(lesson.id,view.id);}
 assert.equal(basic.more.length,0);assert.ok(advanced.more.length>0);
 assert.match(basic.body,/Responder.*al momento/);
 assert.deepEqual(nextTutorial(progress,state),progress);
 assert.equal(JSON.stringify({state,progress}),before);assert.equal(guidedLesson(null,state),null);
});
test('las preferencias de nivel no escriben guardados ni pierden el nivel básico sin almacenamiento',()=>{
 const values=new Map([['la-campana-v085-slot-0','original']]),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 assert.equal(loadGuideLevel(storage),'basic');assert.equal(saveGuideLevel('advanced',storage),true);assert.equal(loadGuideLevel(storage),'advanced');
 assert.equal(saveGuideLevel('unknown',storage),false);assert.equal(values.get('la-campana-v085-slot-0'),'original');assert.equal(values.size,2);assert.equal(values.get(GUIDE_LEVEL_KEY),'advanced');
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
 assert.equal(loadGuideLevel(denied),'basic');assert.equal(saveGuideLevel('advanced',denied),false);
});
test('retomar en planificación no explica consecuencias que aún no han ocurrido',()=>{
 const state={...newGame(),phase:'planning',turn:2};
 for(const step of [2,3])for(const level of ['basic','advanced']){
  const view=tutorialStep(state,{enabled:true,completed:false,step});
  const lesson=guidedLesson(view,state,level);
  assert.equal(lesson.title,'Prepara tu jugada');assert.equal(lesson.body,view.body);
  assert.equal(lesson.targetSelector,'[data-tutorial-target="action"]');
 }
});
test('la ayuda se abre para las nueve ediciones y distingue sus reglas',()=>{
 for(const data of [legacyBundle,bundleV070,bundleV071,bundleV080,bundleV081,bundleV082,bundleV083,bundleV084,bundle]){
  const state=createGame(data,'guia-compatible',defaultSetup),guide=guideReference(state,data);
  const html=guideView(state,data,'advanced',renderHelpers);
  assert.ok(html.includes('Preparación'));assert.equal(guide.modern,['0.8.4','0.8.5'].includes(data.config.rulesVersion));
  assert.equal(guide.resources.find(r=>r.id==='budget').value,state.parties.P1.budget);
 }
 assert.equal(guideReference(null,bundle).actions[0].cost.energy,12);
});
