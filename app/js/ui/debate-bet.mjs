import {debateBet} from '../core/debate-bet.mjs';
import {campaignIssue} from './issue-cases.mjs';
import {launchStory} from './launch-story.mjs';
import {resolveCampaignBundle} from '../core/campaign.mjs';

export function debateBetIssue(state,bundle,index=0){
 const topicId=state.commitments[index],launch=launchStory(state,bundle)?.confirmed;
 return launch?.topicId===topicId?launch.issue:campaignIssue(state,bundle,{topicId,sceneKey:'debate-bet'});
}
export function debateBetScene(state,bundle){
 if(!['0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion)||!['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion))return null;
 const own=debateBetIssue(state,bundle),second=debateBetIssue(state,bundle,1),rival=bundle.config.parties.find(p=>p.id==='P2');
 const opponent=campaignIssue(state,bundle,{topicId:own.topicId,caseId:own.id,partyId:'P2'});
 const agrees=own.positionLabel===opponent.positionLabel;
 return {eventId:'E31',turn:5,provinceId:state.initialSetup.province,format:'politics',icon:'interview',issueId:own.id,
  title:'¿Qué batalla llevarás al debate?',
  shortBody:`${own.shortSituation} Lola pide el titular para el debate de mañana.`,
  body:`Tu propuesta: ${own.brief}. ${rival.name} propone ${opponent.brief}. Puedes disputarle el protagonismo, ofrecerle hablar o abrir con tu otra prioridad: ${second.brief}. Hoy anuncias la apuesta; solo se aprovecha si eliges esa intervención en el debate.`,
  speaker:{kind:'press',id:'press',name:'Lola Rivas',role:'Prepara la previa del debate'},
  debateChoice:{primary:own,secondary:second,rivalId:'P2',agrees},
  optionLabels:{challenge:agrees?'Disputar quién lo hará mejor':'Disputar la propuesta del rival',dialogue:'Ofrecer una conversación',second_priority:`Hablar de ${second.topicName.toLowerCase()}`},
  optionSpeeches:{challenge:agrees?`Coincidimos en ${own.brief}. Quiero explicar por qué mi candidatura puede hacerlo mejor.`:`Propongo ${own.brief}. ${rival.name} propone ${opponent.brief}. Mañana compararemos esas dos propuestas.`,
   dialogue:`Le propongo a ${rival.name} hablar de ${own.brief}. Escucharle no significa aceptar su programa.`,
   second_priority:`${second.shortSituation} ${second.reply}`},
  optionIntents:{challenge:'Apuestas por la réplica: más alcance al comparar, pero peor relación con el rival.',dialogue:'Apuestas por el cierre: abrir diálogo mejora más la relación, sin prometer un pacto.',second_priority:'Apuestas por otro problema: cambias el caso de apertura y cierre. Preparar la apertura da más alcance.'},
  optionPlans:{challenge:'Comparar propuestas puede sumar hasta 20 de alcance adicional y restar 1 de relación. Requiere una ficha y 4 de energía.',
   dialogue:'Abrir diálogo puede sumar hasta 1 de relación adicional con este rival. Requiere 2 de energía.',
   second_priority:'Abrir con fuerza o Prepararlo con Ada puede sumar hasta 20 de alcance adicional. La primera usa una ficha y 4 de energía; Ada ocupa su tarea.'}};
}
export function debateBetReminder(state,bundle,stage){
 const bet=debateBet(state);if(!bet)return null;
 const topic=debateBetIssue(state,bundle,bet.topicIndex),rival=bundle.config.parties.find(p=>p.id==='P2');
 const text=bet.kind==='challenge'?`Anunciaste que compararías las propuestas con ${rival.name}.`
  :bet.kind==='dialogue'?`Ofreciste a ${rival.name} una conversación sobre ${topic.brief}.`
  :`Anunciaste que abrirías con ${topic.brief}.`;
 return {...bet,text,active:bet.stage===stage};
}

// Retell the public announcement and the three confirmed replies. Following
// a political intention and obtaining a mechanical reinforcement differ.
export function debateBetStory(state,sourceBundle){
 if(!['planning','debrief','election','negotiation','ending'].includes(state?.phase)
  ||!['0.8.3','0.8.4','0.8.5'].includes(state.rulesVersion)||!['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)||!Number.isSafeInteger(state.turn)||state.turn<6)return null;
 const bundle=resolveCampaignBundle(sourceBundle,state),bet=debateBet(state);
 if(!bet||state.turn>bundle.config.turns||!['0.8.3','0.8.4','0.8.5'].includes(bundle.config.rulesVersion)||!['0.8.3','0.8.4','0.8.5'].includes(bundle.content.version))return null;
 const timeline=state.timeline||[],announcement=timeline.find(e=>e.id===bet.entryId);
 const replies=timeline.filter(e=>e.kind==='event'&&e.eventId==='E07'&&e.turn===6&&(!e.partyId||e.partyId==='P1'));
 const stages=bundle.content.events.find(e=>e.id==='E07')?.stages;
 if(timeline.filter(e=>e.id===bet.entryId).length!==1||replies.length!==3||stages?.length!==3||new Set([announcement?.id,...replies.map(e=>e.id)]).size!==4
  ||replies.some((e,i)=>typeof e.id!=='string'||!e.id||!stages[i].options.some(o=>o.id===e.optionId)
   ||timeline.filter(other=>other.id===e.id).length!==1||timeline.indexOf(e)<=timeline.indexOf(i?replies[i-1]:announcement)))return null;
 const scene=debateBetScene(state,bundle),issue=scene.debateChoice[bet.topicIndex?'secondary':'primary'];
 const rival=bundle.config.parties.find(p=>p.id==='P2').name;
 const intervention=replies[bet.stage],matching=bet.options.includes(intervention.optionId);
 const status=matching?'followed':bet.kind==='second_priority'?'brief':'changed';
 const labels=stages.map((stage,i)=>stage.options.find(o=>o.id===replies[i].optionId).shortLabel);
 const titles={challenge:matching?'Llevaste el cara a cara al debate':'Anunciaste un cara a cara y elegiste otra respuesta',
  dialogue:matching?`Ofreciste hablar con ${rival}`:'Anunciaste diálogo y elegiste otro cierre',
  second_priority:matching?'Abriste con tu otra prioridad':'Tu otra prioridad, con una respuesta breve'};
 let summary=bet.kind==='challenge'?matching
  ?`Anunciaste que compararías propuestas con ${rival} y lo hiciste en la réplica.`
  :`Anunciaste un cara a cara con ${rival}. En la réplica elegiste «${labels[1]}».`
  :bet.kind==='dialogue'?matching
  ?`Ofreciste hablar con ${rival} y cerraste buscando acuerdos. En ese momento no había pacto.`
  :`Ofreciste hablar con ${rival}. Al terminar elegiste «${labels[2]}».`
  :matching?'Abriste con el otro problema que habías anunciado y elegiste una intervención preparada.'
  :'Abriste con el otro problema que habías anunciado. En esa apertura elegiste una respuesta breve y conservaste energía y fichas.';
 if(bet.kind==='challenge'&&matching&&replies[2].optionId==='open_dialogue')summary+=' Después ofreciste hablar.';
 const totals=new Map([['P2',0]]);
 for(const reply of replies)for(const change of reply.changes||[]){
  if(change.stat==='relation'&&(!change.partyId||change.partyId==='P1')&&Number.isFinite(change.delta)
   &&bundle.config.parties.some(p=>p.id===change.target))totals.set(change.target,(totals.get(change.target)||0)+change.delta);
 }
 const relationships=[...totals].map(([partyId,delta])=>({partyId,delta,name:bundle.config.parties.find(p=>p.id===partyId).name}));
 const followup=relationships.map(({name,delta})=>delta>0?`La relación con ${name} mejoró ${delta}.`
  :delta<0?`La relación con ${name} empeoró ${Math.abs(delta)}.`:`La relación con ${name} no cambió.`).join(' ');
 return {kind:bet.kind,status,matchingIntervention:matching,entryId:announcement.id,title:titles[bet.kind],summary,
  context:issue.shortSituation,messages:[{label:'Anunciaste',text:scene.optionSpeeches[bet.kind]}],
  followup:`Al terminar el debate, ${followup.replace(/^La /,'la ')}`,relationships,coveredTurns:[5,6],
  references:[{entryId:announcement.id,label:'Ver lo que anuncié'},...replies.map((e,i)=>({entryId:e.id,label:`Ver ${['apertura','réplica','cierre'][i]}`}))]};
}
