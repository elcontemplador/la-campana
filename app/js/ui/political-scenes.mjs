// Fictional situations tied to the existing effects. No policy or save changes.
import {disciplineFollowup} from './party-discipline.mjs';
import {debateScene} from './debate.mjs';
import {campaignIssue} from './issue-cases.mjs';
import {debateBetScene} from './debate-bet.mjs';
import {promiseThreads} from './promises.mjs';
import {launchStory} from './launch-story.mjs';
import {partyCallStory} from './party-call-story.mjs';
import {economicDilemma} from './economic-dilemma.mjs';
import {publicEncounter} from './public-encounters.mjs';
import {neighbourScene} from './neighbour-questions.mjs';
export const POLITICAL_SCENE_IDS=['E02','E03','E04','E07','E11','E14','E17','E23','E29','E31','E32','E33','E34','E35','E37','E38'];
export function politicalScene(state,bundle,eventId,turn){
 if(!POLITICAL_SCENE_IDS.includes(eventId))return null;
 const encounter=publicEncounter(state,bundle,eventId,turn);if(encounter)return encounter;
 const neighbour=neighbourScene(state,bundle,eventId,turn);if(neighbour)return neighbour;
 if(eventId==='E04'&&['0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion))return economicDilemma(state,bundle,{turn});
 const call=partyCallStory(state,bundle,eventId,turn);if(call)return call;
 const party=id=>bundle.config.parties.find(p=>p.id===id)?.name||id;
 const past=(state.timeline||[]).filter(e=>e.turn<turn);
 const provinceId=past.findLast(e=>e.kind==='plan'&&e.actorId==='candidate'&&e.actionId==='visit')?.target||state.initialSetup.province;
 const place=bundle.provinces.districts.find(p=>p.id===provinceId)?.name||'tu provincia';
 const posture=id=>{const t=bundle.config.topics.find(t=>t.id===id);return t?.poles.find(p=>p.id===state.parties.P1.positions[id])?.label||t?.name||id;};
 const topicName=id=>bundle.config.topics.find(t=>t.id===id)?.name||id;
 const event=bundle.content.events.find(e=>e.id===eventId);
 const result={eventId,turn,provinceId,format:'politics',icon:'mediate',title:'',shortBody:'',body:'',optionLabels:{},optionIntents:{},antecedent:null,speaker:null};
 const scene=(title,shortBody,body,labels,intents)=>Object.assign(result,{title,shortBody,body,optionLabels:labels,optionIntents:intents});
 const issue=(topicId=state.commitments[0],sceneKey=eventId,caseId=null,partyId='P1')=>campaignIssue(state,bundle,{topicId,sceneKey,caseId,provinceId,partyId});
 const reference=e=>e?{entryId:e.id,turn:e.turn,label:`Tu decisión · turno ${e.turn}`} :null;
 const talks=(id,target,caption)=>{
  const prior=past.findLast(e=>(e.actorId!=='candidate'&&e.kind==='plan'&&e.actionId==='mediate'&&e.target===target&&e.changes?.some(c=>c.stat==='relation'&&c.delta>0))
   ||(e.kind==='event'&&e.changes?.some(c=>c.stat==='relation'&&c.target===target&&c.delta>0)));
  result.antecedent=reference(prior);
  result.speaker={kind:'party',id:target,name:party(target),role:'Te propone una conversación'};
  const rival=bundle.config.parties.find(p=>p.id===target);
  const ordered=[...state.commitments,...bundle.config.topics.map(t=>t.id)].filter((t,i,all)=>all.indexOf(t)===i);
  const shared=ordered.find(t=>state.parties.P1.positions[t]===rival.positions[t]);
  const different=ordered.find(t=>state.parties.P1.positions[t]!==rival.positions[t]);
  const own=issue(different||shared||state.commitments[0]);
  const other=issue(own.topicId,eventId,own.id,target);
  const hook={E29:'Un rival quiere hablar contigo de un posible pacto.',E32:'Un rival te llama antes del debate.',
   E35:'Te propone hablar de un posible pacto después de las elecciones.',E38:'Un rival quiere saber si hablarás con su partido después de las elecciones.'}[id];
  scene(caption,`${own.shortSituation} ¿Habláis ahora o reservas la caja para campaña?`,
   `${hook} ${own.situation} ${different?`Tu propuesta: ${own.brief}. Su programa: ${other.brief}.`:`Coincidís en esta propuesta: ${own.brief}.`}${shared&&different?` También coincidís en ${topicName(shared).toLowerCase()}.`:''} Mantienes tu programa. Hablar puede mejorar la relación; los pactos se negocian después del recuento.`,
   {act:`Hablar con ${party(target)}`,save:'Aplazar y guardar la caja'},
   {act:turn>=7?'Mejoras la relación para hablar de pactos después de las urnas. Cuesta dinero; mantienes tu programa.':'Mejoras la relación sin cambiar tu programa. Cuesta dinero que ya no tendrás para la campaña.',save:'Guardas el dinero; la relación no avanza con esta llamada.'});
  result.optionSpeeches={act:own.reply,save:turn>=7?'Primero, las urnas. Hoy reservo fuerzas para el cierre.':'Hablaremos más adelante; hoy mantengo mi agenda.'};
  result.issueId=own.id;
  result.topicId=own.topicId;
  result.publicProposal={partyId:target,proposal:other.brief,agreement:!different};
  if(prior)result.body=`Ya os acercasteis en el turno ${prior.turn}. ${result.body}`;
 };
 switch(eventId){
  case 'E02':{
   const own=issue('T2');
   scene('Los vecinos te esperan; tu partido también',`${own.shortSituation} Los vecinos quieren verte, pero tienes un acto del partido. ¿A cuál vas?`,
   `${own.question} Tu propuesta: ${own.brief}. Mesa Abierta reúne a los afectados. Si vas o envías al equipo, tendrás que responderles antes de las urnas.`,
   {keep_route:'Ir al acto del partido',attend:'Reunirme con los vecinos',delegate:'Enviar al equipo',decline:'No ir a ninguno'},
   {keep_route:'Refuerzas la organización del partido en la provincia. Te cuesta energía.',attend:'Mejoras la relación con los vecinos y prometes una respuesta en el turno 10.',delegate:'El colaborador ocupa su tarea; tendrás que responder a los vecinos en el turno 10.',decline:'No gastas recursos ni prometes una respuesta.'});
   result.optionDetails={keep_route:'Mantienes el acto de tu agrupación. Esta respuesta refuerza la organización local, pero tu jugada en el mapa se elige después.',attend:'Escuchas a los afectados y les prometes explicar tu propuesta antes de las urnas.',delegate:'Un colaborador escucha a los afectados. Ocupa su tarea y te compromete a darles una respuesta antes de las urnas.',decline:'Rechazas el encuentro y no refuerzas la agrupación con esta decisión.'};
   result.optionSpeeches={keep_route:'Hoy voy al acto de mi partido. Allí también nos están esperando.',attend:`${own.reply} Antes de las urnas os explicaré cómo hacerlo.`,
    delegate:'Mi equipo se reunirá con vosotros. Antes de las urnas os daremos una respuesta.',decline:'Hoy no puedo ir. Prefiero decirlo y no dejaros esperando.'};break;
  }
  case 'E03':{
   const own=issue('T2');
   scene(own.title,`${own.shortSituation} Los afectados quieren hablar contigo. ¿Vas, envías al equipo o pides sus preguntas?`,
   `${own.question} Tu propuesta: ${own.brief}. Si te reúnes con ellos o envías al equipo, prometes responder antes de las urnas. Puedes pedir las preguntas sin asumir esa promesa.`,
   {listen:'Reunirme con los afectados',delegate:'Enviar al equipo',receive_written:'Pedir que me envíen sus preguntas'},
   {listen:'Mejoras la relación con los vecinos. Te cuesta energía y prometes una respuesta en el turno 10.',delegate:'Mejoras la relación y prometes responder. El colaborador ocupa su tarea.',receive_written:'Mantienes el contacto. No gastas recursos ni prometes una respuesta.'});
   result.optionDetails={listen:'Escuchas a los afectados en persona. Antes de las urnas tendrás que responder a sus preguntas sobre tu propuesta.',delegate:'El colaborador que elijas se reúne con los afectados. Ocupa su tarea y os compromete a responder antes de las urnas.',receive_written:'Recibes sus preguntas por escrito. Puedes mantener el contacto sin prometer una respuesta para el cierre.'};
   result.optionSpeeches={listen:`${own.reply} Antes de las urnas os explicaré cómo hacerlo.`,delegate:'Mi equipo irá a hablar con vosotros. Os responderemos antes de las urnas.',receive_written:'Enviadme las preguntas. Hoy no puedo prometer cuándo os responderé.'};break;
  }
  case 'E04':{
   const own=issue('T3');
   scene(own.title,`${own.shortSituation} ¿Preparas un plan, se lo pides a Inés o respondes ya?`,
   `${own.question} Tu propuesta: ${own.brief}. Taller Cívico te pregunta: «${own.objection}». Puedes estudiar cómo pagarla, pedir ayuda a Inés o explicar qué no puedes resolver todavía.`,
   {joint_review:'Estudiar cómo pagar mi propuesta',ines_review:'Pedir ayuda a Inés',state_limits:'Explicar lo que aún no puedo resolver'},
   {joint_review:'Trabajas con Taller Cívico en tu propuesta. Gastas energía y prometes responder en el turno 10.',ines_review:'Inés prepara tu respuesta. Cuesta dinero y ocupa su tarea.',state_limits:'No gastas recursos ni sumas preparación. Mantienes el contacto.'});
   result.optionDetails={joint_review:'Trabajas con Taller Cívico en la explicación de tu propuesta. Te comprometes a responder antes de las urnas; no la pones en marcha todavía.',ines_review:'Inés prepara los argumentos y las dificultades de tu propuesta. Ocupa su tarea; no promete una respuesta posterior.',state_limits:'Explicas las dificultades de la propuesta que elegiste al crear la partida. No la cambias ni prometes una entrega.'};
   result.optionSpeeches={joint_review:`${own.reply} Antes de las urnas os explicaré cuánto cuesta.`,ines_review:`Inés, ayúdame a explicar cómo pagaríamos esto: ${own.brief}.`,state_limits:own.limit};break;
  }
  case 'E11':{
   const open=promiseThreads(state,bundle).filter(p=>p.pendingAtTurnStart);
   const names=[...new Set(open.map(p=>bundle.config.civilActors.find(c=>c.id===p.target)?.name||p.target))];
   const prior=past.findLast(e=>open.some(p=>p.entryId===e.id));result.antecedent=reference(prior);
   result.speaker={kind:'civil',id:open[0]?.target||'C1',name:names.length===1?names[0]:'Tus compromisos pendientes',role:'Esperan lo que prometiste'};
   scene('Prometer fue fácil. Hoy toca entregar.',`${names.join(' y ')||'Tus interlocutores'} ${names.length===1?'espera':'esperan'} tus respuestas. ¿Respondes, acuerdas una respuesta más breve o admites que no llegas?`,
    `Siguen abiertas ${open.length} respuestas. Entregar mejora reputación y equipo; renegociar con Saúl reduce el alcance. Admitir el incumplimiento conserva recursos, pero cuesta reputación y cohesión.`,
    {fulfil:'Dar las respuestas prometidas',delegate_fulfil:'Pedir al equipo que responda',reduce_with_saul:'Acordar una entrega más breve',acknowledge_miss:'Admitir que no has cumplido'},
    {fulfil:'Cumples; pagas con caja y energía.',delegate_fulfil:'Cumples; pagas más y ocupas una tarea para conservar energía.',reduce_with_saul:'Saúl acuerda una respuesta más breve; ocupa su tarea.',acknowledge_miss:'Ahorras recursos; queda registrado el incumplimiento.'});
   result.promiseRequests=open.map(p=>({name:p.name,request:p.request,question:p.question,proposal:p.proposal,openedTurn:p.openedTurn,dueTurn:p.dueTurn}));
   result.optionSpeeches={fulfil:'Aquí están las respuestas que comprometí. Explico nuestra propuesta y lo que aún queda por resolver.',
    delegate_fulfil:'El equipo entrega las respuestas que comprometimos. Yo continúo con el cierre de campaña.',
    reduce_with_saul:'Saúl, acordemos una respuesta más breve. Hay que decir con claridad qué queda fuera.',
    acknowledge_miss:'No hemos llegado a entregar lo prometido. No voy a presentar el silencio como una respuesta.'};
   if(['0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)){
    const explained=open.filter(p=>p.explanation);
    if(explained.length){
     const answers=explained.map(p=>p.explanation).join(' '),requests=open.map(p=>p.request).join(' y ');
     const otherAnswers=open.filter(p=>!p.explanation).map(p=>`Entregamos también ${p.delivery}.`).join(' ');
     result.optionSpeeches.fulfil=`Aquí está la explicación que prometí. ${answers}${otherAnswers?' '+otherAnswers:''}`;
     result.optionSpeeches.delegate_fulfil=`El equipo entrega la explicación que prometimos. ${answers}${otherAnswers?' '+otherAnswers:''}`;
     result.optionSpeeches.reduce_with_saul=`Saúl, acordemos una respuesta más breve sobre ${requests}. Digamos qué queda sin explicar.`;
     result.optionSpeeches.acknowledge_miss=`Prometí una respuesta sobre ${requests} y no he llegado. Os debo esa explicación.`;
    }
   }
   break;
  }
  case 'E14':{
   const own=issue(),other=issue(own.topicId,eventId,own.id,'P2');
   scene('¿Tu acto o una foto compartida?',`${party('P2')} propone compartir escenario. ${own.question}`,
   `${own.situation} Tu propuesta: ${own.brief}. Su programa: ${other.brief}. La tarima alcanza para dos; el micrófono ya veremos. Compartir escenario mejora la relación y da alcance local. El acto propio cuesta caja y construye más presencia; el formato pequeño une al equipo y pierde alcance.`,
   {private_venue:'Pagar un acto con tu propio cartel',shared_slot:`Compartir escenario con ${party('P2')}`,small_format:'Reunir al equipo en formato pequeño'},
   {private_venue:'Buscas más presencia local y organización; pagas el espacio.',shared_slot:'Aceptas compartir el foco y acercarte al rival.',small_format:'Priorizas al equipo y ahorras; renuncias a parte del alcance local.'});
   result.optionSpeeches={private_venue:own.reply,shared_slot:'Compartamos el escenario. Explicaré mi propuesta con mis propias palabras.',small_format:'Hagamos el encuentro que podemos sostener. Ya crecerá el cartel.'};break;
  }
  case 'E17':{
   const attacker=past.findLast(e=>e.kind==='rival'&&e.actionId==='contrast'&&e.target==='P1');result.antecedent=reference(attacker);
   const who=attacker?party(attacker.partyId):'Una campaña rival';
   const own=issue();
   scene('¿Le respondes o le cambias la agenda?',`${who} criticó tu propuesta. La prensa pregunta: «${own.question}»`,
    `${own.situation} La réplica preparada busca alcance nacional y consume una ficha. Ada puede responder usando su tarea. Volver a ${place} suma presencia local y cede atención nacional.`,
    {prepared_reply:'Responder con tu argumento preparado',ada_reply:'Dejar la réplica a Ada',own_route:`Volver a la prioridad de ${place}`},
    {prepared_reply:'Respondes en los medios de todo el país; gastas preparación y energía.',ada_reply:'Conservas energía; Ada se ocupa de responder.',own_route:'Das más visibilidad a tu campaña en la provincia, pero pierdes atención en los medios nacionales.'});
   result.optionSpeeches={prepared_reply:own.reply,ada_reply:'Ada, explica nuestra propuesta. Yo sigo con la ruta.',own_route:`Hoy vuelvo a ${place}. No voy a pasarme la campaña contestando al rival.`};break;
  }
  case 'E23':{
   const own=issue(),first=issue(own.topicId,eventId,own.id,'P2'),second=issue(own.topicId,eventId,own.id,'P3');
   scene('La foto de tus posibles socios',`Te invitan con ${party('P2')} y ${party('P3')}. ${own.question}`,
   `${own.situation} Tu propuesta: ${own.brief}. ${party('P2')}: ${first.brief}. ${party('P3')}: ${second.brief}. La foto se hace antes que la mayoría. Acudir da alcance nacional y confianza con ambos. El acto propio da más impulso en ${place} y enfría a ${party('P2')}; el saludo acerca a ${party('P4')}.`,
   {shared_table:'Compartir la mesa y abrir pactos',own_act:'Hacer tu propio acto',written_greeting:`Enviar un saludo a ${party('P4')}`},
   {shared_table:'Aceptas compartir protagonismo y preparar conversaciones.',own_act:'Marcas tu espacio local; te alejas de un posible interlocutor.',written_greeting:'Conservas recursos y abres un contacto más modesto.'});
   result.optionSpeeches={shared_table:'Hablemos de esta propuesta. La foto no nos obliga a pensar igual.',own_act:own.reply,written_greeting:'Envío mi saludo y mantengo mi ruta. Dejemos el contacto abierto.'};break;
  }
  case 'E29':talks(eventId,'P3','Dos carteles. ¿También una conversación?');break;
  case 'E31':{
   const bet=debateBetScene(state,bundle);if(bet)return bet;
   const own=launchStory(state,bundle)?.confirmed?.issue||issue(state.commitments[0],'debate');
   scene('La pregunta que ensayas antes del debate',`En el ensayo: «${own.question}». ¿Preparas la respuesta o guardas recursos?`,
   `${own.situation} ${own.humour} Ensayar te da preparación para Medios y el debate. El máximo es seis fichas. Todavía no hablas ante el público.`,
   {act:'Ensayar cómo defender tu propuesta',save:'Ir con la preparación que ya tienes'},
   {act:'Te preparas para responder; gastas caja y energía.',save:'Guardas recursos; no añades preparación.'});
   result.optionSpeeches={act:own.reply,save:'Voy con lo que ya tengo preparado. Hoy guardo caja y energía.'};result.icon='prepare';break;
  }
  case 'E32':talks(eventId,'P4','«¿Habrá alguien al otro lado del teléfono?»');break;
  case 'E33':{
   const housing=issue('T1'),economy=issue('T3');
   scene('Dos problemas. Un solo micrófono.',`${housing.shortSituation} ${economy.shortSituation} ¿Vivienda o economía?`,
   `${housing.situation} ${economy.situation} Vivienda: «${posture('T1')}». Economía y transición: «${posture('T3')}». Mantienes tus posturas: eliges cuál defender. Cada propuesta puede atraer o alejar público en esta provincia; mira el efecto previsto.`,
   {act:`Vivienda: ${housing.brief}`,energy:`Economía: ${economy.brief}`,save:'No abrir otra intervención'},
   {act:'Defiendes tu postura de vivienda, con su aceptación local.',energy:'Defiendes tu postura económica, con su aceptación local.',save:'Conservas caja y energía; no hay un nuevo impulso temático.'});
   result.optionSpeeches={act:housing.reply,energy:economy.reply,save:'Hoy no abro otro frente. Seguimos con la agenda.'};result.icon='interview';break;
  }
  case 'E34':{
   const followup=disciplineFollowup(state,bundle,{turn});if(followup)return followup;
   const recalls={open_dialogue:'Cerraste ofreciendo diálogo',reaffirm:'Cerraste defendiendo tu prioridad',simple_close:'Cerraste con una frase breve',
    compare_programmes:'Comparaste programas',separate_claims:'Explicaste qué exige acuerdos',acknowledge_limit:'Reconociste un límite',
    full_opening:'Abriste con argumentos',ada_outline:'Ada ordenó tu apertura',brief_opening:'Abriste con una idea breve'};
   const debate=past.findLast(e=>e.kind==='event'&&e.eventId==='E07'&&recalls[e.optionId]
    && bundle.content.events.find(e=>e.id==='E07')?.stages?.some(s=>s.options.some(o=>o.id===e.optionId)));
   result.antecedent=debate?{entryId:debate.id,turn:debate.turn,label:`Tu intervención en el debate · turno ${debate.turn}`} :null;
   const reminder=debate?`${recalls[debate.optionId]} en el debate. `:'';
   const own=launchStory(state,bundle)?.confirmed?.issue||issue(state.commitments[0],'debate');
   scene('Tu respuesta después del debate',`${reminder}La redacción vuelve al caso: «${own.question}»`,
   `${reminder}${own.situation} Si tienes una ficha, esta respuesta la consume y busca alcance nacional. Aplazarla conserva recursos; no deshace el debate.`,
   {act:'Usar una ficha para defender tu argumento',save:'Conservar recursos y seguir tu agenda'},
    {act:'Respondes en los medios nacionales; gastas una ficha de preparación.',save:'No intervienes ahora; conservas los recursos que tienes.'});
   result.optionSpeeches={act:own.reply,save:'El debate ya terminó. Hoy sigo con mi agenda.'};result.icon='interview';break;
  }
  case 'E35':talks(eventId,'P3','Un café antes del recuento');break;
  case 'E37':{
   const own=issue('T1');
   scene('El último boletín todavía tiene un hueco',`Último boletín: ${own.situation} ¿Lo explicas o reservas fuerzas?`,
   `${own.question} ${own.humour} Hablar te da visibilidad en los medios nacionales y cuesta recursos. Rechazar el hueco conserva caja y energía. Tu jugada queda por elegir.`,
   {act:'Defender tu propuesta en el boletín',save:'Rechazar el hueco y reservar recursos'},
   {act:'Hablas de tu propuesta en los medios nacionales.',save:'Reservas recursos para la agenda que elegirás después.'});
   result.optionSpeeches={act:own.reply,save:'Gracias por el hueco. Hoy reservo fuerzas para el cierre.'};result.icon='interview';break;
  }
  case 'E38':talks(eventId,'P4','El teléfono de la noche electoral');break;
  case 'E07':{
   const stages=[
    {title:'Tu propuesta, sin eslogan',shortBody:`«${posture('T1')}»: esa es tu postura en vivienda. La moderación pide una apertura. ¿Argumento preparado, apoyo de Ada o una idea breve?`,body:'La apertura puede aprovechar una ficha ya preparada. Ada puede ordenar la intervención, pero quedará ocupada este turno. La frase breve conserva recursos y da un alcance menor.'},
    {title:'Tu rival te devuelve la pregunta',shortBody:`${party('P2')} pregunta cómo ejecutarías tu propuesta. Puedes comparar programas, explicar qué exige pactar o reconocer un límite.`,body:'Comparar programas consume preparación y da más alcance. Explicar lo que depende de acuerdos gana reputación. Reconocer un límite conserva recursos y mejora reputación, pero pierde alcance.'},
    {title:'¿Tu prioridad o una puerta al acuerdo?',shortBody:`Último minuto: refuerza tu prioridad o abre diálogo con ${party('P2')} y ${party('P3')}. ¿Con qué idea quieres que se queden?`,body:'Reafirmarte usa preparación y da más alcance. Abrir diálogo acerca a dos interlocutores. El cierre breve conserva recursos. Ninguna frase decide todavía los votos de investidura.'},
   ];
   const labels={full_opening:'Defender tu postura con argumentos',ada_outline:'Pedir a Ada que ordene la apertura',brief_opening:'Abrir con una idea breve',separate_claims:'Distinguir lo que harás y lo que pactarás',compare_programmes:'Comparar tu programa con el rival',acknowledge_limit:'Reconocer un límite sin rodeos',reaffirm:'Cerrar defendiendo tu prioridad',open_dialogue:'Cerrar tendiendo una mano',simple_close:'Cerrar con una frase breve'};
   const debate=debateScene(state,bundle);
   Object.assign(result,stages[state.eventStage]||stages[0],{optionLabels:labels,stage:true,icon:'interview'});
   if(debate){result.shortBody=debate.moderatorQuestion;result.body=`Tu postura en ${debate.topicName.toLowerCase()}: «${debate.playerPosition}». ${debate.rivalName} defiende «${debate.rivalPosition}». ${result.body}`;result.optionIntents=debate.optionIntents;}
   break;
  }
 }
 if(!result.title)return null;
 if(['E02','E03','E04'].includes(eventId)){
  const id=['E02','E03'].includes(eventId)?'C1':'C2';
  result.speaker={kind:'civil',id,name:bundle.config.civilActors.find(c=>c.id===id)?.name||id,role:'Te pide una respuesta'};
 }else if(['E14','E23'].includes(eventId))result.speaker={kind:'party',id:'P2',name:party('P2'),role:eventId==='E14'?'Compartiríais el escenario':'Posible interlocutor tras las urnas'};
 else if(eventId==='E17'){
  const attacker=past.findLast(e=>e.kind==='rival'&&e.actionId==='contrast'&&e.target==='P1');
  result.speaker=attacker?{kind:'party',id:attacker.partyId,name:party(attacker.partyId),role:'Ha contrastado contigo'}:{kind:'press',id:'press',name:'La réplica del boletín',role:'Te piden que respondas'};
 }else if(['E34','E37'].includes(eventId))result.speaker={kind:'press',id:'press',name:'La redacción',role:'Te ofrece el siguiente titular'};
 else if(eventId==='E33')result.speaker={kind:'public',id:'public',name:`Preguntas en ${place}`,role:'Dos temas; una intervención'};
 else if(eventId==='E31')result.speaker={kind:'press',id:'press',name:'La moderación del debate',role:'Anticipa una pregunta a tu programa'};
 // Aliases must name actual choices. The narrative cannot add a hidden decision.
 const ids=new Set([event,...(event?.stages||[])].flatMap(e=>e?.options||[]).map(o=>o.id));
 for(const key of Object.keys(result.optionLabels))if(!ids.has(key))delete result.optionLabels[key];
 for(const key of Object.keys(result.optionIntents))if(!ids.has(key))delete result.optionIntents[key];
 for(const key of Object.keys(result.optionSpeeches||{}))if(!ids.has(key))delete result.optionSpeeches[key];
 return result;
}
