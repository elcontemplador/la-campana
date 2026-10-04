// Presentation of existing field decisions, using the player's recorded past.
import {partyDiscipline} from './party-discipline.mjs';
import {campaignIssue} from './issue-cases.mjs';
import {economicDilemma} from './economic-dilemma.mjs';
import {promiseThreads} from './promises.mjs';
import {briefingScene} from './briefing-scene.mjs';
export const FIELD_SCENE_IDS = Object.freeze(['E05', 'E08', 'E10', 'E12', 'E18', 'E24', 'E26']);

const publicPhases = new Set(['debrief', 'election', 'negotiation', 'ending']);

export function fieldScene(state, bundle, eventId, turn) {
  if (!state || !FIELD_SCENE_IDS.includes(eventId) || !Number.isInteger(turn)
    || turn < 1 || turn > state.turn) return null;
  if(eventId==='E05'&&['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion))return partyDiscipline(state,bundle,{turn});
  const event = bundle.content.events.find(e => e.id === eventId && e.turn === turn);
  if (!event?.options?.length) return null;
  const cutoff = publicPhases.has(state.phase) ? state.turn : state.turn - 1;
  const past = (state.timeline || []).filter(e => e && Number.isInteger(e.turn)
    && e.turn > 0 && e.turn < turn && e.turn <= cutoff && typeof e.id === 'string' && e.id.length
    && ['plan', 'event'].includes(e.kind) && (!e.partyId || e.partyId === 'P1'));
  const district = id => bundle.provinces.districts.find(d => d.id === id);
  const visit = past.findLast(e => e.kind === 'plan' && e.actorId === 'candidate'
    && e.actionId === 'visit' && district(e.target));
  const provinceId = visit?.target || state.initialSetup?.province;
  const place = district(provinceId)?.name;
  if (!place) return null;
  const localWork = past.findLast(e => (e.changes || []).some(c => c.stat === 'organization'
    && c.target === provinceId && Number.isFinite(c.delta) && c.delta > 0));
  const research = past.findLast(e => e.kind === 'plan' && e.actionId === 'research' && e.target === provinceId);
  const contact = past.findLast(e => e.kind === 'plan' && e.actionId === 'outreach' && e.target === 'C2'
    || e.kind === 'event' && ((e.changes || []).some(c => c.stat === 'rapport' && c.target === 'C2')
      || bundle.content.events.find(source => source.id === e.eventId)?.options
        ?.find(option => option.id === e.optionId)?.effects
        ?.some(effect => effect.type === 'flag' && effect.flag === 'c2Contact' && effect.value === true)));
  const topic = id => bundle.config.topics.find(t => t.id === id);
  const priority = (state.commitments || []).find(id => topic(id)) || bundle.config.topics[0]?.id;
  const posture = id => topic(id)?.poles.find(p => p.id === state.parties.P1.positions?.[id])?.label
    || topic(id)?.name || 'tu propuesta';
  const own = campaignIssue(state, bundle, {topicId: priority, sceneKey: eventId, provinceId})?.brief || posture(priority);
  const civil = bundle.config.civilActors.find(c => c.id === 'C2')?.name || 'Taller Cívico';
  const reference = (entry, label) => entry ? {entryId: entry.id, turn: entry.turn, label} : null;
  const localReference = localWork
    ? reference(localWork, `Voluntarios en ${place} · turno ${localWork.turn}`)
    : reference(visit, `Tu visita a ${place} · turno ${visit?.turn}`);
  const localMemory = localWork
    ? `En el turno ${localWork.turn} ampliaste el equipo de voluntarios de ${place}.`
    : visit ? `Tu última visita fue a ${place}, en el turno ${visit.turn}.` : `Tu campaña parte de ${place}.`;
  const result = {eventId, turn, provinceId, format: 'politics', icon: 'organize', title: '',
    shortBody: '', body: '', optionLabels: {}, optionIntents: {}, antecedent: localReference,
    speaker: {kind: 'team', id: 'campaign-team', name: 'Tu equipo', role: 'Te pide una decisión'}};
  const scene = (title, shortBody, body, optionLabels, optionIntents) => Object.assign(result,
    {title, shortBody, body, optionLabels, optionIntents});

  switch (eventId) {
    case 'E05':
      scene('Falta gente para montar el acto',
        `Faltan voluntarios para montar tu acto en ${place}. ¿Lo organizas tú, se lo encargas al equipo o haces un acto pequeño?`,
        `${localMemory} Quieres explicar tu propuesta: ${own}. Falta quien reparta las tareas. Encargarlo a un colaborador permite preparar voluntarios para los turnos que quedan, pero le ocupa la tarea de hoy. Hacerlo tú te quita energía. Un acto pequeño no cuesta recursos y no amplía los voluntarios.`,
        {give_authority: '«Te encargas tú; reparte las tareas»', resolve_personally: '«Me quedo a organizarlo»', reduce: '«Hagamos un acto pequeño»'},
        {give_authority: 'Pagas y ocupas una tarea para sumar voluntarios y coordinar al equipo.',
          resolve_personally: 'Organizas el acto para llegar a más gente; te queda menos energía para tu jugada.',
          reduce: 'No gastas caja ni energía. El equipo descansa, pero no sumas voluntarios.'});
      break;
    case 'E08': {
      const issue = campaignIssue(state, bundle, {topicId: priority, sceneKey: eventId, provinceId});
      const concrete=briefingScene(state,{issue,provinceId,antecedent:reference(research,`Investigación en ${place} · turno ${research?.turn}`)});
      if(concrete)return concrete;
      result.icon = 'research';
      result.antecedent = reference(research, `Investigación en ${place} · turno ${research?.turn}`);
      result.speaker.role = 'No sabe qué dato usar';
      result.issueId = issue.id;
      result.contextNote = {label: 'El informe mezcla dos medidas', text: issue.briefing};
      scene('El equipo ha mezclado los datos de dos informes',
        `${issue.shortSituation} El equipo mezcla los datos. ¿Pagas una revisión, se la pides a Inés o dejas el informe fuera?`,
        `${research ? `El equipo investigó ${place} en el turno ${research.turn}. ` : ''}Quieres explicar tu propuesta: ${issue.brief}. Los informes no cuentan lo mismo. Puedes pagar una revisión para preparar tu respuesta o pedirle a Inés que la haga. Revisar añade preparación para hablar en Medios; no cambia el sondeo. Dejar el informe fuera conserva tus recursos.`,
        {verify: '«Paguemos una revisión antes de usar estos datos»', ines_verify: '«Inés, comprueba los datos y prepara la respuesta»', remove: '«No usemos este informe»'},
        {verify: 'Pagas una revisión para preparar la respuesta; te queda menos caja para la campaña.',
          ines_verify: 'Inés prepara la respuesta y ocupa su tarea de hoy. No podrá hacer otra.',
          remove: 'No gastas caja ni ocupas al equipo. No ganas preparación con este informe.'});
      break;
    }
    case 'E10': {
      if(['0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)){
        const origin=past.findLast(e=>e.kind==='event'&&e.eventId==='E04'
          &&['announce_now','costed_commitment','postpone_answer'].includes(e.optionId));
        const earlier=origin?economicDilemma(state,bundle,{turn:origin.turn}):null;
        if(earlier?.economicDecision){
          const issue=earlier.economicDecision,thread=promiseThreads(state,bundle).find(p=>p.id==='C2_REVIEW');
          const already=Boolean(thread&&thread.openedTurn<turn);
          const pending=already&&(thread.closedTurn===null||thread.closedTurn>=turn);
          const reminder={announce_now:'Defendiste tu propuesta ante la prensa.',costed_commitment:'Prometiste dar esta explicación antes de las urnas.',postpone_answer:'Aplazaste la respuesta.'}[origin.optionId];
          const obligation=pending?'La explicación sigue pendiente para el turno 10.':already?'La entrega anterior ya está cerrada; no se abre otra.':'Si aceptas responder, te comprometes a hacerlo en el turno 10.';
          result.icon='mediate';result.antecedent=reference(origin,`Tu respuesta sobre ${issue.request} · turno ${origin.turn}`);
          result.speaker={kind:'civil',id:'C2',name:civil,role:'Vuelve a la pregunta pendiente'};
          scene('La pregunta sigue sobre la mesa',`${reminder} ${issue.question}`,
            `${reminder} ${civil} vuelve al caso: «${issue.question}». Tu propuesta: ${issue.proposal}. ${obligation} Puedes responder personalmente, pedir a Saúl que prepare la explicación o aplazar el encuentro. Aplazar no borra una promesa anterior.`,
            {limited_statement:already?'Confirmar mi explicación':'Comprometer una explicación',saul_limits:'Pedir a Saúl que prepare la explicación',no_statement:'Aplazar el encuentro'},
            {limited_statement:`Gastas energía y acercas la relación. ${obligation}`,saul_limits:`Saúl ocupa su tarea de hoy. ${obligation}`,no_statement:'No gastas recursos. Si ya prometiste responder, la entrega sigue pendiente.'});
          result.optionSpeeches={limited_statement:already&&!pending?'El compromiso anterior ya está cerrado. Hoy mantengo mi propuesta y explico sus límites.':`Mantengo mi propuesta. ${pending?'Os debo':'Os daré'} la explicación sobre ${issue.request} antes de las urnas.`,
            saul_limits:`Saúl, preparemos una respuesta a esta pregunta: ${issue.question}`,no_statement:pending?'Hoy aplazo el encuentro; sé que sigue pendiente la explicación que prometí.':'Hoy no voy a ese encuentro. No asumo otra entrega.'};
          result.economicDecision=issue;result.issueId=issue.caseId;result.topicId='T3';break;
        }
      }
      const promise = (state.promises || []).find(p => p.id === 'C2_REVIEW'
        && past.some(e => e.id === p.openedBy));
      const opening = promise ? past.find(e => e.id === promise.openedBy) : null;
      const open = promise && (promise.status === 'open'
        || Number.isInteger(promise.closedTurn) && promise.closedTurn >= turn);
      const delivery = !promise ? 'Si publicáis la nota, tendrás que explicar sus límites en el turno 10.'
        : open ? 'Ya debes explicar los límites en el turno 10; publicar la nota mantiene esa misma tarea.'
          : 'La explicación anterior ya se resolvió; publicar la nota no crea otra entrega.';
      const personalIntent = !promise
        ? 'Gastas energía en la nota y te comprometes a explicar sus límites en el turno 10.'
        : open ? 'Gastas energía en la nota. Sigue pendiente explicar los límites en el turno 10.'
          : 'Gastas energía en la nota. La explicación anterior sigue cerrada.';
      const staffIntent = !promise
        ? 'Saúl ocupa su tarea en la nota. Tendrás que explicar los límites en el turno 10.'
        : open ? 'Saúl ocupa su tarea en la nota. Sigue pendiente explicar los límites en el turno 10.'
          : 'Saúl ocupa su tarea en la nota. La explicación anterior sigue cerrada.';
      if(['0.8.3','0.8.4','0.8.5'].includes(state.rulesVersion)&&['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)){
        const issue=campaignIssue(state,bundle,{topicId:'T3',sceneKey:eventId,provinceId});
        result.icon='mediate';result.issueId=issue.id;result.topicId=issue.topicId;
        result.antecedent=reference(opening||contact,`${opening?'Tu explicación pendiente':'Contacto'} con ${civil} · turno ${(opening||contact)?.turn}`);
        result.speaker={kind:'civil',id:'C2',name:civil,role:'Te pide una respuesta pública'};
        const explanation=!promise?'Si aceptas, tendrás que explicar las dificultades de tu propuesta antes de las urnas, en el turno 10.':open?'Sigue pendiente tu explicación del turno 10; no asumes otra entrega.':'Tu explicación anterior ya está cerrada; no asumes otra entrega.';
        const short=`${issue.shortSituation} ¿Respondes tú, lo preparas con Saúl o aplazas?`;
        scene(issue.title,short.length<=200?short:`${issue.title}. ¿Respondes tú, lo preparas con Saúl o aplazas?`,
          `${issue.situation} ${contact?`Ya hablaste con ${civil} en el turno ${contact.turn}. `:''}${civil} quiere una respuesta pública: «${issue.objection}» Tu propuesta es ${issue.brief}. ${explanation} Aplazar hoy no borra una respuesta que ya debías.`,
          {limited_statement:'Explicar mi propuesta y sus dificultades',saul_limits:'Preparar la respuesta con Saúl',no_statement:'Aplazar la respuesta'},
          {limited_statement:!promise?'Gastas energía y te comprometes a explicar las dificultades en el turno 10.':open?'Gastas energía. Tu explicación del turno 10 sigue pendiente.':'Gastas energía. La entrega anterior sigue cerrada.',
            saul_limits:!promise?'Saúl ocupa su tarea preparando la respuesta. La explicación queda para el turno 10.':open?'Saúl ocupa su tarea preparando la respuesta. Sigue pendiente la explicación del turno 10.':'Saúl ocupa su tarea preparando la respuesta. La entrega anterior sigue cerrada.',
            no_statement:'No gastas recursos. Si ya debías una explicación, sigue pendiente.'});
        result.optionSpeeches={limited_statement:`Propongo ${issue.brief}. Esta es la dificultad: ${issue.limit}`,
          saul_limits:`Saúl, prepara una respuesta a esta pregunta: ${issue.objection}`,
          no_statement:'Hoy no doy esa respuesta. Si ya la prometí, sé que sigue pendiente.'};
        break;
      }
      result.icon = 'mediate';
      result.antecedent = opening
        ? reference(opening, `Aclaración acordada con ${civil} · turno ${opening.turn}`)
        : reference(contact, `Contacto con ${civil} · turno ${contact?.turn}`);
      result.speaker = {kind: 'civil', id: 'C2', name: civil, role: 'Quiere publicar la reunión'};
      scene('¿Qué dirá la foto de vuestra reunión?',
        `${civil} quiere publicar la reunión. ¿Explicas lo acordado y sus límites, se lo pides a Saúl o aplazas la nota?`,
        `${contact ? `Ya hubo contacto en el turno ${contact.turn}. ` : ''}Tu propuesta: ${campaignIssue(state,bundle,{topicId:'T3',sceneKey:eventId,provinceId})?.brief || posture('T3')}. La nota debe explicar qué habéis trabajado y qué sigue sin resolver. ${delivery} Aplazar la nota no cancela ninguna explicación anterior.`,
        {limited_statement: '«Publiquemos lo acordado y lo que falta»', saul_limits: '«Saúl, prepara la nota y explica sus límites»', no_statement: '«Dejemos la nota para otro día»'},
        {limited_statement: personalIntent, saul_limits: staffIntent,
          no_statement: 'No gastas recursos y aplazas la nota. Si ya debías una explicación, sigue pendiente.'});
      break;
    }
    case 'E12':
      scene('El último acto necesita refuerzos',
        `Falta gente para preparar el último acto en ${place}. ¿Te encargas tú, lo pides al equipo o haces lo que ya estaba preparado?`,
        `${localMemory} El acto sirve para explicar tu propuesta: ${own}. Puedes gastar más para llegar a más gente o guardar recursos para tu última jugada. Si lo encargas al equipo, los nuevos voluntarios solo trabajan hoy: después acaba la campaña.`,
        {territorial_close: '«Voy yo; hagamos el acto grande»', team_close: '«Encargaos vosotros del último acto»', simple_close: '«Hagamos lo que ya está preparado»'},
        {territorial_close: 'Gastas más caja y energía para llegar a más gente aquí; te queda menos para tu última jugada.',
          team_close: 'Pagas y ocupas una tarea. Los voluntarios nuevos solo podrán trabajar hoy.',
          simple_close: 'No gastas recursos. Haces un acto más pequeño para llegar a menos gente.'});
      break;
    case 'E18':
      scene('La entrada del local es demasiado pequeña',
        `La gente hace cola y no puede entrar al acto de ${place}. ¿Pagas para arreglar la entrada, buscas otro local o sales a hablar a la calle?`,
        `${localMemory} Vas a explicar tu propuesta: ${own}. Arreglar la entrada cuesta más, pero permite organizar el acto y sumar voluntarios. Buscar otro local cuesta menos y obliga al equipo a rehacer el montaje. Hablar en la calle no cuesta recursos, pero tira por tierra el trabajo de preparación.`,
        {adapt_space: '«Arreglemos la entrada para celebrar el acto»', move_venue: '«Busquemos otro local»', short_route: '«Salgamos a hablar a la calle»'},
        {adapt_space: 'Gastas más caja y energía para celebrar el acto y sumar voluntarios.',
          move_venue: 'Gastas menos para mantener el acto. Cambiar el montaje desgasta al equipo.',
          short_route: 'No gastas recursos, pero llegas a menos gente y el equipo pierde el trabajo del montaje.'});
      break;
    case 'E24':
      scene('Va a llover durante el último acto',
        `Va a llover durante el último acto en ${place}. ¿Alquilas una sala, mandas al equipo a varios encuentros pequeños o hablas por vídeo desde el local?`,
        `${localMemory} Puedes alquilar una sala y mantener el acto, o pedir al equipo que reparta varios encuentros pequeños. Los nuevos voluntarios solo trabajan hoy. El vídeo lleva tu mensaje fuera de la provincia, pero el equipo pierde el acto que había preparado. Después eliges tu última jugada.`,
        {covered_close: '«Alquilemos una sala y hagamos el acto»', team_routes: '«Organizad varios encuentros pequeños»', short_broadcast: '«Hablemos por vídeo desde el local»'},
        {covered_close: 'Pagas más caja y gastas energía para mantener el acto y animar al equipo.',
          team_routes: 'Pagas y ocupas una tarea para varios encuentros aquí. Los voluntarios nuevos solo trabajan hoy.',
          short_broadcast: 'No gastas recursos y hablas al país por vídeo. Renuncias al acto y el equipo se desanima.'});
      break;
    case 'E26':
      scene('Quedan carteles sin repartir',
        `Quedan carteles en el local de ${place}. ¿Sales tú a repartirlos, se lo encargas al equipo o dejas de repartir por hoy?`,
        `${localMemory} Los carteles explican tu propuesta: ${own}. Repartirlos te quita energía para la última jugada. Encargar el reparto ocupa una tarea y los nuevos voluntarios solo trabajan hoy. Dejar los carteles permite descansar al equipo, pero tu mensaje llega a menos gente.`,
        {extend_route: '«Salgo yo a repartir los carteles»', organised_distribution: '«Encargaos vosotros del reparto»', close_team_day: '«Dejemos de repartir por hoy»'},
        {extend_route: 'Gastas caja y energía para repartir más carteles. Te queda menos para la última jugada.',
          organised_distribution: 'Pagas y ocupas una tarea para repartirlos. Los voluntarios nuevos solo trabajan hoy.',
          close_team_day: 'No gastas recursos y el equipo descansa, pero tu mensaje llega a menos gente aquí.'});
      break;
  }

  // A narrative alias cannot introduce a decision outside the existing event.
  const optionIds = new Set(event.options.map(option => option.id));
  for (const key of Object.keys(result.optionLabels)) if (!optionIds.has(key)) delete result.optionLabels[key];
  for (const key of Object.keys(result.optionIntents)) if (!optionIds.has(key)) delete result.optionIntents[key];
  return result.title ? result : null;
}
