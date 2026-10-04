import {resolveCampaignBundle} from '../core/campaign.mjs';
import {campaignIssue} from './issue-cases.mjs';
import {disciplineProgrammeBrief} from './party-discipline.mjs';

const options={E14:['private_venue','shared_slot','small_format'],E23:['shared_table','own_act','written_greeting']};
const ownEntry=e=>e&&(!e.partyId||e.partyId==='P1')&&e.kind==='event'&&typeof e.id==='string'&&e.id;

// Public programmes, one fictional case, and the recorded/current event only.
// Sharing an event does not sign an agreement or change a position.
export function publicEncounter(state,sourceBundle,eventId,turn=state?.turn){
 if(!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion)||!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)||!options[eventId]
  ||!Number.isSafeInteger(turn)||turn<1||turn>state.turn)return null;
 let bundle;try{bundle=resolveCampaignBundle(sourceBundle,state);}catch{return null;}
 const event=bundle.content.events.find(e=>e.id===eventId&&e.turn===turn);
 if(!event||event.options?.length!==3||!options[eventId].every(id=>event.options.some(o=>o.id===id)))return null;
 const entry=(state.timeline||[]).find(e=>ownEntry(e)&&e.eventId===eventId&&e.turn===turn&&options[eventId].includes(e.optionId));
 if(!(state.phase==='event'&&state.activeEvent===eventId&&state.turn===turn)&&!entry)return null;
 const local=(entry?.changes||[]).find(c=>c.stat==='support'&&bundle.provinces.districts.some(p=>p.id===c.target));
 const visit=(state.timeline||[]).findLast(e=>(!e.partyId||e.partyId==='P1')&&e.kind==='plan'&&e.actorId==='candidate'&&e.actionId==='visit'&&Number.isSafeInteger(e.turn)&&e.turn>0&&e.turn<turn);
 const provinceId=local?.target||visit?.target||state.initialSetup?.province,place=bundle.provinces.districts.find(p=>p.id===provinceId)?.name;
 const topicId=state.initialSetup?.commitments?.[0]||state.commitments?.[0];
 if(!place||!bundle.config.topics.some(t=>t.id===topicId))return null;
 const own=campaignIssue(state,bundle,{topicId,sceneKey:eventId,provinceId});if(!own)return null;
 const name=id=>bundle.config.parties.find(p=>p.id===id)?.name;
 const rivalIds=eventId==='E14'?['P2']:['P2','P3'];
 const programmes=rivalIds.map(partyId=>{
  const partner=bundle.config.parties.find(p=>p.id===partyId);
  const other=campaignIssue(state,bundle,{topicId,sceneKey:eventId,provinceId,caseId:own.id,partyId});
  return other&&partner?{partyId,name:partner.name,proposal:disciplineProgrammeBrief(own.id,partner.positions[topicId],other.brief),agrees:partner.positions[topicId]===state.parties.P1.positions[topicId]}:null;
 });
 if(programmes.some(p=>!p)||!name('P1')||(eventId==='E23'&&!name('P4')))return null;
 const ownProposal=disciplineProgrammeBrief(own.id,state.parties.P1.positions[topicId],own.brief);
 const messages=[{label:`Tu propuesta · ${name('P1')}`,text:ownProposal,partyId:'P1'},
  ...programmes.map(p=>({label:p.name,text:p.proposal,partyId:p.partyId}))];
 const result={eventId,turn,provinceId,format:'politics',icon:'mediate',issueId:own.id,topicId,messages,
  antecedent:null,encounter:{caseId:own.id,issueTitle:own.title,provinceId,ownProposal,programmes,entryId:entry?.id||null}};
 if(eventId==='E14'){
  const partner=programmes[0];
  return {...result,title:'El rival te ofrece compartir el acto',
   shortBody:`${own.shortSituation} ${partner.name} te ofrece compartir acto. ¿Aceptas?`,
   body:`${own.situation} En el polideportivo de ${place} solo queda un horario gratuito si compartís el acto. ${partner.agrees?'Coincidís en esta propuesta, pero cada partido quiere hacerse ver.':'Vais a defender propuestas distintas ante las mismas personas.'} Cada candidatura tendrá su micrófono y su cartel. Puedes compartir ese horario, pagar otro local o hacer un encuentro pequeño con tu equipo.`,
   speaker:{kind:'party',id:'P2',name:partner.name,role:'Te ofrece el horario compartido'},
   optionLabels:{private_venue:'Pagar un acto con nuestro cartel',shared_slot:`Compartir acto con ${partner.name}`,small_format:'Hacer un encuentro pequeño'},
   optionSpeeches:{private_venue:`${own.reply} Quiero explicarlo en un acto de nuestra campaña.`,
    shared_slot:partner.agrees?`Coincidimos en ${ownProposal}. Compartamos el acto; cada partido explicará su propuesta.`:`Compartamos el acto. Yo defenderé ${ownProposal}; vosotros podréis defender vuestra propuesta.`,
    small_format:'Hoy nos reunimos con el equipo en pequeño. Guardemos la caja para el resto de la campaña.'},
   optionIntents:{private_venue:`Buscas más presencia y voluntarios en ${place}. Pagas el local; esta opción no acerca la relación con el rival.`,
    shared_slot:'Ahorras el alquiler y acercas la relación. El impulso local es menor que con tu acto propio; gastas más energía.',
    small_format:'Conservas recursos y unes al equipo. Tu campaña pierde parte del alcance local previsto.'},
   optionDetails:{private_venue:'Tu programa se mantiene. Pagas otro espacio y buscas más presencia propia; después eliges tu jugada en el mapa.',shared_slot:'Compartir acto no significa apoyar el programa rival ni prometer un pacto. Mantienes tu propuesta.',small_format:'La reunión pequeña sustituye al acto previsto. No cambia tu programa ni cierra futuras conversaciones.'}};
 }
 const host=name('P4'),first=programmes[0],second=programmes[1];
 return {...result,title:'¿Sales en la foto con tus rivales?',
  shortBody:`${own.shortSituation} Te invitan a una mesa con tus rivales. ¿Vas o haces tu propio acto?`,
  body:`${own.situation} ${host} organiza una mesa y os invita a ti, a ${first.name} y a ${second.name}. Cada candidatura responderá con su programa; después habrá una foto conjunta. Puedes ir, dedicar el día a tu acto en ${place} o enviar un saludo a quien organiza. La foto no compromete tus apoyos después de las urnas.`,
  speaker:{kind:'party',id:'P4',name:host,role:'Organiza la mesa y recogerá tu saludo'},
  optionLabels:{shared_table:'Ir a la mesa y explicar mi propuesta',own_act:`Hacer mi propio acto en ${place}`,written_greeting:`Enviar un saludo a ${host}`},
  optionSpeeches:{shared_table:`Voy a la mesa. Yo sigo proponiendo ${ownProposal}. Hablemos también de lo que nos separa.`,
   own_act:`${own.reply} Hoy hago el acto de nuestra campaña.`,written_greeting:`Enviad mi saludo a ${host}. Hoy mantengo la agenda de mi campaña.`},
  optionIntents:{shared_table:`Acercas la relación con ${first.name} y ${second.name} y ganas algo de alcance nacional. Gastas energía.`,
   own_act:`Concentras tu presencia en ${place}, pero te alejas de ${first.name}. Gastas caja y energía.`,
   written_greeting:`Guardas recursos y acercas la relación con ${host}. No participas en la mesa ni sumas el alcance de la foto.`},
  optionDetails:{shared_table:'Cada partido conserva su programa. El encuentro acerca relaciones con las dos candidaturas invitadas; no garantiza sus apoyos.',own_act:`Tu acto busca más presencia local. ${first.name} interpreta la ausencia como distancia para hablar después.`,written_greeting:`El saludo lo recoge ${host}, que organiza. No sustituye la conversación con los otros dos invitados.`}};
}

// An organiser can recall attendance or a greeting, never private preparation.
export function publicEncounterMemory(state,sourceBundle,target,beforeTurn){
 if(!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state?.contentVersion)||target!=='P4'||!Number.isSafeInteger(beforeTurn)||beforeTurn>state.turn)return null;
 const entry=(state.timeline||[]).findLast(e=>ownEntry(e)&&e.eventId==='E23'&&Number.isSafeInteger(e.turn)&&e.turn>0&&e.turn<beforeTurn&&options.E23.includes(e.optionId));
 const scene=entry?publicEncounter(state,sourceBundle,'E23',entry.turn):null;
 if(!scene||scene.encounter.entryId!==entry.id)return null;
 const text=entry.optionId==='shared_table'?`Coincidimos en la mesa del turno ${entry.turn}.`
  :entry.optionId==='own_act'?`No viniste a la mesa del turno ${entry.turn}.`
  :`Recibí vuestro saludo para la mesa del turno ${entry.turn}.`;
 return {entryId:entry.id,turn:entry.turn,optionId:entry.optionId,text};
}
