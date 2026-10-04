import {resolveCampaignBundle} from '../core/campaign.mjs';
import {politicalScene, POLITICAL_SCENE_IDS} from './political-scenes.mjs';
import {eventLimitDescriptions} from './event-limits.mjs';
import {pressScene, PRESS_SCENE_IDS} from './press-scenes.mjs';
import {fieldScene, FIELD_SCENE_IDS} from './field-scenes.mjs';
import {campaignIssue} from './issue-cases.mjs';
import {launchStory} from './launch-story.mjs';
import {closingScene} from './closing-scene.mjs';
import {campaignTeamScene} from './campaign-team-scenes.mjs';

// Narration uses past, confirmed entries. Drafts, polls and hidden rivals are absent.
export function eventStory(state, originalBundle, {eventId = state?.activeEvent, turn = state?.turn} = {}) {
  if (!state || !['E13','E25','E27','E28','E30','E36',...POLITICAL_SCENE_IDS,...PRESS_SCENE_IDS,...FIELD_SCENE_IDS].includes(eventId)) return null;
  if (!(eventId === state.activeEvent && turn === state.turn)
    && !(state.timeline || []).some(e => e.kind === 'event' && e.eventId === eventId && e.turn === turn)) return null;
  const bundle = resolveCampaignBundle(originalBundle, state);
  if (!bundle.content.events.some(e => e.id === eventId && e.turn === turn)) return null;
  if(eventId==='E36'&&['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion))return closingScene(state,bundle,turn);
  if(['E27','E30'].includes(eventId)&&['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion))return campaignTeamScene(state,bundle,eventId,turn);
  if (FIELD_SCENE_IDS.includes(eventId)) return fieldScene(state,bundle,eventId,turn);
  if (PRESS_SCENE_IDS.includes(eventId)) return pressScene(state,bundle,eventId,turn);
  if (POLITICAL_SCENE_IDS.includes(eventId)) return politicalScene(state,bundle,eventId,turn);
  const currentEdition=['0.8.3','0.8.4','0.8.5'].includes(state.rulesVersion)&&['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion);
  const past = (state.timeline || []).filter(e => e.turn < turn
    &&(!currentEdition||(Number.isSafeInteger(e.turn)&&e.turn>0&&typeof e.id==='string'&&e.id.length>0&&(!e.partyId||e.partyId==='P1'))));
  const visits = past.filter(e => e.kind === 'plan' && e.actorId === 'candidate' && e.actionId === 'visit');
  const visit = visits.at(-1);
  const provinceId = visit?.target || state.initialSetup.province;
  const place = bundle.provinces.districts.find(p => p.id === provinceId)?.name;
  if (!place) return null;
  const localWork = past.findLast(e => (e.changes || []).some(c => c.stat === 'organization'
    && c.target === provinceId && c.delta > 0));
  const radio = past.findLast(e => e.kind === 'event' && ['E13','E28'].includes(e.eventId));
  const staff = id => bundle.config.staff.find(s => s.id === id)?.name || 'Tu equipo';
  const event=bundle.content.events.find(e=>e.id===eventId),available=new Set(event.options.map(o=>o.id));
  const priority=(state.commitments||[]).find(id=>bundle.config.topics.some(t=>t.id===id))||bundle.config.topics[0].id;
  const issue=campaignIssue(state,bundle,{topicId:priority,sceneKey:eventId,provinceId});
  const shortCase=question=>{
    const full=`${issue.situation} ${question}`;
    return full.length<=180?full:`${issue.title}. ${question}`;
  };
  const reference = (entry, label) => entry ? {entryId: entry.id, turn: entry.turn, label} : null;
  const visitRef = reference(visit, `Tu visita a ${place} · turno ${visit?.turn}`);
  const visitText = visit ? `Tu última visita fue a ${place}, en el turno ${visit.turn}.` : `Tu campaña parte de ${place}.`;
  const result = {eventId, turn, provinceId, format: 'territory', icon: 'organize', title: '', shortBody: '',
    body: '', optionLabels: {}, optionIntents: {}, optionSpeeches:{}, issueId:issue?.id, antecedent: visitRef};
  if (eventId === 'E27') {
    result.title = `Voluntarios en ${place}`;
    result.shortBody = `${visitText} Los voluntarios necesitan dinero para trabajar. ¿Se lo das o lo guardas?`;
    result.optionLabels = {act: `Dejar un equipo en ${place}`, save: 'No gastar ahora'};
    result.optionIntents={act:'Pagas el trabajo de los voluntarios. Ese dinero ya no podrás gastarlo en otra cosa.',save:'No gastas dinero ni añades voluntarios.'};
    result.body = `${visitText} El equipo local puede seguir trabajando mientras haces campaña en otro sitio. Darles dinero no elige tu próxima visita.`;
    if(available.has('take_airtime')){
      result.shortBody=shortCase(`¿Dejas voluntarios en ${place} o respondes por radio?`);
      result.optionLabels.take_airtime='Responder por radio';
      result.optionSpeeches.take_airtime=issue.reply;
      result.optionIntents.take_airtime='Explicas tu propuesta por radio de todo el país. Gastas dinero y energía; no añades voluntarios.';
      result.body=`${visitText} ${issue.situation} Lola pregunta: «${issue.question}» Puedes pagar el trabajo de los voluntarios o explicar tu propuesta por radio. Después eliges tu jugada.`;
    }
  } else if (eventId === 'E30') {
    result.format = 'team';
    result.title = localWork ? `Más voluntarios en ${place}` : `Las llaves del local de ${place}`;
    result.shortBody = localWork ? `En el turno ${localWork.turn} dejaste voluntarios en ${place}. ¿Buscas más gente o guardas el dinero?`
      : `Hay un local para los voluntarios en ${place}. ¿Pagas su trabajo o guardas el dinero?`;
    result.antecedent = localWork ? reference(localWork, `${localWork.actorId && localWork.actorId !== 'candidate' ? staff(localWork.actorId) + ' · ' : ''}Voluntarios en ${place} · turno ${localWork.turn}`) : visitRef;
    result.optionLabels = {act: localWork ? `Ampliar el equipo en ${place}` : `Montar un equipo en ${place}`, save: 'No gastar ahora'};
    result.optionIntents={act:'Pagas el trabajo de los voluntarios; ese dinero no irá a ensayar tu respuesta.',save:'No gastas dinero. Tampoco añades voluntarios ni ensayas.'};
    result.body = `${result.shortBody} Los voluntarios trabajan hasta que termine la campaña. Puedes guardar el dinero ahora y gastarlo después, al elegir tu jugada.`;
    if(available.has('rehearse')){
      result.shortBody=`${localWork?`Ya dejaste voluntarios en ${place}.`:`Hay voluntarios en ${place}.`} ¿Buscas más gente o ensayas la entrevista?`;
      result.optionLabels.rehearse='Ensayar mi respuesta con el equipo';
      result.optionSpeeches.rehearse=`Vamos a ensayar la respuesta: ${issue.reply}`;
      result.optionIntents.rehearse='Ensayas tu respuesta. Pagas y ocupas a un colaborador; no podrá hacer otra tarea. No añades voluntarios.';
      result.body=`${issue.situation} Te van a preguntar: «${issue.question}» Puedes ensayar la respuesta con una persona del equipo o pagar el trabajo de los voluntarios en ${place}. Después eliges tu jugada.`;
    }
  } else if (eventId === 'E36') {
    result.format = 'closing'; result.icon = 'visit';
    result.title = `Quedan dos turnos: ${place}`;
    result.shortBody = `${visitText} Quedan dos turnos. ¿Explicas tu propuesta a sus vecinos o guardas el dinero y la energía?`;
    result.optionLabels = {act: `Explicar mi propuesta en ${place}`, save: 'No gastar ahora'};
    result.optionIntents={act:'Intentas convencer a los vecinos. Gastas dinero y energía.',save:'No gastas dinero ni energía. Dejas pasar esta ocasión de explicar tu propuesta.'};
    result.body = `${visitText} Quedan dos turnos para hacer campaña. Puedes dedicar dinero y tiempo a explicar tu propuesta a los vecinos de ${place}. Después eliges tu jugada.`;
    if(available.has('open_dialogue')){
      const rival=bundle.config.parties.find(p=>p.id==='P2').name;
      result.shortBody=`Quedan dos turnos. ¿Explicas tu propuesta en ${place} o llamas al ${rival} para preparar un acuerdo?`;
      result.optionLabels.open_dialogue=`Llamar al ${rival}`;
      result.optionSpeeches.open_dialogue=`Mi propuesta es ${issue.brief.toLowerCase()}. ¿Podemos hablar de un acuerdo después de las elecciones?`;
      result.optionIntents.open_dialogue='Pagas la conversación con ese partido y dedicas menos tiempo a explicar tu campaña por el país. No cambias tu programa.';
      result.body=`${issue.situation} Puedes explicar tu propuesta a los vecinos de ${place} o llamar al ${rival}. La llamada busca mejorar la relación, pero no asegura su voto. Después eliges tu jugada.`;
    }
  } else {
    result.format = 'radio'; result.icon = 'interview';
    result.speaker={kind:'press',id:'radio',name:'Lola',role:'Te pregunta en antena'};
    if (eventId === 'E13') {
      result.antecedent = null;
      result.title = issue.title;
      result.shortBody = shortCase(`Lola pregunta: «${issue.question}»`);
      result.optionLabels={candidate_live:'Responder yo en directo',ada_live:'Que responda Ada',keep_schedule:'Seguir con mi agenda'};
      result.optionSpeeches={candidate_live:issue.reply,ada_live:`Ada, explica nuestra propuesta: ${issue.brief}.`,keep_schedule:'Hoy sigo con mi agenda. Esta vez no entraré en la radio.'};
      result.optionIntents={candidate_live:'Explicas tu propuesta y das la cara. Gastas dinero y energía.',ada_live:'Ada responde por ti. No gastas energía, pero ella no podrá hacer otra tarea.',keep_schedule:'No gastas dinero ni energía. El equipo sigue disponible; hoy no respondéis en radio.'};
      result.body = `${issue.situation} ${issue.humour} ${issue.objection} ${issue.limit} Puedes responder tú o enviar a Ada. Si va ella, no podrá hacer otra tarea este turno.`;
    } else {
      const declined = radio && ['save','keep_schedule'].includes(radio.optionId);
      const previous = !radio ? '' : declined ? `En el turno ${radio.turn} conservaste la agenda.`
        : radio.reservedStaff ? `${staff(radio.reservedStaff)} habló en radio en el turno ${radio.turn}.`
        : `Hablaste en radio en el turno ${radio.turn}.`;
      result.antecedent = reference(radio, `Tu decisión en radio · turno ${radio?.turn}`);
      if (eventId === 'E28') {
        result.title = radio ? 'Lola vuelve a llamar' : issue.title;
        result.shortBody = shortCase(`Lola pregunta: «${issue.question}»`);
        result.optionLabels = {act: 'Responder por radio', save: 'Seguir con mi agenda'};
        result.optionSpeeches={act:issue.reply,save:'Hoy no entraré en la radio. Sigo con mi agenda.'};
        result.optionIntents={act:'Explicas tu propuesta por radio. Gastas dinero y energía.',save:'No gastas dinero ni energía. Dejas la pregunta sin responder.'};
      } else {
        result.title = 'La última entrevista';
        result.shortBody = shortCase(`Lola pregunta: «${issue.question}»`);
        result.optionLabels={first_commitment:'Explicar mi propuesta',ada_last_interview:'Preparar la respuesta con Ada',brief_answer:'Dar una respuesta breve'};
        result.optionSpeeches={first_commitment:issue.reply,ada_last_interview:`Ada, ayúdame a explicar mi propuesta: ${issue.brief.toLowerCase()}.`,brief_answer:`Propongo ${issue.brief.toLowerCase()}. No daré una fecha que no pueda cumplir.`};
        result.optionIntents={first_commitment:'Das una respuesta completa. Gastas energía y una ficha de preparación.',ada_last_interview:'Ada te prepara la respuesta. Pagas, gastas menos energía y ella no podrá hacer otra tarea.',brief_answer:'No gastas recursos. Admitir lo que no sabes mejora tu reputación, pero tu respuesta llega a menos gente.'};
      }
      result.body = `${previous}${previous?' ':''}${issue.situation} ${issue.humour} ${issue.objection} ${issue.limit}`;
    }
  }
  // Revisit only a case actually answered in a confirmed earlier radio entry.
  // Reconstruct that entry's own presentation; a declined call is no statement.
  if(currentEdition&&['E28','E25'].includes(eventId)){
    const aired={E13:['candidate_live'],E28:['act'],E27:['take_airtime']};
    let earlierRadio=null;
    for(const entry of [...past].reverse()){
      if(entry.kind!=='event'||!aired[entry.eventId]?.includes(entry.optionId))continue;
      const story=eventStory(state,bundle,{eventId:entry.eventId,turn:entry.turn});
      if(story?.issueId!==issue.id)continue;
      const speech=story.optionSpeeches?.[entry.optionId];
      if(speech){earlierRadio={entry,speech};break;}
    }
    if(earlierRadio){
      const {entry,speech}=earlierRadio;
      result.antecedent=reference(entry,`Tu respuesta en radio · turno ${entry.turn}`);
      result.shortBody=shortCase(`Lola insiste: «${issue.objection}»`);
      result.body=`En el turno ${entry.turn} respondiste en radio: «${speech}» Lola vuelve al mismo caso: «${issue.objection}» ${issue.situation} Hoy toca explicar qué dificultad tiene tu propuesta.`;
      const response=`Mantengo mi propuesta de ${issue.brief}. ${issue.limit}`;
      if(eventId==='E28')result.optionSpeeches.act=response;
      else{
        result.optionSpeeches.first_commitment=response;
        result.optionSpeeches.ada_last_interview=`Ada, preparemos cómo responder a esto: ${issue.objection}`;
        result.optionSpeeches.brief_answer=issue.limit;
      }
    }
  }
  const opening=['0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)?launchStory(state,bundle)?.confirmed:null;
  if(opening?.issue?.id===issue.id&&opening.topicId===issue.topicId&&opening.turn<turn){
    let continued=false;
    for(const [id,speech] of Object.entries(result.optionSpeeches))if(speech===issue.reply){
      result.optionSpeeches[id]=`Ya lo anuncié al empezar: ${issue.brief}. La dificultad es esta: ${issue.limit}`;
      continued=true;
    }
    if(continued){
      result.body=`Anunciaste esta propuesta en el turno ${opening.turn}. Hoy te preguntan por sus dificultades. ${result.body}`;
      if(!result.antecedent)result.antecedent=opening.antecedent;
    }
  }
  return result;
}

// getEventView provides strings, including the computed direction of topic_support.
// Keep that direction; do not expose internal attractiveness as poll points.
export function eventConsequences(option, state, originalBundle, {omitPreparation=false} = {}) {
  const bundle = resolveCampaignBundle(originalBundle, state);
  const place = bundle.provinces.districts.find(p => p.id === state.focusProvince)?.name || 'tu provincia';
  const descriptions = eventLimitDescriptions(option, state, originalBundle);
  return descriptions.filter(text=>!omitPreparation||!/^Preparación(?:\s|:)/.test(text)).map(text => {
    const support = /^Atractivo (nacional|local) ([+−-]?\d+)$/.exec(text);
    if (support) return `${Number(support[2].replace('−','-')) === 0 ? 'Sin cambio de' : /^[−-]/.test(support[2]) ? 'Menos' : 'Más'} alcance ${support[1] === 'nacional' ? 'nacional' : `en ${place}`}`;
    if (text === 'Organización local +1') return state.parties.P1.organization[state.focusProvince] >= bundle.config.resources.organization.max
      ? `Voluntarios en ${place}: ya al máximo` : `Voluntarios en ${place} +1`;
    return text;
  }).join(' · ') || 'Sin cambios adicionales de recursos';
}
