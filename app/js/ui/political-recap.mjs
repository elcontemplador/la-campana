import {resolveCampaignBundle} from '../core/campaign.mjs';
import {launchStory} from './launch-story.mjs';
import {economicDilemma} from './economic-dilemma.mjs';
import {partyDiscipline} from './party-discipline.mjs';
import {promiseThreads} from './promises.mjs';
import {debateBetStory} from './debate-bet.mjs';

const signed=n=>`${n>0?'+':''}${n.toLocaleString('es-ES')}`;
const labels={budget:'Caja',energy:'Energía',readiness:'Preparación',reputation:'Reputación',cohesion:'Cohesión'};
const subjects={'sanidad-espera':'la espera de Carmen','escuela-infantil':'la plaza infantil de Raúl y Eva',cuidados:'la ayuda para la madre de Andrés'};
const own=e=>e&&(!e.partyId||e.partyId==='P1');

function recordedEffects(entry){
 const totals=new Map();
 for(const c of entry.changes||[])if(own(c)&&labels[c.stat]&&Number.isFinite(c.delta))totals.set(c.stat,(totals.get(c.stat)||0)+c.delta);
 const resource=[...totals].filter(([,n])=>n).map(([stat,n])=>`${labels[stat]} ${signed(n)}`);
 const support=(entry.changes||[]).filter(c=>own(c)&&c.stat==='support'&&Number.isFinite(c.delta)).reduce((n,c)=>n+c.delta,0);
 if(support)resource.push(support>0?'Ganaste alcance':'Perdiste alcance');
 return resource.join(' · ');
}

// A retrospective of confirmed decisions. Never a causal account of seats,
// imagined later speeches, rival secrets or implementation of public policy.
export function politicalRecap(state,sourceBundle){
 if(state?.phase!=='ending'||!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.rulesVersion)||!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)||!Number.isSafeInteger(state.turn)||state.turn<1)return [];
 const bundle=resolveCampaignBundle(sourceBundle,state);
 const entries=(state.timeline||[]).filter(e=>own(e)&&e.kind==='event'&&typeof e.id==='string'&&e.id
  &&Number.isSafeInteger(e.turn)&&e.turn>=1&&e.turn<=Math.min(state.turn,bundle.config.turns)
  &&bundle.content.events.some(event=>event.id===e.eventId&&event.turn===e.turn&&event.options?.some(o=>o.id===e.optionId)));
 const moments=[];
 const debate=debateBetStory(state,bundle);
 if(debate)moments.push({turn:5,storyId:'debate-bet',title:debate.title,kind:'politics',score:130,icon:'interview',
  summary:debate.summary,context:debate.context,messages:debate.messages,followup:debate.followup,
  coveredTurns:debate.coveredTurns,references:debate.references});
 const make=(entry,storyId,title,kind,score,summary,extra={})=>({turn:entry.turn,title,kind,score,icon:'interview',storyId,summary,
  effects:recordedEffects(entry),references:[{entryId:entry.id,label:'Ver mi respuesta'}],...extra});
 const disciplineEntry=entries.find(e=>e.eventId==='E05');
 const discipline=disciplineEntry?partyDiscipline(state,bundle,{turn:disciplineEntry.turn}):null;
 if(discipline && discipline.discipline.confirmed?.entryId===disciplineEntry?.id){
  const d=discipline.discipline,choice=disciplineEntry.optionId;
  const title={correct_publicly:'Corregiste a tu propio portavoz',prepare_clarification:'Preparaste una aclaración con Rafa',let_it_pass:'Dejaste pasar el anuncio de Rafa'}[choice];
  const summary=choice==='correct_publicly'?'Le corregiste delante de la prensa y defendiste tu programa.'
   :choice==='prepare_clarification'?'Preparaste una aclaración con Rafa. En aquel acto no la hiciste pública.'
   :'Dejaste pasar el anuncio para evitar una bronca. En aquel acto circularon dos mensajes distintos.';
  const follow=entries.find(e=>e.eventId==='E34'&&e.turn>disciplineEntry.turn);
  const followup=follow?`Turno ${follow.turn}: la prensa recuperó el vídeo. ${follow.optionId==='act'?'Explicaste tu propuesta ante la prensa.':'Seguiste tu agenda sin responder a esa pregunta.'}`:null;
  const item=make(disciplineEntry,'spokesperson',title,'politics',follow?140:120,summary,
   {context:`En ${d.provinceName}: ${subjects[d.issueId]}.`,messages:[{label:'Tu programa',text:d.proposalBrief},{label:'Rafa anunció',text:d.announcementBrief}],followup});
  if(follow)item.references.push({entryId:follow.id,label:`Ver el seguimiento · turno ${follow.turn}`});
  moments.push(item);
 }
 const economyEntry=entries.find(e=>e.eventId==='E04');
 const economy=economyEntry?economicDilemma(state,bundle,{turn:economyEntry.turn}):null;
 if(economy?.economicDecision){
  const choice=economyEntry.optionId,d=economy.economicDecision;
  const thread=promiseThreads(state,bundle).find(p=>p.id==='C2_REVIEW'&&(p.entryId===economyEntry.id||p.sourceEntryId===economyEntry.id));
  const summary=choice==='announce_now'?'Defendiste la propuesta; la pregunta sobre cómo hacerla quedó sin una explicación detallada.'
   :choice==='costed_commitment'?'Renunciaste al anuncio de ese día y prometiste explicar cómo hacerlo antes de las urnas.'
   :'Aplazaste la respuesta y conservaste recursos. Ese día no prometiste una entrega.';
  const endings={fulfilled:'Entregaste la explicación comprometida.',reduced:'Entregaste una versión más breve de la explicación.',missed:'Llegaste a las urnas sin entregar esa explicación.',open:'La explicación quedó pendiente.'};
  const followup=thread?`${thread.openedTurn!==economyEntry.turn?`Turno ${thread.openedTurn}: después sí prometiste una explicación. `:''}${endings[thread.status]}`:null;
  const item=make(economyEntry,'economic-question',({announce_now:'Defendiste la propuesta; la pregunta siguió abierta',costed_commitment:'Prometiste explicar cómo hacerlo',postpone_answer:'Aplazaste la respuesta económica'})[choice],'economy',thread?115:85,summary,
   {context:economy.title,question:d.question,messages:[{label:'Tu propuesta',text:d.proposal}],followup});
  if(thread&&thread.entryId!==economyEntry.id)item.references.push({entryId:thread.entryId,label:`Ver la promesa · turno ${thread.openedTurn}`});
  if(thread?.closedTurn){const closing=entries.find(e=>e.turn===thread.closedTurn&&(e.changes||[]).some(c=>c.stat==='promise'&&c.target===thread.id));
   if(closing)item.references.push({entryId:closing.id,label:`Ver el cierre · turno ${closing.turn}`});}
  moments.push(item);
 }
 const neighbours=promiseThreads(state,bundle).find(p=>p.id==='C1_REPLY'&&p.personName&&p.explanation);
 const neighbourEntry=neighbours?entries.find(e=>e.id===neighbours.entryId):null;
 if(neighbourEntry){
  const endings={fulfilled:'Entregaste la respuesta prometida.',reduced:'Acordaste una respuesta más breve.',missed:'Llegaste a las urnas sin entregar la respuesta.',open:'La respuesta seguía pendiente.'};
  const item=make(neighbourEntry,'neighbour-question',`La pregunta de ${neighbours.personName}`,'politics',neighbours.status==='open'?90:110,
   `${neighbourEntry.optionId==='delegate'?'Encargaste la reunión al equipo':'Fuiste a la reunión'} y asumiste una respuesta para el turno ${neighbours.dueTurn}.`,
   {context:neighbours.situation,question:neighbours.question,messages:[{label:'Tu propuesta',text:neighbours.proposal}],followup:endings[neighbours.status]});
  if(neighbours.closedTurn){const closing=entries.find(e=>e.turn===neighbours.closedTurn&&(e.changes||[]).some(c=>c.stat==='promise'&&c.target===neighbours.id));
   if(closing)item.references.push({entryId:closing.id,label:`Ver el cierre · turno ${closing.turn}`});}
  moments.push(item);
 }
 const launch=launchStory(state,bundle),confirmed=launch?.confirmed;
 const first=confirmed?entries.find(e=>e.id===confirmed.entryId):null;
 if(first){
  const selected=launch.choices.find(c=>c.optionId===confirmed.optionId);
  moments.push(make(first,'opening',selected?`Abriste con ${confirmed.subject}`:'Reservaste el primer anuncio','identity',selected?65:25,
   selected?`Defendiste ${confirmed.issue.brief}.`:'Conservaste caja y energía. No hiciste ninguno de los dos anuncios.'));
 }
 return moments;
}
