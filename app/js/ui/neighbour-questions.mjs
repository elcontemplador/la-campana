import {campaignIssue} from './issue-cases.mjs';
import {resolveCampaignBundle} from '../core/campaign.mjs';

// The question tests the chosen programme; it never changes that programme.
const questions={
 'sanidad-espera':{name:'Carmen',request:'la espera de Carmen',
  '-1':{question:'¿De dónde saldrán los médicos para abrir más turnos?',
   explanation:'Propongo contratar en los centros públicos. Hay que pagar esos puestos y encontrar profesionales para cubrirlos. No puedo decirle a Carmen que su espera termina por anunciar más turnos.'},
  '1':{question:'¿Carmen pagará algo? ¿Quién vigilará lo que cobra la clínica?',
   explanation:'La consulta de Carmen la pagaría la sanidad pública. Habría que controlar el precio y la calidad de las citas privadas, y evitar que los centros públicos pierdan personal.'}},
 'escuela-infantil':{name:'Raúl y Eva',request:'la plaza infantil de Raúl y Eva',
  '-1':{question:'¿Qué hacemos con nuestra hija mientras abres esas plazas?',
   explanation:'Propongo abrir más plazas públicas a precios asequibles. Hay que abrir los centros y contratar personal. No puedo prometer una plaza inmediata a Raúl y Eva: mi propuesta necesita tiempo y deja esa espera sin resolver.'},
  '1':{question:'¿Y si la ayuda no alcanza para pagar la escuela privada?',
   explanation:'Propongo ayudas según los ingresos para pagar plazas privadas, además de ampliar las públicas. No puedo garantizar que cubran cualquier precio. Hay que explicar cuánto pueden pagar las familias y vigilar que los centros no se queden con la ayuda subiendo las tarifas.'}},
 cuidados:{name:'Andrés',request:'la ayuda para la madre de Andrés',
  '-1':{question:'Si aprobáis más horas, ¿quién vendrá a cuidar a mi madre?',
   explanation:'Propongo ampliar la ayuda pública a domicilio. Hay que pagar las horas y contratar a quien las haga. Aprobar más ayuda no basta si no hay una persona que pueda ir a casa de la madre de Andrés.'},
  '1':{question:'¿Quién comprobará que la empresa viene y cumple las horas?',
   explanation:'Propongo contratar ayuda a domicilio supervisada. Hay que comprobar las horas que llegan a cada hogar y las condiciones del personal. Pagar una factura a la empresa no demuestra que la madre de Andrés haya recibido la ayuda.'}},
};

export function neighbourQuestion(state,sourceBundle,eventId,turn){
 if(!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion)||!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)||!['E02','E03'].includes(eventId)
  ||!Number.isSafeInteger(turn)||turn<1||turn>state.turn)return null;
 const bundle=resolveCampaignBundle(sourceBundle,state);
 if(!bundle.content.events.some(e=>e.id===eventId&&e.turn===turn))return null;
 const past=(state.timeline||[]).filter(e=>(!e.partyId||e.partyId==='P1')&&Number.isSafeInteger(e.turn)&&e.turn<turn);
 const provinceId=past.findLast(e=>e.kind==='plan'&&e.actorId==='candidate'&&e.actionId==='visit')?.target||state.initialSetup?.province;
 const issue=campaignIssue(state,bundle,{topicId:'T2',sceneKey:eventId,provinceId});
 const person=questions[issue?.id],argument=person?.[state.parties.P1.positions.T2];
 if(!argument)return null;
 return {...argument,name:person.name,request:person.request,issueId:issue.id,topicId:'T2',provinceId,
  proposal:issue.brief,situation:issue.situation,shortSituation:issue.shortSituation,
  reply:issue.reply,delivery:`una respuesta sobre ${person.request}`};
}

export function neighbourScene(state,bundle,eventId,turn){
 const q=neighbourQuestion(state,bundle,eventId,turn);if(!q)return null;
 const scheduling=eventId==='E02',place=bundle.provinces.districts.find(p=>p.id===q.provinceId)?.name;
 const answer=`${q.reply} Os responderé antes de las urnas.`;
 const labels=scheduling?{keep_route:`Mantener el acto en ${place}`,attend:'Ir y prometer una respuesta',delegate:'Enviar al equipo y prometer respuesta',decline:'Rechazar la reunión'}
  :{listen:'Ir y prometer una respuesta',delegate:'Enviar al equipo y prometer respuesta',receive_written:'Recibir la pregunta sin prometer una respuesta'};
 return {eventId,turn,provinceId:q.provinceId,format:'politics',icon:'mediate',issueId:q.issueId,topicId:'T2',
  title:scheduling?'¿El acto del partido o la reunión con los vecinos?':`${q.name} te ${q.name==='Raúl y Eva'?'piden':'pide'} una respuesta`,
  shortBody:`${q.shortSituation} ${scheduling?'La reunión coincide con el acto de tu partido. ¿Qué priorizas?':'¿Te comprometes a contestar antes de las urnas?'}`,
  body:`${q.situation} Mesa Abierta organiza la reunión en ${place}. ${scheduling?'A la misma hora, tu agrupación espera que vayas al acto que lleva anunciando una semana. ':''}La pregunta pone a prueba tu propuesta. Puedes asumir la explicación tú o con un colaborador. En ambos casos tendrás que entregarla en el turno 10; no prometes resolver el problema durante la campaña.`,
  speaker:{kind:'civil',id:'C1',name:'Mesa Abierta',role:`Trae la pregunta de ${q.name}`},
  messages:[{label:'Tu propuesta',text:q.proposal},{label:`${q.name} ${q.name==='Raúl y Eva'?'preguntan':'pregunta'}`,text:q.question}],
  neighbourDecision:q,antecedent:null,optionLabels:labels,
  optionSpeeches:{...(scheduling?{keep_route:'Hoy cumplo el acto de nuestra agrupación. No voy a prometer una respuesta que no he preparado.',attend:answer,decline:'Hoy no voy a la reunión. Prefiero decirlo y no prometer otra entrega.'}:{listen:answer,receive_written:'Enviadme esa pregunta. Hoy no puedo comprometer una respuesta antes de las urnas.'}),
   delegate:`Equipo, hablad con ${q.name}. Prometemos contestar esa pregunta antes de las urnas.`},
  optionIntents:{...(scheduling?{keep_route:'Ganas organización local y cohesión. Gastas energía; no asumes la respuesta de los vecinos.',attend:'Acercas la relación y te comprometes a responder en el turno 10. Gastas energía; esta respuesta no añade organización local.',decline:'Conservas recursos. No asumes la respuesta ni refuerzas la agrupación con esta decisión.'}:{listen:'Acercas la relación y te comprometes a responder en el turno 10. Gastas energía.',receive_written:'Conservas energía y equipo disponible. Abres el contacto, pero no asumes una entrega.'}),
   delegate:`Acercas la relación y asumes la misma respuesta para el turno 10. El colaborador elegido ocupa su tarea; no gastas energía del candidato.`},
  optionDetails:Object.fromEntries(Object.keys(labels).map(id=>[id,['attend','listen','delegate'].includes(id)?`La respuesta pendiente será: «${q.question}». Darla al cierre requiere caja, energía o una tarea. Tu programa se mantiene; esta reunión no concede votos.`:'Después elegirás tu jugada en el mapa. Esta respuesta no abre un compromiso ni ejecuta una visita.']))};
}
