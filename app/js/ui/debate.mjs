// Political presentation of E07. All consequences remain in the engine and log.
import {resolveCampaignBundle} from '../core/campaign.mjs';
import {debateOutcome} from './experience.mjs';
import {campaignIssue} from './issue-cases.mjs';
import {launchStory} from './launch-story.mjs';
import {hasV07Features} from '../core/topic-effects.mjs';
import {debateBet} from '../core/debate-bet.mjs';
import {debateBetIssue,debateBetReminder} from './debate-bet.mjs';

const STAGES = ['Apertura', 'Réplica', 'Cierre'];

function context(state, sourceBundle) {
  if (!state || !['event', 'planning', 'debrief'].includes(state.phase)) return null;
  const bundle = resolveCampaignBundle(sourceBundle, state);
  const event = bundle.content.events.find(e => e.id === 'E07');
  if (event?.stages?.length !== 3) return null;
  const entries = (state.timeline || []).filter(e => e.turn === state.turn && e.kind === 'event' && e.eventId === 'E07');
  if (entries.some((e, i) => !event.stages[i]?.options.some(o => o.id === e.optionId))) return null;
  if (state.phase === 'event') {
    if (state.activeEvent !== 'E07' || !Number.isInteger(state.eventStage)
      || state.eventStage < 0 || state.eventStage > 2 || entries.length !== state.eventStage) return null;
  } else if (!debateOutcome(state, sourceBundle)) return null;
  return {bundle, event, entries};
}

function publicProgramme(state, bundle, stage) {
  const topics = bundle.config.topics, player = state.parties.P1.positions;
  const rival = bundle.config.parties.find(p => p.id === 'P2');
  const priorities = (state.commitments || []).filter(id => topics.some(t => t.id === id));
  const priority = priorities[0] || topics[0].id;
  const launch = launchStory(state, bundle)?.confirmed;
  const ordered = [...priorities, ...topics.map(t => t.id)].filter((id, i, ids) => ids.indexOf(id) === i);
  const bet=debateBet(state);
  const focusedBet=bet&&(bet.kind!=='second_priority'||stage!==1);
  const topicId = focusedBet?priorities[bet.topicIndex]:stage === 1 ? ordered.find(id => player[id] !== rival.positions[id]) || priority
    : launch?.topicId || priority;
  const topic = topics.find(t => t.id === topicId);
  const position = value => topic.poles.find(p => p.id === value)?.label || topic.name;
  const issue = focusedBet?debateBetIssue(state,bundle,bet.topicIndex):launch?.topicId === topicId ? launch.issue
    : campaignIssue(state,bundle,{topicId,sceneKey:'debate'});
  const opponent=campaignIssue(state,bundle,{topicId,caseId:issue.id,partyId:'P2'});
  return {topicId, topicName: topic.name, playerPosition: position(player[topicId]),issue,opponent,launch,
    rivalPosition: position(rival.positions[topicId]), rivalId: 'P2', rivalName: rival.name,
    agrees: player[topicId] === rival.positions[topicId]};
}

function speeches(programme, stage, previous) {
  const {rivalName, agrees, issue, opponent} = programme;
  if (stage === 0) return {
    full_opening: issue.reply,
    ada_outline: `Propongo ${issue.brief.toLowerCase()}. Explicaré lo que cuesta y lo que no puedo prometer.`,
    brief_opening: `Mi propuesta es ${issue.brief.toLowerCase()}. Empiezo por eso.`,
  };
  if (stage === 1) return {
    separate_claims: `${issue.brief.charAt(0).toUpperCase() + issue.brief.slice(1)}. ${issue.limit}`,
    compare_programmes: agrees
      ? `Coincidimos en ${issue.brief.toLowerCase()}. Expliquemos cuánto cuesta y cómo lo vamos a pagar.`
      : `Propongo ${issue.brief.toLowerCase()}. ${rivalName} propone ${opponent.brief.toLowerCase()}. Son caminos distintos.`,
    acknowledge_limit: `Mi propuesta es ${issue.brief.toLowerCase()}, pero no voy a prometer que lo resuelvo mañana.`,
  };
  const lead = previous?.optionId === 'compare_programmes' ? 'Después de comparar nuestras propuestas'
    : previous?.optionId === 'separate_claims' ? 'Sin prometer lo que no puedo hacer solo' : 'Sabiendo lo que no puedo prometer';
  return {
    reaffirm: `${lead}, defenderé ${issue.brief.toLowerCase()}. Por eso pido vuestro apoyo.`,
    open_dialogue: `Buscaré acuerdos sobre ${issue.brief.toLowerCase()}. Hablar no significa aceptar todo lo que pidan.`,
    simple_close: `Mi propuesta es ${issue.brief.toLowerCase()}. Eso es lo que quiero hacer.`,
  };
}

const INTENTS = {
  full_opening: 'Gastas una ficha y energía para explicar tu propuesta y llegar a más gente.',
  ada_outline: 'Ada prepara tu respuesta y añade preparación; ocupa su tarea de este turno.',
  brief_opening: 'No gastas energía ni fichas. Das una explicación más corta.',
  separate_claims: 'Explicas qué puedes prometer: ganas reputación y alcance, a cambio de energía.',
  compare_programmes: 'Usas una ficha y energía para explicar la diferencia y llegar a más gente.',
  acknowledge_limit: 'Ganas reputación y conservas recursos; cedes parte del alcance.',
  reaffirm: 'Usas una ficha y energía; refuerzas alcance y cohesión.',
  open_dialogue: 'Gastas energía para buscar acuerdos con dos partidos. Hablar no cierra un pacto.',
  simple_close: 'No gastas recursos. Terminas con una explicación más corta.',
};

export function debateScene(state, sourceBundle) {
  const ctx = context(state, sourceBundle);
  if (!ctx) return null;
  const stage = state.phase === 'event' ? state.eventStage : 2;
  const programme = publicProgramme(state, ctx.bundle, stage);
  const previous = stage > 0 ? ctx.entries[stage - 1] : null;
  let moderatorQuestion = `${programme.issue.shortSituation} ${programme.issue.question}`;
  if (stage === 0 && programme.launch?.issue&&programme.launch.topicId===programme.topicId&&programme.launch.issue.id===programme.issue.id)
    moderatorQuestion = `Abriste con ${programme.launch.subject}. ${programme.issue.objection} ¿Cómo lo harás?`;
  let rivalLine = programme.opponent.reply;
  if (stage === 1) {
    moderatorQuestion = programme.agrees ? 'Proponéis lo mismo. ¿Qué harías primero?'
      : `${programme.issue.shortSituation} ${programme.issue.objection}`;
    const request = previous.optionId === 'ada_outline' ? 'Has presentado tu propuesta. Ahora dime qué harías primero.'
      : previous.optionId === 'brief_opening' ? 'Has dado una respuesta corta. Explica qué harías primero.'
      : 'Has explicado tu propuesta. ¿Por dónde empezarías?';
    rivalLine = programme.agrees ? `Coincidimos en ${programme.opponent.brief.toLowerCase()}. ${request}`
      : `Propongo ${programme.opponent.brief}. ${request}`;
  } else if (stage === 2) {
    moderatorQuestion = previous.optionId === 'compare_programmes' ? 'Habéis comparado propuestas. ¿Mantienes la tuya o propones hablar con otros partidos?'
      : previous.optionId === 'separate_claims' ? 'Has explicado lo que no puedes hacer solo. ¿Mantienes tu propuesta o buscas un acuerdo?'
      : 'Has reconocido lo que no puedes prometer. ¿Con qué propuesta terminas?';
    if (programme.launch?.issue&&!debateBet(state)) moderatorQuestion = previous.optionId === 'compare_programmes'
      ? `Abriste con ${programme.launch.subject}. Tras comparar propuestas, ¿lo reafirmas o buscas acuerdos?`
      : previous.optionId === 'separate_claims'
      ? `Abriste con ${programme.launch.subject}. Has explicado tus límites. ¿Reafirmas la propuesta o buscas acuerdos?`
      : `Abriste con ${programme.launch.subject}. Ya has reconocido tus límites. ¿Con qué propuesta terminas?`;
    rivalLine = previous.optionId === 'compare_programmes' ? 'Ya sabemos qué propone cada uno. Di con qué propuesta te presentas.'
      : previous.optionId === 'separate_claims' ? 'Si necesitas un acuerdo, ¿con qué partidos hablarías?'
      : 'No puedes hacerlo todo. ¿Qué sí propones?';
  }
  const optionSpeeches = speeches(programme, stage, previous);
  const optionIntents=Object.fromEntries(Object.keys(optionSpeeches).map(id=>[id,INTENTS[id]]));
  const bet=debateBetReminder(state,ctx.bundle,stage);
  if(stage===1&&hasV07Features(ctx.bundle.config.rulesVersion)){
    const challenging=ctx.entries[0]?.optionId==='full_opening';
    optionIntents.compare_programmes=challenging
      ?'Comparas con más dureza para llegar a más gente, pero enfrías la relación con tu rival. Usas una ficha y energía.'
      :bet?.kind==='challenge'?'Explicas la diferencia: alcance y reputación. Usas una ficha y energía; tu apuesta intenta llegar a más gente, pero enfría la relación.'
      :'Explicas la diferencia: alcance y reputación. Usas una ficha y energía, sin enfriar la relación.';
    rivalLine=challenging?`Propongo ${programme.opponent.brief}. ${programme.issue.objection} ¿Vas a comparar las propuestas?`:rivalLine;
  }
  if(stage>0&&publicProgramme(state,ctx.bundle,stage-1).topicId!==programme.topicId){
    moderatorQuestion=`${stage===1?'Otra pregunta:':'Volvamos a tu prioridad.'} ${moderatorQuestion}`;
  }
  if(bet?.active){
    if(bet.kind==='challenge'&&ctx.entries[0]?.optionId==='full_opening')optionIntents.compare_programmes+=' Tu apuesta puede añadir más alcance y enfriar un punto más la relación.';
    if(bet.kind==='dialogue')optionIntents.open_dialogue+=' Tu apuesta puede acercarte un punto más a este rival.';
    if(bet.kind==='second_priority')for(const id of ['full_opening','ada_outline'])optionIntents[id]+=' Tu apuesta puede añadir alcance a esta apertura.';
  }
  return {topicId: programme.topicId, topicName: programme.topicName, issueId:programme.issue.id, proposal:programme.issue.brief, playerPosition: programme.playerPosition,
    rivalPosition: programme.rivalPosition, rivalId: programme.rivalId, rivalName: programme.rivalName,
    moderatorQuestion, rivalLine, stageTitles: [...STAGES], stage, optionSpeeches,
    optionIntents,bet,
    previousLine: previous ? speeches(publicProgramme(state, ctx.bundle, stage - 1), stage - 1, ctx.entries[stage - 2])[previous.optionId] : null,
    previousEntryId: previous?.id || null,
    ...(['0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion) ? {antecedent: programme.launch?.antecedent || null,
      launchEntryId: programme.launch?.entryId || null, launchTopicId: programme.launch?.topicId || null,
      launchIssueId: programme.launch?.issue?.id || null} : {})};
}

export function debateRecap(state, sourceBundle) {
  const outcome = debateOutcome(state, sourceBundle), ctx = context(state, sourceBundle);
  if (!outcome || !ctx || ctx.entries.length !== 3) return null;
  const spentReadiness = ctx.entries.flatMap(e => e.changes || [])
    .filter(c => c.stat === 'readiness' && c.delta < 0).reduce((sum, c) => sum - c.delta, 0);
  const spentEnergy = ctx.entries.flatMap(e => e.changes || [])
    .filter(c => c.stat === 'energy' && c.delta < 0).reduce((sum, c) => sum - c.delta, 0);
  const delegatedStaff = ctx.entries.filter(e => e.reservedStaff).map(e => ({id: e.reservedStaff,
    name: ctx.bundle.config.staff.find(s => s.id === e.reservedStaff)?.name || e.reservedStaff, entryId: e.id, turn: e.turn}));
  const dialoguePartners = outcome.benefits.filter(c => c.stat === 'relation' && c.delta > 0)
     .map(c => ({id: c.target, name: ctx.bundle.config.parties.find(p => p.id === c.target)?.name || c.target, delta: c.delta}));
  const partnerNames = new Intl.ListFormat('es', {style: 'long', type: 'conjunction'})
    .format(dialoguePartners.map(partner => partner.name));
  const gainedReach = [...outcome.benefits, ...outcome.tradeoffs]
    .filter(change => change.stat === 'support').reduce((total, change) => total + change.delta, 0) > 0;
  const dialogueLabel = dialoguePartners.length === 1 ? 'conversación abierta' : 'conversaciones abiertas';
  const moments = ctx.entries.map((e, stage) => ({stage: STAGES[stage], optionId: e.optionId,
    label: speeches(publicProgramme(state, ctx.bundle, stage), stage, ctx.entries[stage - 1])[e.optionId], entryId: e.id, turn: e.turn}));
  const clarified = ctx.entries[1].optionId === 'separate_claims';
  const headline = dialoguePartners.length ? `${gainedReach ? 'Más alcance y ' : ''}${gainedReach ? dialogueLabel : dialogueLabel[0].toUpperCase() + dialogueLabel.slice(1)} con ${partnerNames}`
    : spentReadiness ? 'La preparación llegó al atril' : delegatedStaff.length ? 'El equipo sostuvo tu apertura'
    : clarified ? 'Explicaste qué depende de acuerdos'
    : spentEnergy ? 'Cerraste defendiendo tu programa' : 'Cerraste el debate conservando recursos';
  const own = publicProgramme(state, ctx.bundle, 0).issue.brief.toLowerCase();
  const detail = dialoguePartners.length ? `Abriste ${dialoguePartners.length === 1 ? 'una conversación' : 'conversaciones'} con ${partnerNames}; aún no hay pacto.`
    : spentReadiness ? `Usaste ${spentReadiness} ${spentReadiness === 1 ? 'ficha' : 'fichas'} de preparación.`
    : delegatedStaff.length ? `${delegatedStaff[0].name} dedicó su tarea a la apertura.`
    : clarified ? 'Separaste tu propuesta de lo que exige negociar.'
    : spentEnergy ? `Gastaste ${spentEnergy} de energía; el balance muestra el alcance conseguido.`
    : 'No gastaste energía ni fichas en las tres intervenciones.';
  const launch = publicProgramme(state, ctx.bundle, 0).launch;
  return {headline, summary: `Defendiste «${own}». ${gainedReach ? 'Tu mensaje ganó alcance. ' : ''}${detail}`,
    moments, spentReadiness, delegatedStaff, dialoguePartners,
    ...(['0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion) ? {antecedent: launch?.antecedent || null,
      launchEntryId: launch?.entryId || null, launchTopicId: launch?.topicId || null,
      launchIssueId: launch?.issue?.id || null} : {})};
}
