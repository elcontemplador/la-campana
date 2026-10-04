import {campaignIssue} from './issue-cases.mjs';
import {publicEncounterMemory} from './public-encounters.mjs';

export const PARTY_CALL_TARGETS=Object.freeze({E29:'P3',E32:'P4',E35:'P3',E38:'P4'});
const subjects={alquiler:'el alquiler de Lucía',turismo:'los pisos turísticos',
 'vivienda-plazos':'los permisos de obra','sanidad-espera':'la consulta de Carmen',
 'escuela-infantil':'la plaza infantil',cuidados:'la ayuda a Andrés',autonomos:'el taller de Marta',
 'primer-empleo':'el primer empleo de Dani',energia:'la luz de la fábrica',
 financiacion:'el dinero para los servicios','transporte-rural':'el autobús del pueblo',agua:'el reparto del agua'};

// A call is a recorded choice, including at the relation cap. A meeting, a
// positive relation change or an unconfirmed future entry is not a prior call.
export function previousPartyCall(state,bundle,target,beforeTurn){
 const entries=(state.timeline||[]).filter(e=>e.turn<beforeTurn);
 return entries.findLast(e=>{
  if(e.kind!=='event'||PARTY_CALL_TARGETS[e.eventId]!==target
   ||!Number.isInteger(e.turn)||e.turn>=beforeTurn||typeof e.id!=='string'||!e.id
   ||entries.filter(x=>x.id===e.id).length!==1||!['act','save'].includes(e.optionId))return false;
  const event=bundle.content.events.find(x=>x.id===e.eventId&&x.turn===e.turn);
  const option=event?.options?.find(x=>x.id===e.optionId);
  return option&&event.options.some(x=>x.id==='act'&&x.effects.some(c=>c.type==='relation'&&c.target===target));
 })||null;
}

// Keep the existing case/topic selection: rewriting a conversation must not
// retrospectively give an old decision another policy. Read public programmes.
export function partyCallStory(state,bundle,eventId,turn){
 const target=PARTY_CALL_TARGETS[eventId];
 if(!target||!['0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)||state.contentVersion!==bundle.content.version)return null;
 const past=(state.timeline||[]).filter(e=>e.turn<turn);
 const provinceId=past.findLast(e=>e.kind==='plan'&&e.actorId==='candidate'&&e.actionId==='visit')?.target||state.initialSetup.province;
 const partner=bundle.config.parties.find(p=>p.id===target);
 const ordered=[...state.commitments,...bundle.config.topics.map(t=>t.id)].filter((t,i,all)=>all.indexOf(t)===i);
 const different=ordered.find(t=>state.parties.P1.positions[t]!==partner.positions[t]);
 const shared=ordered.find(t=>state.parties.P1.positions[t]===partner.positions[t]);
 const own=campaignIssue(state,bundle,{topicId:different||shared||state.commitments[0],sceneKey:eventId,provinceId});
 const other=campaignIssue(state,bundle,{topicId:own.topicId,sceneKey:eventId,caseId:own.id,provinceId,partyId:target});
 const prior=previousPartyCall(state,bundle,target,turn);
 const memory=prior?(prior.optionId==='act'?`Hablasteis en el turno ${prior.turn}.`:`Aplazaste la conversación en el turno ${prior.turn}.`):'';
 const contexts={
  E29:{title:'Tu rival te invita a un café',hook:'Después del acto, un rival te pide diez minutos sin micrófonos.',
   ask:'¿Nos sentamos a hablar?',verb:'Hablemos',save:'Hoy sigo con mi campaña. Ese café tendrá que esperar.'},
  E32:{title:'Os veréis en el debate. ¿Y antes?',hook:'Tu rival llama antes del debate. Quiere discutir una propuesta que los dos tendréis que explicar ante las cámaras.',
   ask:'¿Lo hablamos antes del debate?',verb:'Hablemos antes del debate',save:'Hoy voy a preparar mi intervención. No voy a pagar otra reunión.'},
  E35:{title:prior?'El rival vuelve a llamar':'Un café, sin cámaras',hook:'Queda poco para las urnas. Tu rival propone una reunión: los fotógrafos se quedan fuera.',
   ask:'¿Hablamos hoy, sin cámaras?',verb:prior?.optionId==='act'?'Retomemos la conversación':'Hablemos',save:'Hoy sigo con mi campaña. No voy a esa reunión.'},
  E38:{title:'¿Te sentarías conmigo después de las urnas?',hook:'El rival quiere saber si hablarías con su partido después de las elecciones. Te pide una conversación hoy; todavía compite contra ti.',
   ask:'¿Hablamos hoy de lo que nos separa?',verb:'Hablemos hoy',save:'Primero terminaré mi campaña. Hoy me concentro en el cierre.'},
 };
 const context=contexts[eventId];
 const programmes=different?`Tu propuesta: ${own.brief}. Su programa: ${other.brief}.`:`Coincidís en esta propuesta: ${own.brief}.`;
 const encounter=publicEncounterMemory(state,bundle,target,turn);
 const baseRequest=different?`Nosotros proponemos ${other.brief}. ${context.ask}`:`También proponemos ${other.brief}. ${context.ask}`;
 const request=encounter?`${encounter.text} ${baseRequest}`:baseRequest;
 const speech=different?`${context.verb}. Yo sigo proponiendo ${own.brief}. Quiero saber: ${other.objection}`
  :`${context.verb}. Coincidimos en ${own.brief}. Pero falta una respuesta: ${own.objection}`;
 return {eventId,turn,provinceId,format:'politics',icon:'mediate',title:context.title,
  shortBody:`${own.shortSituation} ¿Hablas con el rival o guardas la caja?`,
  body:`${memory?memory+' ':''}${context.hook} ${own.situation} ${programmes} ${own.humour} Mantienes tu programa. La reunión cuesta 2 de caja. Puedes aplazarla y continuar con tu campaña. Los pactos se negocian después del recuento.`,
  optionLabels:{act:`Hablar con ${partner.name}`,save:'Aplazar y seguir mi campaña'},
  optionSpeeches:{act:speech,save:context.save},
  optionIntents:{act:'Hablas de un problema concreto sin ceder tu programa. Buscas acercar la relación; gastas 2 de caja.',save:'No pagas la reunión; la relación no avanza con esta llamada.'},
  antecedent:prior?{entryId:prior.id,turn:prior.turn,label:`${prior.optionId==='act'?'Hablaste con':'Aplazaste la llamada de'} ${partner.name} · turno ${prior.turn}`} :null,
  speaker:{kind:'party',id:target,name:partner.name,role:'Te llama desde la campaña rival'},
  publicProposal:{partyId:target,proposal:other.brief,agreement:!different,request},
  issueId:own.id,topicId:own.topicId,call:{target,subject:subjects[own.id],issueTitle:own.title,ownProposal:own.brief,request,previousChoice:prior?.optionId||null,...(encounter?{previousEncounter:encounter}:{})},
 };
}
