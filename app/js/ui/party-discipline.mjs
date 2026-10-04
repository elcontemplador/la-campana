import {resolveCampaignBundle} from '../core/campaign.mjs';
import {campaignIssue} from './issue-cases.mjs';

const ids=['correct_publicly','prepare_clarification','let_it_pass'];
const announcements={
 'sanidad-espera':{'-1':{brief:'Solo citas privadas; sin ampliar plantilla pública',reply:'No ampliaremos la plantilla pública. Pagaremos citas en clínicas privadas.'},'1':{brief:'Solo plantilla pública; sin pagar citas privadas',reply:'No pagaremos citas en clínicas privadas. Contrataremos más profesionales en la sanidad pública.'}},
 'escuela-infantil':{'-1':{brief:'Solo ayudas privadas; sin nuevas plazas públicas',reply:'No abriremos nuevas plazas públicas. Daremos ayudas para pagar escuelas infantiles privadas.'},'1':{brief:'Solo plazas públicas; sin ayudas a centros privados',reply:'Abriremos más plazas públicas. No habrá ayudas para escuelas infantiles privadas.'}},
 cuidados:{'-1':{brief:'Solo empresas; sin más personal público',reply:'No contrataremos más personal público para ayuda a domicilio. Pagaremos a empresas para prestar el servicio.'},'1':{brief:'Solo personal público; sin contratar empresas',reply:'No contrataremos empresas para la ayuda a domicilio. Ampliaremos la plantilla pública.'}}
};
export function disciplineProgrammeBrief(caseId,pole,fallback){
 if(caseId==='escuela-infantil')return pole===-1?'solo plazas públicas; sin ayudas privadas':pole===1?'más plazas públicas y ayudas a privadas':fallback;
 return fallback;
}
const ownEntry=e=>e&&(!e.partyId||e.partyId==='P1')&&typeof e.id==='string'&&e.id.length>0;
const executionAnswers={
 'sanidad-espera':{'-1':'Para ampliar los turnos públicos hay que encontrar profesionales y pagar esas horas. La cita de Carmen no aparece por anunciar más plantilla.',
  '1':'Para pagar citas privadas hay que fijar el precio y comprobar la atención. No sirve de nada acortar la espera de Carmen dejando sin personal al centro público.'},
 'escuela-infantil':{'-1':'Para abrir plazas públicas hacen falta locales, dinero y personal. Raúl y Eva necesitan una solución mientras se abren; anunciar plazas no les da una mañana libre.',
  '1':'Para dar ayudas hay que mirar los ingresos de la familia y el precio real de la plaza. Si el centro sube la tarifa, Raúl y Eva pueden seguir sin poder pagarla.'},
 cuidados:{'-1':'Para ampliar la ayuda pública hay que pagar las horas y encontrar personal que vaya a domicilio. Andrés necesita saber quién irá a casa de su madre, no solo que se ha aprobado una ayuda.',
  '1':'Para contratar empresas hay que comprobar las horas que prestan y que mantienen al personal. A Andrés no le sirve un contrato firmado si nadie llega a casa de su madre.'}
};
// Fixed public programme and confirmed past only. No polls, drafts or private NPCs.
export function partyDiscipline(state,sourceBundle,{turn=state?.turn}={}){
 if(!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion)||!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)||!Number.isInteger(turn)||turn<1||turn>state.turn)return null;
 let bundle;try{bundle=resolveCampaignBundle(sourceBundle,state);}catch{return null;}
 const event=bundle.content.events.find(e=>e.id==='E05'&&e.turn===turn);
 if(!event||event.options.length!==3||!ids.every(id=>event.options.some(o=>o.id===id)))return null;
 const entry=(state.timeline||[]).find(e=>ownEntry(e)&&e.kind==='event'&&e.eventId==='E05'&&e.turn===turn&&ids.includes(e.optionId));
 if(!(state.phase==='event'&&state.activeEvent==='E05'&&state.turn===turn)&&!entry)return null;
 const visit=(state.timeline||[]).findLast(e=>ownEntry(e)&&e.kind==='plan'&&e.actorId==='candidate'&&e.actionId==='visit'&&Number.isSafeInteger(e.turn)&&e.turn>0&&e.turn<turn&&bundle.provinces.districts.some(p=>p.id===e.target));
 const provinceId=visit?.target||state.initialSetup?.province,place=bundle.provinces.districts.find(p=>p.id===provinceId)?.name;
 const pole=state.initialSetup?.positions?.T2;if(!place||![-1,1].includes(pole))return null;
 const rawIssue=campaignIssue(state,bundle,{topicId:'T2',sceneKey:'E05',provinceId});
 const issue=rawIssue?{...rawIssue,brief:disciplineProgrammeBrief(rawIssue.id,pole,rawIssue.brief)}:null;
 const opposite=announcements[issue?.id]?.[pole];if(!opposite)return null;
 const replies={correct_publicly:issue.reply,prepare_clarification:'Rafa, eso no es lo que dice nuestro programa. Preparemos una aclaración; todavía no la voy a anunciar.',let_it_pass:'Hoy no voy a corregir el anuncio. Mantengo mi programa, pero no abriré una bronca en público.'};
 const confirmed=entry?{entryId:entry.id,turn,optionId:entry.optionId,speech:replies[entry.optionId],publicCorrection:entry.optionId==='correct_publicly'}:null;
 return {eventId:'E05',turn,provinceId,format:'politics',icon:'interview',title:'Tu portavoz promete lo contrario',
 shortBody:`${issue.shortSituation} Tu portavoz propone lo contrario de tu programa. ¿Le corriges?`,
 body:`${issue.situation} Rafa, tu portavoz local en ${place}, anuncia: «${opposite.reply}» Tu programa dice: «${issue.reply}» La prensa ya tiene el vídeo. Puedes corregirle en público, preparar una aclaración con él o dejarlo pasar. El programa no cambia.`,
 optionLabels:{correct_publicly:'Corregirle delante de la prensa',prepare_clarification:'Preparar una aclaración con Rafa',let_it_pass:'Dejar pasar el anuncio'},
 optionSpeeches:replies,
 optionIntents:{correct_publicly:'Aclaras tu programa en público: buscas apoyo local y ganas reputación. Gastas energía y pierdes unión en el equipo.',prepare_clarification:'Preparáis argumentos y recuperáis unión. Gastas caja y energía; el anuncio todavía sigue sin una corrección pública.',let_it_pass:'Ahorras recursos y evitas la bronca interna. Pierdes reputación; siguen circulando dos mensajes distintos.'},
 optionDetails:{correct_publicly:'La acogida local depende de tu propuesta y la preferencia del sondeo. Corregir al portavoz no contrata personal ni pone en marcha una política.',prepare_clarification:'Sumas preparación para Medios o el debate. Preparar la aclaración no equivale a publicarla; todavía no cambias el mensaje que ya se conoce.',let_it_pass:'Tu programa se mantiene. Dejar pasar el anuncio no convierte la otra propuesta en tu política ni borra el vídeo.'},
 antecedent:visit?{entryId:visit.id,turn:visit.turn,label:`Tu visita a ${place} · turno ${visit.turn}`}:null,
 messages:[{label:'Tu programa',text:issue.brief},{label:'Rafa, en el vídeo',text:opposite.brief}],
 speaker:{kind:'spokesperson',id:'campaign-team',name:'Rafa · portavoz local',role:'Ha anunciado otra propuesta'},issueId:issue.id,topicId:'T2',
 discipline:{provinceId,provinceName:place,issueId:issue.id,proposal:issue.reply,proposalBrief:issue.brief,announcement:opposite.reply,announcementBrief:opposite.brief,confirmed}};
}

export function disciplineFollowup(state,sourceBundle,{turn=state?.turn}={}){
 if(!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state?.contentVersion)||!Number.isInteger(turn)||turn<1||turn>state.turn)return null;
 let bundle;try{bundle=resolveCampaignBundle(sourceBundle,state);}catch{return null;}
 const event=bundle.content.events.find(e=>e.id==='E34'&&e.turn===turn);if(!event)return null;
 if(!(state.phase==='event'&&state.activeEvent==='E34'&&state.turn===turn)&&!(state.timeline||[]).some(e=>ownEntry(e)&&e.kind==='event'&&e.eventId==='E34'&&e.turn===turn))return null;
 const origin=(state.timeline||[]).findLast(e=>ownEntry(e)&&e.kind==='event'&&e.eventId==='E05'&&e.turn<turn&&ids.includes(e.optionId));
 const earlier=origin?partyDiscipline(state,bundle,{turn:origin.turn}):null;if(!earlier?.discipline.confirmed)return null;
 const d=earlier.discipline;
 const memory=d.confirmed.publicCorrection?'Corregiste al portavoz delante de la prensa.':'No le corregiste en aquel acto.';
 const question=d.confirmed.publicCorrection?'¿Cómo piensas poner en marcha la propuesta que defendiste?':'Tu portavoz dijo una cosa y tu programa dice otra. ¿Qué propuesta defiendes tú?';
 const execution=['0.8.3','0.8.4','0.8.5'].includes(state.rulesVersion)&&['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)&&d.confirmed.publicCorrection
  ?executionAnswers[d.issueId]?.[state.initialSetup?.positions?.T2]:null;
 return {eventId:'E34',turn,provinceId:d.provinceId,format:'politics',icon:'interview',title:'La prensa recupera el vídeo de Rafa',shortBody:`${memory} La prensa vuelve al caso. ¿Respondes o sigues tu agenda?`,
 body:`${memory} En ${d.provinceName}, Rafa anunció: «${d.announcement}» Tu programa: «${d.proposal}» La pregunta es: «${question}» Responder consume una ficha y busca alcance nacional. No equivale a poner en marcha la medida.`,
 optionLabels:{act:'Explicar mi propuesta ante la prensa',save:'Seguir mi agenda sin responder'},
 optionSpeeches:{act:execution?`Mi propuesta sigue siendo ${d.proposalBrief}. ${execution}`:d.proposal,save:'Hoy sigo con mi agenda. Esa pregunta queda sin responder.'},
 optionIntents:{act:'Defiendes tu programa en los medios nacionales; gastas una ficha, caja y energía.',save:'Guardas recursos; no añades una respuesta pública a la pregunta.'},
 messages:[{label:'Tu programa',text:d.proposalBrief},{label:'Rafa, en aquel vídeo',text:d.announcementBrief}],
 speaker:{kind:'press',id:'campaign-press',name:'La prensa',role:'Recupera una declaración pública'},
 antecedent:{entryId:origin.id,turn:origin.turn,label:`El anuncio de Rafa y tu decisión · turno ${origin.turn}`},issueId:d.issueId,topicId:'T2',discipline:d};
}
