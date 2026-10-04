import {campaignIssue} from './issue-cases.mjs';

// Presentation only: the three existing choices retain their catalogue effects.
export function closingScene(state,bundle,turn=state?.turn){
 if(!['0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion)||!['0.8.3','0.8.4','0.8.5'].includes(state?.contentVersion)||turn!==9||turn>state.turn)return null;
 const district=id=>bundle.provinces.districts.find(d=>d.id===id);
 const confirmed=(state.timeline||[]).filter(e=>e?.kind==='event'&&(!e.partyId||e.partyId==='P1')&&e.eventId==='E36'&&e.turn===turn);
 const current=state.phase==='event'&&state.activeEvent==='E36'&&state.turn===turn;
 if(!current&&confirmed.length!==1)return null;
 const past=(state.timeline||[]).filter(e=>Number.isSafeInteger(e?.turn)&&e.turn>0&&e.turn<turn
  &&e.kind==='plan'&&(!e.partyId||e.partyId==='P1')&&e.actorId==='candidate'&&e.actionId==='visit'&&district(e.target));
 const visit=past.at(-1);
 const recorded=confirmed[0]?.optionId==='act'?confirmed[0].changes?.find(c=>c.stat==='support'&&c.partyId==='P1'&&district(c.target)):null;
 const provinceId=recorded?.target||(current&&district(state.focusProvince)?state.focusProvince:visit?.target||state.initialSetup?.province);
 const place=district(provinceId)?.name;
 const topicId=(state.commitments||[]).find(id=>bundle.config.topics.some(t=>t.id===id));
 const own=campaignIssue(state,bundle,{topicId,sceneKey:'E36',provinceId});
 const rival=own&&campaignIssue(state,bundle,{topicId,sceneKey:'E36',caseId:own.id,provinceId,partyId:'P2'});
 const rivalName=bundle.config.parties.find(p=>p.id==='P2')?.name;
 if(!place||!own||!rival||!rivalName)return null;
 const question=`¿Lo explicas en ${place}, llamas a ${rivalName} o guardas fuerzas?`;
 const short=`${own.shortSituation} ${question}`;
 const same=own.brief===rival.brief;
 const comparison=same?`Coincidís en ${own.brief}. ${own.objection}`
  :`Tu propuesta: ${own.brief}. ${rivalName} propone ${rival.brief}.`;
 return {eventId:'E36',turn,provinceId,format:'closing',icon:'visit',title:own.title,
  shortBody:short.length<=180?short:`${own.title}. ${question}`,
  body:`${own.situation} ${comparison} Quedan este turno y el siguiente. Puedes hablar con los vecinos o llamar al rival pensando en un acuerdo tras las elecciones. La llamada mantiene tu programa; no asegura su voto. Después eliges tu jugada en el mapa.`,
  issueId:own.id,closing:{ownProposal:own.brief,rivalProposal:rival.brief,rivalName,same},
  antecedent:visit?{entryId:visit.id,turn:visit.turn,label:`Tu visita a ${place} · turno ${visit.turn}`}:null,
  optionLabels:{act:`Hablar con los vecinos de ${place}`,open_dialogue:`Llamar a ${rivalName}`,save:'Guardar fuerzas para el cierre'},
  optionSpeeches:{act:own.reply,open_dialogue:`Sigo proponiendo ${own.brief}. ¿Nos sentamos a hablar después de las elecciones?`,
   save:'Hoy no añado otro acto ni otra llamada. Guardo fuerzas para terminar la campaña.'},
  optionIntents:{act:`Intentas llegar a más gente en ${place}. Gastas caja y energía; no haces la llamada.`,
   open_dialogue:'Buscas acercarte al rival y dedicas menos tiempo a explicar tu campaña por el país. Gastas caja y energía; mantienes tu programa.',
   save:'Conservas caja y energía. Dejas pasar este encuentro y esta llamada.'}};
}
