// Directed engine regressions, reached exclusively through legal commands.
// No injected resources/events and no promise of representative seat gains.
import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle} from './helpers.mjs';
import {bundleV084} from '../app/js/core/legacy/v084/bundle.mjs';
import {createGame,dispatch,getEventView,observe,validatePlan} from '../app/js/core/engine.mjs';
import {choosePlan} from '../app/js/ai/rivals.mjs';
import {countElection} from '../app/js/core/polls.mjs';
import {exportGame,importGame} from '../app/js/storage/save.mjs';

const setup={name:'Prueba de preparación',portrait:'portrait-1',profile:'conexion',staff:['S1','S4'],commitments:['T1','T2'],province:'09',difficulty:'iniciacion'};
const cases=[
 {event:'E17',option:'prepared_reply',alternative:'own_route',seed:'news-legal-2',turn:4,prepareTurn:3,cost:{budget:0,energy:8},oldDifference:-9,newDifference:11},
 {event:'E22',option:'prepared_position',alternative:'wait_for_details',seed:'press-8',turn:8,prepareTurn:1,extra:{profile:'coordinacion'},cost:{budget:1,energy:3},oldDifference:-11,newDifference:14},
 {event:'E34',option:'act',alternative:'save',seed:'discipline-follow-47',turn:7,prepareTurn:5,choices:{E05:'correct_publicly'},cost:{budget:2,energy:2},oldDifference:5,newDifference:10},
 {event:'E25',option:'first_commitment',alternative:'brief_answer',seed:'review-last-news-0',turn:10,prepareTurn:9,cost:{budget:0,energy:8},oldDifference:14,newDifference:14}
];
function send(s,type,extra={},b=bundle){
 const result=dispatch(s,{id:'prepared-news-'+(s.revision+1),expectedRevision:s.revision,type,...extra},b);
 assert.ok(result.ok,result.error?.message);return result.state;
}
const wait=s=>({candidate:{id:'rest',target:null},staff:Object.fromEntries(s.selectedStaff.filter(id=>!s.reservedStaff.includes(id)).map(id=>[id,{id:'wait',target:null}]))});
const free=view=>view.options.find(o=>o.availability.available&&!o.reserveStaff&&!o.availability.cost.budget&&!o.availability.cost.energy&&!o.availability.requiredReadiness);
function reach(c,b=bundle,{preparation=null,staff=setup.staff,candidate='rest'}={}){
 let s=createGame(b,c.seed,{...setup,...c.extra,staff}),remaining=preparation;
 while(s.turn<c.turn){
  if(s.phase==='event'){
   const view=getEventView(s,b),o=view.options.find(o=>o.id===c.choices?.[s.activeEvent]&&o.availability.available)??free(view);
   assert.ok(o,'A legal free response must remain available');s=send(s,'CHOOSE_OPTION',{optionId:o.id,staffId:null},b);
  }else if(s.phase==='planning'){
   const plan=wait(s);plan.candidate={id:candidate,target:candidate==='visit'?'09':null};
   if(preparation===null){if(s.turn===c.prepareTurn)plan.staff.S1={id:'prepare',target:null};}
   else if(remaining>0){
    for(const id of Object.keys(plan.staff))if(remaining>0){plan.staff[id]={id:'prepare',target:null};remaining--;}
   }
   assert.ok(validatePlan(s,plan,b).ok);s=send(s,'CONFIRM_PLAN',{plan},b);
  }else s=send(s,'CONTINUE',{},b);
 }
 assert.equal(s.activeEvent,c.event,c.event+' must be reached by the declared route');return s;
}
function strictReplay(s,b=bundle){
 const imported=importGame(exportGame(s,b),b);assert.ok(imported.ok,imported.error?.message);assert.deepEqual(imported.state,s);
}
const supportTotal=changes=>changes.filter(c=>c.stat==='support'&&c.target==='national').reduce((sum,c)=>sum+c.delta,0);
function branch(s,option,b=bundle,{candidate='interview',staffId=null}={}){
 const view=getEventView(s,b),o=view.options.find(o=>o.id===option);assert.ok(o.availability.available);
 const afterNews=send(s,'CHOOSE_OPTION',{optionId:option,staffId},b),news=afterNews.timeline.at(-1).changes;
 assert.equal(s.parties.P1.budget-afterNews.parties.P1.budget,o.availability.cost.budget);
 assert.equal(s.parties.P1.energy-afterNews.parties.P1.energy,o.availability.cost.energy);
 const rivalPlans=b.config.parties.filter(p=>p.id!=='P1').map(p=>({id:p.id,plan:choosePlan(observe(afterNews,p.id,b))}));
 const plan=wait(afterNews);plan.candidate={id:candidate,target:null};assert.ok(validatePlan(afterNews,plan,b).ok);
 const after=send(afterNews,'CONFIRM_PLAN',{plan},b),move=after.lastTransition.entries.find(e=>e.actorId==='candidate');
 const seats=countElection(after,b);assert.equal(Object.values(seats.national.seatsByParty).reduce((sum,n)=>sum+n,0),350);
 strictReplay(after,b);
 return {after,afterNews,news,move,rivalPlans,national:supportTotal(news)+supportTotal(move.changes)};
}
function weightDifference(a,b,scenario=bundle){return a.national-b.national+scenario.config.support.reputationWeight*(a.after.parties.P1.reputation-b.after.parties.P1.reputation);}

test('085: the four prepared news responses share a closed 45-point band, with their original costs and other effects',()=>{
 assert.equal(bundle.config.rulesVersion,'0.8.5');assert.equal(bundle.content.version,'0.8.5');
 const spenders=bundle.content.events.flatMap(e=>(e.options??[]).filter(o=>o.effects.some(x=>x.type==='stat'&&x.stat==='readiness'&&x.delta<0)).map(o=>e.id+'/'+o.id));
 assert.deepEqual(spenders.sort(),cases.map(c=>c.event+'/'+c.option).sort());
 for(const c of cases){
  const current=bundle.content.events.find(e=>e.id===c.event).options.find(o=>o.id===c.option);
  const old=bundleV084.content.events.find(e=>e.id===c.event).options.find(o=>o.id===c.option);
  assert.deepEqual(current.cost,c.cost);assert.deepEqual(current.cost,old.cost);
  assert.equal(current.effects.find(e=>e.type==='support'&&e.target==='national').delta,45);
  assert.deepEqual(current.effects.filter(e=>e.type!=='support'),old.effects.filter(e=>e.type!=='support'));
 }
 assert.deepEqual(bundle.content.events.find(e=>e.id==='E07'),bundleV084.content.events.find(e=>e.id==='E07'),'This adjustment must preserve the debate contract');
});

for(const c of cases)test('085: '+c.event+' competes with preserving the single ficha for the same Medios, against the frozen 084 contract',()=>{
 for(const b of [bundleV084,bundle]){
  const s=reach(c,b);assert.equal(s.parties.P1.readiness,1);assert.equal(s.parties.P1.repeatCounts.interview??0,0);strictReplay(s,b);
  const paid=branch(s,c.option,b),saved=branch(s,c.alternative,b);
  assert.deepEqual(paid.rivalPlans,saved.rivalPlans,'Attribution requires identical full rival plans');
  assert.equal(weightDifference(paid,saved,b),b===bundle?c.newDifference:c.oldDifference);
  assert.equal(paid.after.parties.P1.readiness,0);assert.equal(saved.after.parties.P1.readiness,0);
  assert.equal(paid.after.parties.P1.budget-saved.after.parties.P1.budget,0-c.cost.budget);
  assert.equal(paid.after.parties.P1.energy-saved.after.parties.P1.energy,0-c.cost.energy);
 }
});

test('085: zero, one, five and six fichas are reached legally, unavailable answers cannot consume a nonexistent ficha, and news always consumes exactly one',()=>{
 for(const c of cases)for(const preparation of [0,1,5,6]){
  const s=reach(c,bundle,{preparation});assert.equal(s.parties.P1.readiness,preparation,c.event+'/'+preparation);
  const o=getEventView(s,bundle).options.find(o=>o.id===c.option);assert.equal(o.availability.requiredReadiness,1);
  const before=JSON.stringify(s);
  if(!preparation){
   assert.equal(o.availability.available,false);
   const r=dispatch(s,{id:'missing-ficha-'+(s.revision+1),expectedRevision:s.revision,type:'CHOOSE_OPTION',optionId:c.option,staffId:null},bundle);
   assert.equal(r.ok,false);assert.equal(JSON.stringify(s),before);
   assert.ok(getEventView(s,bundle).options.find(o=>o.id===c.alternative).availability.available);
  }else{
   const after=send(s,'CHOOSE_OPTION',{optionId:c.option,staffId:null});assert.equal(after.parties.P1.readiness,preparation-1);
   assert.equal(s.parties.P1.budget-after.parties.P1.budget,c.cost.budget);assert.equal(s.parties.P1.energy-after.parties.P1.energy,c.cost.energy);
   const recorded=after.timeline.at(-1).changes.find(x=>x.stat==='support'&&x.target==='national');assert.equal(recorded.requested,45);assert.equal(recorded.delta,45);
   strictReplay(after);
  }
 }
});

test('085: preserving the ficha and local route remains a useful territorial choice when the agenda rests',()=>{
 const c=cases.find(c=>c.event==='E17'),s=reach(c),paid=branch(s,c.option,bundle,{candidate:'rest'}),saved=branch(s,c.alternative,bundle,{candidate:'rest'});
 assert.equal(paid.after.parties.P1.readiness,0);assert.equal(saved.after.parties.P1.readiness,1);
 assert.equal(paid.after.parties.P1.campaignDelta['09']-saved.after.parties.P1.campaignDelta['09'],-30,'National reach is traded against 80 local reach');
 assert.equal(paid.afterNews.parties.P1.energy-saved.afterNews.parties.P1.energy,-8);
 assert.equal(paid.after.parties.P1.energy,100);assert.equal(saved.after.parties.P1.energy,100,'Rest can absorb that energy cost at the ceiling');
 assert.equal(saved.after.parties.P1.cohesion,paid.after.parties.P1.cohesion+1);
});

test('085: Ada can cover the last interview without a ficha, reserving her task while preparing the same-turn Medios',()=>{
 const c=cases.find(c=>c.event==='E25'),s=reach(c,bundle,{preparation:0,staff:['S1','S3']});assert.equal(s.parties.P1.readiness,0);
 assert.equal(getEventView(s,bundle).options.find(o=>o.id===c.option).availability.available,false);
 const result=branch(s,'ada_last_interview',bundle,{staffId:'S3'});
 assert.equal(result.afterNews.parties.P1.readiness,1);assert.ok(result.afterNews.reservedStaff.includes('S3'));
 assert.equal(result.after.parties.P1.readiness,0);assert.ok(result.move.changes.some(c=>c.stat==='readiness'&&c.delta===-1));
 assert.equal(result.afterNews.parties.P1.budget,s.parties.P1.budget-3);assert.equal(result.afterNews.parties.P1.energy,s.parties.P1.energy-2);
 assert.ok(result.move.changes.find(c=>c.stat==='support').requested>=100,'The delegated ficha is usable in the same turn');
});

test('085: legal saturated provinces still cap the prepared news, consume its ficha and preserve positive reach elsewhere',()=>{
 let s;
 for(let i=0;i<24&&!s;i++){
  const c={event:'E25',seed:'prepared-saturation-'+i,turn:10,prepareTurn:9};
  // An event is drawn from a seeded deck: inspect legal play, never replace it.
  let candidateState;
  try{candidateState=reach(c,bundle,{candidate:'visit'});}catch(error){if(!String(error.message).includes('must be reached'))throw error;continue;}
  if(candidateState.parties.P1.campaignDelta['09']===bundle.config.support.campaignDeltaMax&&candidateState.parties.P1.readiness===1)s=candidateState;
 }
 assert.ok(s,'The bounded seeded search must provide a legal saturated E25');
 const before=JSON.stringify(s),after=send(s,'CHOOSE_OPTION',{optionId:'first_commitment',staffId:null});
 assert.equal(JSON.stringify(s),before);assert.equal(after.parties.P1.campaignDelta['09'],s.parties.P1.campaignDelta['09']);
 assert.equal(after.parties.P1.readiness,0);assert.equal(s.parties.P1.energy-after.parties.P1.energy,8);
 const support=after.timeline.at(-1).changes.find(c=>c.stat==='support');assert.equal(support.requested,45);assert.ok(support.delta>0&&support.delta<45);
 assert.ok(Object.keys(s.parties.P1.campaignDelta).some(id=>after.parties.P1.campaignDelta[id]>s.parties.P1.campaignDelta[id]));
 strictReplay(after);
});
