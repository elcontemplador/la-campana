import test from 'node:test';
import assert from 'node:assert/strict';
import {debatePreparationText,debateChoiceIntent} from '../app/js/ui/debate-preparation.mjs';
import {debateScene} from '../app/js/ui/debate.mjs';
import {eventConsequences} from '../app/js/ui/stories.mjs';
import {getEventView, createGame} from '../app/js/core/engine.mjs';
import {legacyBundle} from '../app/js/core/bundles.mjs';
import {bundle, defaultSetup, command, freePlan} from './helpers.mjs';

function opening(source, rehearsals=2) {
  let s=createGame(source,'preparacion-visible',{...defaultSetup,staff:['S1','S3'],difficulty:'iniciacion'});
  while(s.turn<6) {
    while(s.phase==='event') {
      const o=getEventView(s,source).options.find(o=>o.availability.available&&!o.reserveStaff&&!o.availability.cost.budget&&!o.availability.cost.energy);
      s=command(s,'CHOOSE_OPTION',{optionId:o.id},source);
    }
    const p=freePlan(s);
    if(s.turn>=6-rehearsals) {
      const free=s.selectedStaff.filter(id=>!s.reservedStaff.includes(id));
      for(const id of rehearsals>=4?free:free.slice(0,1))p.staff[id]={id:'prepare',target:null};
    }
    s=command(command(s,'CONFIRM_PLAN',{plan:p},source),'CONTINUE',{},source);
  }
  return s;
}
const option=(s,id,source)=>getEventView(s,source).options.find(o=>o.id===id);

test('preparación visible coincide con cada respuesta real y no modifica la partida, actual y anterior',()=>{
  for(const source of [bundle,legacyBundle]) {
    const s=opening(source),before=JSON.stringify(s),amount=s.parties.P1.readiness;
    const full=option(s,'full_opening',source),brief=option(s,'brief_opening',source),ada=option(s,'ada_outline',source);
    const spent=command(s,'CHOOSE_OPTION',{optionId:full.id},source);
    assert.equal(debatePreparationText(full,s,bundle),`Usa ${amount-spent.parties.P1.readiness} ficha · quedan ${spent.parties.P1.readiness}`);
    assert.equal(debatePreparationText(brief,s,bundle),`Conservas ${amount} fichas`);
    const rehearsed=command(s,'CHOOSE_OPTION',{optionId:ada.id,staffId:ada.availability.staffChoices[0]?.id||ada.availability.staffChoices[0]},source);
    assert.equal(debatePreparationText(ada,s,bundle),`Preparación +${rehearsed.parties.P1.readiness-amount} · tendrás ${rehearsed.parties.P1.readiness}`);
    assert.equal(JSON.stringify(s),before);
  }
});

test('sin fichas muestra requisito; preparación saturada no promete un incremento',()=>{
  for(const source of [bundle,legacyBundle]) {
    const empty=opening(source,0),full=option(empty,'full_opening',source);
    assert.equal(full.availability.available,false);
    assert.equal(debatePreparationText(full,empty,bundle),'Necesita 1 ficha; tienes 0');
    const saturated=opening(source,4),ada=option(saturated,'ada_outline',source);
    assert.equal(saturated.parties.P1.readiness,source.config.resources.readiness.max);
    assert.match(debatePreparationText(ada,saturated,bundle),/^Preparación al máximo \(6\); el ensayo no añade fichas$/);
    const intent=debateChoiceIntent(ada,saturated,bundle,debateScene(saturated,bundle).optionIntents.ada_outline);
    assert.doesNotMatch(intent,/añade preparación/);
    assert.match(intent,/sin añadir fichas.*ocupa su tarea/);
    const after=command(saturated,'CHOOSE_OPTION',{optionId:ada.id,staffId:ada.availability.staffChoices[0]?.id||ada.availability.staffChoices[0]},source);
    assert.equal(after.parties.P1.readiness,saturated.parties.P1.readiness);
  }
});

test('separar preparación mantiene los demás efectos y la descripción original de noticias',()=>{
  for(const source of [bundle,legacyBundle]) {
    let s=opening(source),full=option(s,'full_opening',source);
    const original=eventConsequences(full,s,bundle),separate=eventConsequences(full,s,bundle,{omitPreparation:true});
    assert.match(original,/Preparación/);
    assert.doesNotMatch(separate,/Preparación/);
    assert.equal(separate,original.split(' · ').filter(x=>!/^Preparación(?:\s|:)/.test(x)).join(' · '));
    s=command(s,'CHOOSE_OPTION',{optionId:'full_opening'},source);
    const comparison=option(s,'compare_programmes',source);
    assert.match(eventConsequences(comparison,s,bundle,{omitPreparation:true}),/alcance/);
    assert.equal(debatePreparationText(comparison,s,bundle),`Usa 1 ficha · quedan ${s.parties.P1.readiness-1}`);
  }
});

test('abrir diálogo expresa propósito aunque las dos relaciones ya estén al máximo',()=>{
  for(const source of [bundle,legacyBundle]) {
    let s=opening(source);
    s=command(command(s,'CHOOSE_OPTION',{optionId:'brief_opening'},source),'CHOOSE_OPTION',{optionId:'acknowledge_limit'},source);
    const o=option(s,'open_dialogue',source),fixture=structuredClone(s);
    for(const e of o.effects.filter(e=>e.type==='relation'))fixture.parties.P1.relations[e.target]=source.config.resources.relation.max;
    const intent=debateChoiceIntent(o,fixture,bundle,debateScene(fixture,bundle).optionIntents[o.id]);
    assert.match(intent,/para buscar acuerdos con dos partidos/);
    assert.doesNotMatch(intent,/acercas dos interlocutores/);
    assert.match(eventConsequences(o,fixture,bundle),/sin cambio \(máximo/);
    assert.equal(debateChoiceIntent(o,s,bundle,debateScene(s,bundle).optionIntents[o.id]),intent);
  }
});

test('las intenciones no prometen reputación o cohesión saturadas ni enfriar una relación mínima',()=>{
  const s=opening(bundle),fixture=structuredClone(s);
  fixture.parties.P1.reputation=bundle.config.resources.reputation.max;
  fixture.parties.P1.cohesion=bundle.config.resources.cohesion.max;
  fixture.parties.P1.relations.P2=bundle.config.resources.relation.min;
  assert.equal(debateChoiceIntent({id:'separate_claims'},fixture,bundle,'ganas reputación y alcance'),'reputación al máximo y más alcance');
  assert.match(debateChoiceIntent({id:'acknowledge_limit'},fixture,bundle,'Ganas reputación y conservas recursos'),/está al máximo/);
  assert.match(debateChoiceIntent({id:'reaffirm'},fixture,bundle,'refuerzas alcance y cohesión'),/cohesión ya está al máximo/);
  assert.match(debateChoiceIntent({id:'compare_programmes',effects:[{type:'relation',target:'P2',delta:-1}]},fixture,bundle,'más alcance, pero enfrías la relación con tu rival'),/ya está en el mínimo/);
  assert.equal(debateChoiceIntent({id:'brief_opening'},fixture,bundle,'Conservas energía y preparación'), 'Conservas energía y preparación');
});
