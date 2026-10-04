import {campaignIssue} from './issue-cases.mjs';
import {launchStory} from './launch-story.mjs';

// Materials for volunteers or an intervention: existing catalogue choices only.
export function campaignTeamScene(state,bundle,eventId,turn=state?.turn){
 const expected={E27:3,E30:5}[eventId];
 if(!['0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion)||!['0.8.3','0.8.4','0.8.5'].includes(state?.contentVersion)||turn!==expected||turn>state.turn)return null;
 const own=e=>!e.partyId||e.partyId==='P1';
 const district=id=>bundle.provinces.districts.find(d=>d.id===id);
 const confirmed=(state.timeline||[]).filter(e=>e?.kind==='event'&&own(e)&&e.eventId===eventId&&e.turn===turn);
 const current=state.phase==='event'&&state.activeEvent===eventId&&state.turn===turn;
 if(!current&&confirmed.length!==1)return null;
 const past=(state.timeline||[]).filter(e=>e&&own(e)&&Number.isSafeInteger(e.turn)&&e.turn>0&&e.turn<turn
  &&typeof e.id==='string'&&['event','plan'].includes(e.kind));
 const visit=past.findLast(e=>e.kind==='plan'&&e.actorId==='candidate'&&e.actionId==='visit'&&district(e.target));
 const recorded=confirmed[0]?.optionId==='act'?confirmed[0].changes?.find(c=>c.stat==='organization'&&district(c.target)):null;
 const provinceId=recorded?.target||visit?.target||state.initialSetup?.province;
 const place=district(provinceId)?.name;
 const priority=state.commitments?.find(id=>bundle.config.topics.some(t=>t.id===id));
 const launch=launchStory(state,bundle)?.confirmed;
 const issue=(eventId==='E30'?launch?.issue:null)||campaignIssue(state,bundle,{topicId:priority,sceneKey:eventId==='E30'?'debate':eventId,provinceId});
 if(!issue||!place)return null;
 const localWork=past.findLast(e=>e.changes?.some(c=>c.stat==='organization'&&c.target===provinceId&&c.delta>0));
 const previous=past.findLast(e=>e.kind==='event'&&e.eventId==='E27'&&['act','take_airtime','save'].includes(e.optionId));
 const left=bundle.config.turns-turn+1;
 const localMemory=localWork?`Ya dejaste voluntarios en ${place}, en el turno ${localWork.turn}. `:'';
 const previousMemory=!localWork&&previous?previous.optionId==='take_airtime'
  ?`En el turno ${previous.turn} elegiste hablar por radio. `:previous.optionId==='save'?`En el turno ${previous.turn} guardaste la caja. `:'' :'';
 const ref=localWork||previous||visit;
 const label=localWork?`Voluntarios en ${place}`:previous?previous.optionId==='take_airtime'?'Tu intervención en radio':previous.optionId==='save'?'Reservaste la caja':'Tu decisión local':`Tu visita a ${place}`;
 const result={eventId,turn,provinceId,issueId:issue.id,format:'team',icon:'organize',title:issue.title,
  body:'',shortBody:'',optionLabels:{},optionSpeeches:{},optionIntents:{},
  antecedent:ref?{entryId:ref.id,turn:ref.turn,label:`${label} · turno ${ref.turn}`}:null,
  teamChoice:{topicId:issue.topicId,proposal:issue.brief,caseId:issue.id,remainingClosings:left,
   previousOption:previous?.optionId||null,preparesDebate:eventId==='E30'}};
 const short=question=>{
  const text=`${issue.shortSituation} ${question}`;
  return text.length<=180?text:`${issue.title}. ${question}`;
 };
 const materials=localWork?'Dar más material a los voluntarios':'Dejar material y un equipo local';
 const materialSpeech=`Dejad nuestra propuesta por escrito: ${issue.brief}. Que puedan preguntar aunque yo siga de campaña.`;
 if(eventId==='E27'){
  result.shortBody=short(`¿Dejas un equipo en ${place}, respondes por radio o guardas la caja?`);
  result.body=`${issue.situation} ${localMemory}Los voluntarios de ${place} piden material para explicar tu propuesta. Lola te ofrece responder por radio a todo el país. Puedes apostar por el trabajo local de los ${left} cierres que quedan, incluido el de hoy, o por la intervención de hoy. Después eliges tu jugada en el mapa.`;
  result.optionLabels={act:`${materials} en ${place}`,take_airtime:'Responder por radio',save:'Guardar la caja'};
  result.optionSpeeches={act:materialSpeech,take_airtime:issue.reply,save:'Hoy no pago el material ni entro en radio. Guardemos la caja.'};
  result.optionIntents={act:'Pagas material para que los voluntarios sigan trabajando hasta las urnas. No gastas energía ni ocupas a un colaborador.',
   take_airtime:'Explicas tu propuesta por radio de todo el país. Gastas caja y energía; no amplías los voluntarios.',
   save:'No pagas material ni sales en radio. Conservas caja y energía para tu jugada.'};
  if(launch?.issue?.id===issue.id&&launch.topicId===issue.topicId&&launch.turn<turn){
   result.optionSpeeches.take_airtime=`Ya lo anuncié al empezar: ${issue.brief}. Ahora toca explicar los límites: ${issue.limit}`;
   result.body=`Anunciaste esta propuesta al empezar. Hoy toca explicar sus dificultades. ${result.body}`;
   if(!result.antecedent)result.antecedent=launch.antecedent;
  }
 }else{
  result.shortBody=short(`¿Refuerzas a los voluntarios de ${place}, ensayas el debate o guardas la caja?`);
  result.body=`${issue.situation} ${localMemory||previousMemory}El debate está cerca. El equipo propone ensayar esta pregunta: «${issue.question}» Los voluntarios de ${place} también piden material para explicar tu propuesta. Puedes ampliar el trabajo local para los ${left} cierres que quedan, incluido el de hoy, o ensayar con una persona del equipo. Después eliges tu jugada en el mapa.`;
  result.optionLabels={act:`${materials} en ${place}`,rehearse:'Ensayar mi respuesta para el debate',save:'Guardar la caja'};
  result.optionSpeeches={act:materialSpeech,rehearse:`Vamos a ensayar esta respuesta: ${issue.reply}`,save:'Hoy no pago más material ni hago otro ensayo. Guardemos la caja.'};
  result.optionIntents={act:'Pagas material para el trabajo local hasta las urnas. El equipo sigue disponible; no añades preparación.',
   rehearse:'Preparas tu respuesta para el debate. Pagas y ocupas a un colaborador; no podrá hacer otra tarea. No amplías los voluntarios.',
   save:'Conservas la caja y dejas al equipo disponible. No amplías los voluntarios ni añades preparación.'};
 }
 return result;
}
