import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundle,newGame,defaultSetup} from './helpers.mjs';
import {createGame} from '../app/js/core/engine.mjs';
import {resolveCampaignBundle} from '../app/js/core/campaign.mjs';
import {getNegotiationPreview} from '../app/js/core/negotiation.mjs';
import {suggestPactOffers} from '../app/js/ui/play.mjs';
import {pactDecision} from '../app/js/ui/pact-decision.mjs';

// Directed count/relationship boundaries for presentation, not exported replays.
function boundary({source=bundle,proponent='P1',ballot=1,stage='vote',seats={P1:180,P2:170,P3:0,P4:0,R1:0,R2:0}}={}){
  const s=source===bundle?newGame('pact-ui-boundary'):createGame(source,'pact-ui-legacy',defaultSetup);
  s.phase='negotiation';s.electionResult={national:{seatsByParty:{...seats}}};
  for(const p of Object.values(s.parties))for(const id of Object.keys(p.relations))p.relations[id]=0;
  s.negotiation={proponent,proponents:[proponent],index:0,ballot,stage,offer:[2,2,1,1],history:[],exchanges:[]};
  return s;
}
function view(s,source=bundle,ui={offer:[2,2,1,1],vote:'no',folds:{}}){
  const effective=resolveCampaignBundle(source,s),party=id=>effective.config.parties.find(p=>p.id===id);
  const empty=()=>'',esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const h={esc,fmt:String,party,partyBadge:empty,phaseHeading:(...parts)=>parts.join(' '),programmeView:empty,
    pactPartyView:empty,previewBody:empty,voteHemicycleView:empty,counterofferView:empty,proposalOrderView:empty,dialogueBridgeView:empty};
  return pactDecision({state:s,sourceBundle:source,bundle:effective,ui,h});
}

test('segunda votación aplica mayoría simple y no promete una primera ya pasada',()=>{
  const win=boundary({ballot:2});
  assert.match(view(win),/Puede ganar esta votación/);
  assert.doesNotMatch(view(win),/Puede ganar en primera|Puede ganar en segunda/);
  const tie=boundary({ballot:2,seats:{P1:175,P2:175,P3:0,P4:0,R1:0,R2:0}});
  assert.match(view(tie),/Todavía faltan apoyos/);
  assert.doesNotMatch(view(tie),/Puede ganar/);
});

test('los síes propios de un proponente ajeno no se atribuyen al jugador que vota no',()=>{
  const s=boundary({proponent:'P2',seats:{P1:170,P2:180,P3:0,P4:0,R1:0,R2:0}});
  const preview=getNegotiationPreview(s,bundle,s.negotiation.offer,'no');
  assert.equal(preview.votes.P1,'no');assert.equal(preview.totals.yes,180);
  const party=resolveCampaignBundle(bundle,s).config.parties.find(p=>p.id==='P2');
  assert.ok(view(s).includes(`${party.name} sostiene los síes.`));
  assert.doesNotMatch(view(s),/Tu candidatura sostiene los síes/);
});

test('vías con idénticos votos y renuncias no se multiplican ni prometen más apoyos',()=>{
  const s=boundary({stage:'offer'}),suggested=suggestPactOffers(s,bundle),html=view(s);
  const signature=item=>[item.yes,item.no,item.abstain,...bundle.config.topics.map((t,i)=>s.commitments.includes(t.id)&&item.offer[i]<bundle.config.negotiation.commitmentMinUnits?t.id:'')].join(':');
  const shown=suggested.filter(item=>html.includes(`data-offer-choice="${item.id}"`));
  assert.equal(shown.length,new Set(suggested.map(signature)).size);
  assert.equal(shown.length,new Set(shown.map(signature)).size);
  for(const item of shown){
    const same=suggested.some(other=>other.id!==item.id&&other.yes===item.yes&&other.no===item.no&&other.abstain===item.abstain);
    if(item.label==='Buscar más apoyos'&&same)assert.doesNotMatch(html,/Buscar más apoyos/);
  }
});

test('una investidura rival requiere elegir voto antes de confirmarlo',()=>{
  for(const ballot of [1,2]){
    const state=boundary({proponent:'P2',ballot});
    const ui={offer:[2,2,1,1],vote:null,folds:{}};
    const initial=view(state,bundle,ui);
    assert.match(initial,/data-act="vote"[^>]*disabled/);
    assert.doesNotMatch(initial,/data-vote="[^"]+" aria-pressed="true"/);
    for(const vote of ['yes','no','abstain']){
      const chosen=view(state,bundle,{...ui,vote});
      assert.ok(chosen.includes(`data-vote="${vote}" aria-pressed="true"`));
      assert.doesNotMatch(chosen,/data-act="vote"[^>]*disabled/);
    }
  }
});

test('legado v061 conserva votación y omite revisión mecánica de las 48 horas',()=>{
  const read=name=>JSON.parse(readFileSync(new URL('../data/legacy/v061/'+name,import.meta.url),'utf8'));
  const source={config:read('game_config.json'),provinces:bundle.provinces,content:read('events.json')};
  const s=boundary({source,ballot:2}),html=view(s,source);
  assert.match(html,/Celebrar segunda votación/);
  assert.match(html,/Puede ganar esta votación/);
  assert.doesNotMatch(html,/revisar una prioridad|data-revision-choice|confirm-revision/);
});

test('presentar pactos no registra votos ni modifica relaciones, recursos o programa',()=>{
  for(const proponent of ['P1','P2']){
    const s=boundary({proponent,ballot:2}),before=structuredClone(s);
    view(s);assert.deepEqual(s,before);
  }
});

test('los tres votos exponen sus propios balances antes de confirmar todos los escaños',()=>{
  const s=boundary({proponent:'P2',seats:{P1:100,P2:159,P3:91,P4:0,R1:0,R2:0}}),html=view(s);
  assert.match(html,/decides tus 100 escaños/);
  for(const vote of ['yes','no','abstain']) {
    const p=getNegotiationPreview(s,bundle,null,vote),card=html.match(new RegExp(`<button[^>]*data-vote="${vote}"[\\s\\S]*?<\\/button>`))[0];
    assert.ok(card.includes(`${p.totals.yes} síes · ${p.totals.no} noes`));
    assert.ok(card.includes(`${p.totals.abstain} abstenciones`));
  }
  assert.match(html,/Puedes cambiar de voto antes de confirmarlo/);
  assert.equal((html.match(/data-act="vote"/g)||[]).length,1);
});

test('comparar una revisión conserva el acuerdo vigente y distingue mejora de mayoría',()=>{
  const s=boundary({ballot:2,seats:{P1:100,P2:91,P3:69,P4:30,R1:30,R2:30}});
  s.negotiation.offer=[1,3,1,1]; // A legal one-unit revision can restore housing.
  const html=view(s);
  assert.match(html,/acuerdo actual → tras revisar/);
  assert.match(html,/Elegir una tarjeta todavía no cambia el acuerdo/);
  assert.match(html,/class="revision-votes">Síes \d+ → \d+ · Noes \d+ → \d+/);
});
