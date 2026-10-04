// Reactions describe the campaign's recorded decision, never invented NPC quotes.
import {resolveCampaignBundle} from '../core/campaign.mjs';
import {newsOutcome} from './news.mjs';
import {eventStory} from './stories.mjs';
import {campaignIssue,openingIssue} from './issue-cases.mjs';
import {promiseThreads} from './promises.mjs';
import {politicalContradiction} from './political-contradiction.mjs';
import {launchStory} from './launch-story.mjs';

const sentences = (...parts) => parts.filter(Boolean).reduce((text, part) => {
  const candidate = text ? `${text} ${part}` : part;
  return candidate.length <= 180 ? candidate : text;
}, '');

export function newsReaction(state, sourceBundle) {
  const outcome = newsOutcome(state, sourceBundle);
  if (!outcome || outcome.eventId === 'E07') return null;
  const bundle = resolveCampaignBundle(sourceBundle, state);
  const story = eventStory(state, sourceBundle, {eventId: outcome.eventId, turn: outcome.turn});
  const entry = state.timeline.find(e => e.id === outcome.entryId);
  const event = bundle.content.events.find(e => e.id === outcome.eventId);
  if (!story || !entry || !event?.options?.some(o => o.id === outcome.optionId)) return null;
  const facts = [...outcome.benefits, ...outcome.tradeoffs, ...outcome.unchanged].filter(c => c.kind === 'effect');
  const changes = stat => facts.filter(c => c.stat === stat);
  const party = id => bundle.config.parties.find(p => p.id === id)?.name || id;
  const civil = id => bundle.config.civilActors.find(p => p.id === id)?.name || id;
  const province = id => bundle.provinces.districts.find(p => p.id === id)?.name || id;
  const local = facts.find(c => ['support', 'organization'].includes(c.stat) && c.target !== 'national');
  const place = local ? province(local.target) : null;
  const closes = Math.max(0, bundle.config.turns - outcome.turn + 1);
  const proposal = (id, sceneKey = outcome.eventId) => campaignIssue(state, bundle, {topicId: id, sceneKey})?.brief;
  const topicName = id => bundle.config.topics.find(t => t.id === id)?.name;
  const assigned = outcome.reservedStaff?.name;
  const clauses = stat => changes(stat).map(c => {
    if (stat === 'support') return c.delta > 0 ? `Ganaste alcance ${c.target === 'national' ? 'nacional' : `en ${province(c.target)}`}.`
      : c.delta < 0 ? `Cediste alcance ${c.target === 'national' ? 'nacional' : `en ${province(c.target)}`}.`
        : `El alcance ${c.target === 'national' ? 'nacional' : `en ${province(c.target)}`} no cambió.`;
    if (stat === 'relation') return c.delta > 0 ? `Subió la confianza con ${party(c.target)}.`
      : c.delta < 0 ? `Bajó la confianza con ${party(c.target)}.` : `La confianza con ${party(c.target)} no aumentó.`;
    if (stat === 'rapport') return c.delta > 0 ? `Mejoró tu relación con ${civil(c.target)}.`
      : c.delta < 0 ? `Bajó tu relación con ${civil(c.target)}.` : `Tu relación con ${civil(c.target)} no aumentó.`;
    if (stat === 'organization') return c.delta > 0
      ? `La base de ${province(c.target)} creció; quedan ${closes} ${closes === 1 ? 'cierre' : 'cierres'}, incluido el de hoy.`
      : c.delta < 0 ? `La base de ${province(c.target)} se redujo.` : `La base de ${province(c.target)} no creció.`;
    if (stat === 'readiness') return c.delta > 0 ? `Sumaste ${c.delta} ${c.delta === 1 ? 'ficha' : 'fichas'} de preparación.`
      : c.delta < 0 ? `Usaste ${Math.abs(c.delta)} ${c.delta === -1 ? 'ficha' : 'fichas'} de preparación.` : 'La preparación no aumentó.';
    if (stat === 'reputation') return c.delta > 0 ? 'Tu reputación mejoró.' : c.delta < 0 ? 'Tu reputación cayó.' : 'La reputación no cambió.';
    if (stat === 'cohesion') return c.delta > 0 ? 'El equipo ganó cohesión.' : c.delta < 0 ? 'El equipo perdió cohesión.' : 'La cohesión no cambió.';
    return '';
  });
  const effects = (...stats) => stats.flatMap(clauses);
  const reserved = assigned ? `${assigned} dedicó su tarea a esta decisión.` : '';
  const obligation = outcome.obligations.map(p => p.text+'.');
  const result = {entryId: outcome.entryId, headline: '', summary: ''};
  const set = (headline, ...parts) => Object.assign(result, {headline, summary: sentences(...parts)});
  const choice = outcome.optionId;
  switch (outcome.eventId) {
    case 'E05':
      if(['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)&&story.discipline){
        if(choice==='correct_publicly')set('Corregiste a Rafa delante de la prensa',...effects('reputation','cohesion','support'));
        else if(choice==='prepare_clarification')set('Preparaste la aclaración; falta decirla en público',...effects('readiness','cohesion'));
        else set('El vídeo sigue sin corregir',...effects('reputation','cohesion'));
        break;
      }
      if (choice === 'give_authority') set('Las llaves tienen responsable en el equipo', reserved, ...effects('organization', 'cohesion'));
      else if (choice === 'resolve_personally') set('Te ocupaste de poner en marcha el acto', ...effects('organization', 'support'));
      else set('El acto se queda en un formato pequeño', 'Conservaste caja, energía y equipo disponible.', ...effects('cohesion'));
      break;
    case 'E08':
      if(story.briefingDecision){
        if(choice==='verify')set('Pagaste la revisión del borrador',story.briefingDecision.fact,...effects('readiness'));
        else if(choice==='ines_verify')set('Inés prepara la explicación',reserved,...effects('readiness','cohesion'));
        else set('La frase se queda fuera del discurso','Retiraste la frase antes de publicarla. Conservaste caja y equipo disponibles.');
        break;
      }
      if (choice === 'verify') set('El informe pasó por una revisión', ...effects('readiness'), 'La revisión prepara tu explicación; no afina el sondeo.');
      else if (choice === 'ines_verify') set('Inés se ocupó de los decimales', reserved, ...effects('readiness', 'cohesion'));
      else set('El resumen salió de tu argumentario', 'Retiraste ese resumen y conservaste recursos. La preparación que ya tenías no se pierde.');
      break;
    case 'E10': {
      if(['0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)&&story.economicDecision){
        const thread=promiseThreads(state,bundle).find(p=>p.id==='C2_REVIEW');
        const pending=thread?.status==='open'?'La explicación sigue pendiente para el turno 10.':thread?'El compromiso anterior ya está cerrado.':'No abriste una entrega.';
        if(choice==='no_statement')set('Aplazaste el encuentro, la pregunta continúa',pending,'Conservaste caja y energía.');
        else set(choice==='saul_limits'?'Saúl prepara la respuesta pendiente':'Volviste a la pregunta sobre tu propuesta',pending,reserved,...effects('rapport','cohesion'));
        break;
      }
      const priorPromise = state.promises.find(p => p.id === 'C2_REVIEW' && p.status === 'open'
        && state.timeline.some(e => e.id === p.openedBy && e.turn < outcome.turn));
      const pending = priorPromise ? 'La aclaración ya pendiente sigue para el turno 10.' : '';
      if(['0.8.3','0.8.4','0.8.5'].includes(state.rulesVersion)&&['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)&&story.issueId){
        if(choice==='no_statement')set('Aplazaste la respuesta pública',pending||'Esta decisión no abrió ninguna entrega.','Conservaste caja y energía.');
        else set(choice==='saul_limits'?'Saúl prepara la respuesta':'Explicaste tu propuesta y sus dificultades',...obligation,pending,reserved,...effects('rapport','cohesion'));
        break;
      }
      if (choice === 'no_statement') set('La foto se queda sin publicación conjunta', 'Aplazaste la nota.', pending || 'Esta decisión no abrió ninguna entrega.');
      else set(choice === 'saul_limits' ? 'Saúl acordó el pie de foto' : 'Pusiste límites a la publicación conjunta', ...obligation, pending, reserved, ...effects('rapport', 'cohesion'));
      break;
    }
    case 'E12':
      set(choice === 'territorial_close' ? 'Concentraste fuerzas en el cierre local' : choice === 'team_close' ? 'Tu equipo se ocupó del cierre local' : 'El cierre mantuvo el formato preparado', ...effects('support'), reserved, ...effects('organization', 'cohesion'));
      break;
    case 'E18':
      set(choice === 'adapt_space' ? 'El acto volvió a tener una entrada' : choice === 'move_venue' ? 'El encuentro cambió de espacio' : 'El montaje dejó paso a un recorrido breve', ...effects('support', 'organization', 'reputation', 'cohesion'));
      break;
    case 'E24':
      set(choice === 'covered_close' ? 'El cierre encontró techo' : choice === 'team_routes' ? 'El equipo repartió el cierre en rutas' : 'El cierre salió desde el local', ...effects('support'), reserved, ...effects('organization', 'cohesion'));
      break;
    case 'E26':
      if (choice === 'extend_route') set('Los últimos carteles entraron en tu ruta', ...effects('support'));
      else if (choice === 'organised_distribution') set('El equipo se ocupó del último reparto', reserved, ...effects('support', 'organization', 'cohesion'));
      else set('El equipo cerró la jornada del reparto', ...effects('cohesion', 'support'));
      break;
    case 'E01':
      if (['0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)) {
        const launch = launchStory(state, bundle), confirmed = launch?.confirmed;
        if (!confirmed || confirmed.entryId !== outcome.entryId) return null;
        if (confirmed.issue) {
          result.issueId = confirmed.issue.id;
          result.topicId = confirmed.topicId;
          const selected = launch.choices.find(option => option.optionId === choice);
          set(`Tu primer titular: ${selected.subject}`, `Defendiste ${confirmed.issue.brief}.`,
            ...effects('support'), 'Ahora eliges tu jugada en el mapa.');
        } else set('Reservaste el primer anuncio',
          'Conservaste caja y energía. No hiciste ninguno de los dos anuncios; ahora eliges tu jugada en el mapa.');
        break;
      }
      if (choice === 'contrast') set('Preparaste tu respuesta; falta revisar la propuesta', ...effects('readiness'), 'Pagaste la preparación; la revisión de tu propuesta queda pendiente.');
      else if (choice === 'team_review') set('El equipo preparó tu respuesta', reserved, ...effects('readiness', 'cohesion'));
      else set('Respondiste sin preparación adicional', 'Conservaste caja y equipo disponible. Esta decisión no añadió preparación ni afinó el sondeo.');
      break;
    case 'E06':
      if (['0.7.1', '0.8.0', '0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)) {
        const contradiction = politicalContradiction(state, bundle, {turn: outcome.turn});
        if (!contradiction) return null;
        result.messages = contradiction.messages;
        result.issueId = contradiction.id;
        if (choice === 'keep_claim') set('Los dos mensajes siguen en circulación',
          `La contradicción sigue abierta. Mantienes «${contradiction.programme}» y su contrario.`, ...effects('support', 'cohesion'));
        else if (choice === 'cancel') set('Cancelaste el acto y retiraste su anuncio',
          'La contradicción queda cerrada al retirar el anuncio; tu programa no cambia.', ...effects('reputation', 'cohesion'));
        else set(choice === 'saul_mediates' ? 'Saúl acordó retirar el anuncio contrario' : 'Corregiste el anuncio; el programa se mantiene',
          `La contradicción queda cerrada. Mantienes «${contradiction.programme}».`, reserved, ...effects('reputation', 'cohesion'));
        break;
      }
      if (choice === 'keep_claim') set('Un cartel más; dos citas incompatibles', 'Conservaste los dos anuncios. La contradicción sigue abierta.', ...effects('support', 'cohesion'));
      else if (choice === 'cancel') set('Un solo acto, con el coste de cancelar', 'Cancelaste el segundo anuncio; la contradicción queda cerrada.', ...effects('reputation', 'cohesion'));
      else set(choice === 'saul_mediates' ? 'Saúl puso de acuerdo a las dos agendas' : 'El horario cambia antes de que crezca el lío', 'Corregiste la incompatibilidad de los anuncios.', reserved, ...effects('reputation', 'cohesion'));
      break;
    case 'E09':
      if (['0.7.1', '0.8.0', '0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)) {
        const contradiction = politicalContradiction(state, bundle, {turn: outcome.turn});
        if (!contradiction) return null;
        result.messages = contradiction.messages;
        result.issueId = contradiction.id;
        result.priorEntryId = contradiction.priorEntryId;
        if (choice === 'leave_unresolved') set('Los dos mensajes siguen contradiciéndose',
          `No retiraste el anuncio contrario a «${contradiction.programme}». La contradicción sigue abierta.`, ...effects('reputation', 'relation'));
        else set(choice === 'team_correction' ? 'El equipo corrigió el anuncio' : 'Diste la cara y retiraste el anuncio contrario',
          `Mantienes «${contradiction.programme}». La contradicción queda cerrada.`, ...effects('reputation', 'cohesion'), reserved);
        break;
      }
      if (choice === 'leave_unresolved') set('Los dos carteles siguen frente a tu campaña', 'Dejaste la contradicción sin resolver.', ...effects('reputation', 'relation'));
      else set(choice === 'team_correction' ? 'El equipo publica la corrección' : 'Diste la explicación que faltaba', 'La contradicción queda cerrada; su coste no se borra.', ...effects('reputation', 'cohesion'), reserved);
      break;
    case 'E15':
      if (['0.8.3','0.8.4','0.8.5'].includes(state.rulesVersion)&&['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)&&story.headlineDecision) {
        if (choice==='bold_line') set('Defendiste la propuesta; el obstáculo quedó fuera', ...effects('support','cohesion'));
        else if (choice==='team_line') set('La propuesta salió con su dificultad incluida', reserved, ...effects('support','cohesion'));
        else set('Enviaste la propuesta y su límite por escrito', ...effects('reputation','support'));
        break;
      }
      if (choice === 'bold_line') set('Elegiste el titular más ambicioso', ...effects('support', 'cohesion'));
      else if (choice === 'team_line') set('El titular pasó por el equipo', reserved, ...effects('support', 'cohesion'));
      else set('La nota fue breve; la ambición quedó fuera', ...effects('reputation', 'support'));
      break;
    case 'E16':
      if (choice === 'own_joke') set('Contestaste a los ocho segundos con humor', ...effects('support', 'cohesion'));
      else if (choice === 'full_context') set('El fragmento tuvo una explicación completa', ...effects('reputation', 'readiness', 'support'));
      else set('El micrófono quedó fuera de tu agenda', ...effects('cohesion', 'support'));
      break;
    case 'E19':
      if (choice === 'correct_now') set('La cifra se corrigió con tu voz', ...effects('reputation', 'support', 'readiness'));
      else if (choice === 'team_explanation') set('Tu equipo se ocupó de explicar la cifra', reserved, ...effects('readiness', 'support', 'cohesion'));
      else set('El lapsus acabó dentro de una broma', ...effects('support', 'reputation'));
      break;
    case 'E20':
      if (choice === 'amplify_clip') set('La torpeza rival entró en tu réplica', ...effects('support', 'cohesion'));
      else if (choice === 'cool_reaction') set('Elegiste el tono de acuerdo', ...effects('relation', 'support'));
      else set('Tu provincia ganó espacio en tu agenda', ...effects('support', 'cohesion'));
      break;
    case 'E21':
      if (choice === 'long_answer') set('La objeción recibió una explicación completa', ...effects('support', 'reputation'));
      else if (choice === 'ines_brief') set('Inés preparó la respuesta a la objeción', reserved, ...effects('readiness', 'support'));
      else set('Tu agenda siguió; la objeción quedó abierta', ...effects('cohesion', 'support'));
      break;
    case 'E22':
      if (['0.8.3','0.8.4','0.8.5'].includes(state.rulesVersion)&&['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)&&story.railDecision) {
        if (choice==='listen_affected') set(`Escuchaste a los viajeros en ${province(story.railDecision.provinceId)}`, ...effects('support','reputation'));
        else if (choice==='prepared_position') set('Explicaste tu plan; la causa de la avería sigue sin saberse', ...effects('readiness','support'));
        else set('No hiciste la entrevista; esperas información', ...effects('reputation','cohesion','support'));
        break;
      }
      if (choice === 'listen_affected') set('Tu respuesta empezó junto a los afectados', ...effects('support', 'reputation'));
      else if (choice === 'prepared_position') set('Conectaste tu propuesta con la avería', ...effects('readiness', 'support'));
      else set('Esperaste los detalles de la avería', ...effects('reputation', 'cohesion', 'support'));
      break;
    case 'E02':
      if(story.neighbourDecision){
        const q=story.neighbourDecision;
        if(choice==='keep_route')set(`Priorizaste el acto en ${story.provinceId?province(story.provinceId):'tu provincia'}`,...effects('organization','cohesion'),'No prometiste responder a los vecinos.');
        else if(choice==='decline')set(`No asumiste la respuesta para ${q.name}`,'Conservaste recursos. Esta decisión no abrió un compromiso.');
        else set(`Prometiste contestar a ${q.name}`,`La pregunta: ${q.question}`,reserved,...effects('rapport'));
        break;
      }
      if (choice === 'keep_route') set(`La agrupación sigue en pie${place ? ` en ${place}` : ''}`, ...effects('organization', 'cohesion'));
      else if (choice === 'decline') set('La mesa vecinal quedó fuera de tu agenda', 'Declinaste el encuentro sin asumir otra entrega. Conservaste recursos para tu jugada.');
      else set(choice === 'delegate' ? 'Tu equipo escucha; tú sigues con la agenda' : 'Escuchar también abre una obligación', ...obligation, ...effects('rapport'), reserved);
      break;
    case 'E03':
      if(story.neighbourDecision){
        const q=story.neighbourDecision;
        if(choice==='receive_written')set(`Recibiste la pregunta de ${q.name}`,`La pregunta: ${q.question}`,'No prometiste una entrega.');
        else set(`Prometiste contestar a ${q.name}`,`La pregunta: ${q.question}`,reserved,...effects('rapport'));
        break;
      }
      if (choice === 'receive_written') set('Las preguntas entran; la entrega no se promete', 'Recibiste las preguntas por escrito sin comprometer otra entrega. Mantienes tu postura sobre servicios.');
      else set(choice === 'delegate' ? 'La escucha ocupa una tarea del equipo' : 'Tu propuesta de servicios queda ante la mesa', ...obligation, ...effects('rapport'), reserved);
      break;
    case 'E04':
      if(['0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)&&story.economicDecision){
        const subject={autonomos:'el taller de Marta','primer-empleo':'el primer empleo de Dani',energia:'la luz de la fábrica'}[story.economicDecision.caseId];
        if(choice==='announce_now')set(`Defendiste tu propuesta sobre ${subject}`,
          ...effects('support'),'No abriste una promesa ni respondiste todavía a la pregunta del coste o los controles.');
        else if(choice==='costed_commitment')set(`Prometiste una explicación sobre ${subject}`,
          ...obligation,...effects('readiness','rapport'));
        else set(`Aplazaste la respuesta sobre ${subject}`,
          'No gastaste caja ni energía. No prometiste una entrega.',...effects('rapport'));
        break;
      }
      if (choice === 'state_limits') set('Explicaste lo que aún no puedes resolver', 'No gastaste recursos ni sumaste preparación. Tampoco prometiste una respuesta para el cierre.');
      else set(choice === 'ines_review' ? 'Inés preparó la respuesta' : 'Prometiste explicar cómo pagar tu propuesta', ...obligation, reserved, ...effects('readiness', 'rapport'));
      break;
    case 'E11': {
      const status = outcome.obligations[0]?.status;
      const headline = status === 'fulfilled' ? assigned ? `${assigned} cerró lo prometido` : 'Lo prometido ya está entregado'
        : status === 'reduced' ? 'La entrega llega con menos alcance' : status === 'missed' ? 'La promesa termina sin entrega' : 'La decisión sobre tus entregas queda registrada';
      set(headline, ...obligation.slice(0, 1), reserved, ...effects('reputation', 'cohesion'));
      break;
    }
    case 'E13':
      if (choice === 'keep_schedule') set('Dejaste pasar la radio para sostener tu agenda', 'Conservaste caja y energía para tu jugada.', ...effects('cohesion'));
      else set(assigned ? `${assigned} atendió la radio` : 'Llevaste tu mensaje al estudio', reserved, ...effects('support', 'readiness', 'reputation'));
      break;
    case 'E14':
      if(story.encounter){
        if(choice==='private_venue')set(`Tu propio acto: ${story.encounter.issueTitle}`,...effects('support','organization'));
        else if(choice==='shared_slot')set(`Compartiste acto con ${party('P2')}`,`Defendiste ${story.encounter.ownProposal}.`,...effects('support','relation'));
        else set('Elegiste el encuentro pequeño',...effects('cohesion','support'));
        break;
      }
      if (choice === 'private_venue') set(`Tu cartel, tu espacio${place ? ` en ${place}` : ''}`, ...effects('support', 'organization'));
      else if (choice === 'shared_slot') set(`Compartiste escenario con ${party('P2')}`, ...effects('support', 'relation'));
      else set('Un encuentro para los tuyos', ...effects('cohesion', 'support'));
      break;
    case 'E17':
      if (choice === 'own_route') set(`Elegiste tu prioridad local${place ? ` en ${place}` : ''}`, ...effects('support', 'cohesion'));
      else set(assigned ? `${assigned} sostuvo la réplica` : 'Tu argumento entra en la réplica', reserved, ...effects('support', 'readiness'));
      break;
    case 'E23':
      if(story.encounter){
        if(choice==='shared_table')set('Saliste en la foto; tu programa sigue siendo el tuyo',`Defendiste ${story.encounter.ownProposal}.`,...effects('relation','support'));
        else if(choice==='own_act')set(`Tu propio acto: ${story.encounter.issueTitle}`,...effects('support','relation'));
        else set(`Saludaste a ${party('P4')}, que organizaba la mesa`,...effects('relation','cohesion'));
        break;
      }
      if (choice === 'shared_table') set('Compartiste foto y espacio político', ...effects('relation', 'support'));
      else if (choice === 'own_act') set(`Hiciste un acto con tu cartel${place ? ` en ${place}` : ''}`, ...effects('support', 'relation'));
      else set(`El saludo fue para ${party('P4')}`, ...effects('relation', 'cohesion'), 'Conservaste caja y energía para tu jugada.');
      break;
    case 'E25':
      if (choice === 'first_commitment') set(`Una prioridad para la última entrevista: ${topicName(state.commitments[0])}`,
        `Defendiste ${proposal(state.commitments[0])}.`, ...effects('support', 'readiness', 'cohesion'));
      else if (assigned) set(`${assigned} atendió la última llamada`, reserved, ...effects('support', 'readiness'));
      else set('Cerraste con una respuesta breve', ...effects('reputation', 'support'));
      break;
    case 'E27': case 'E30':
      if(story.teamChoice&&choice==='save'){
        set('Guardaste la caja para tu jugada','No ampliaste la organización. Conservaste la caja para la jugada que elegirás después.');break;
      }
      if (choice === 'save') set(outcome.eventId === 'E27' ? 'La furgoneta sigue; la base espera' : 'Las llaves esperan: guardaste la caja',
        'No ampliaste la organización. Conservaste la caja para la jugada que elegirás después.');
      else if (choice === 'take_airtime') set('Tu propuesta llegó a la radio', ...effects('support'));
      else if (choice === 'rehearse') set(changes('readiness').some(c => c.delta > 0)
        ? 'El ensayo añadió preparación' : 'La preparación no aumentó con el ensayo', ...effects('readiness'), reserved);
      else set(changes('organization').some(c => c.delta > 0) ? `La base crece${place ? ` en ${place}` : ''}: quedan ${closes} ${closes === 1 ? 'cierre' : 'cierres'}` : `La base no creció${place ? ` en ${place}` : ''}`,
        ...effects('organization'), outcome.tradeoffs.some(c => c.kind === 'cost' && c.delta < 0) ? 'La decisión sí gastó caja.' : '');
      break;
    case 'E28':
      if (choice === 'save') set('El minuto de radio quedó sin tu intervención', 'Elegiste conservar caja y energía. No añadiste otra intervención a tu agenda.');
      else set('Elegiste el micrófono por un minuto', ...effects('support'));
      break;
    case 'E29': case 'E32': case 'E35': case 'E38': {
      const target = ['E29', 'E35'].includes(outcome.eventId) ? 'P3' : 'P4';
      if(story.call){
        const relation=changes('relation').find(c=>c.target===target);
        if(choice==='save')set(`Aplazaste la llamada de ${party(target)}`,
          'No pagaste la reunión de 2 de caja. La relación no cambió.');
        else set(`Hablaste con ${party(target)}: ${story.call.subject}`,
          relation?.delta>0?`La relación mejoró en ${relation.delta}.`:relation?.delta===0?'La relación no aumentó: ya estaba al máximo.':'',
          `Mantuviste tu propuesta: ${story.call.ownProposal}.`);
        break;
      }
      const titles = {E29: `Un rival en tu agenda: ${party(target)}`, E32: `Una conversación antes del debate con ${party(target)}`,
        E35: `Un café antes del recuento con ${party(target)}`, E38: `El teléfono del cierre: ${party(target)}`};
      if (choice === 'save') set(`Aplazaste la conversación con ${party(target)}`, 'Conservaste la caja. Esta oportunidad no mejoró la confianza entre ambas campañas.');
      else set(titles[outcome.eventId], ...effects('relation'), 'El programa del posible acuerdo queda por negociar.');
      break;
    }
    case 'E31':
      if(story.debateChoice){
        const label={challenge:`Anunciaste un cara a cara con ${party('P2')}`,dialogue:`Ofreciste hablar con ${party('P2')}`,second_priority:'Anunciaste tu otra prioridad para abrir el debate'}[choice];
        set(label,'La apuesta queda anunciada. El refuerzo depende de tu respuesta en el debate; hoy no gastaste recursos ni ganaste fichas.');break;
      }
      if (choice === 'save') set('El debate irá con la preparación que ya tenías', 'Conservaste caja y energía. Este ensayo no añadió nuevas fichas.');
      else set('El argumento llega al ensayo', `Ensayaste cómo defender ${launchStory(state, bundle)?.confirmed?.issue?.brief || proposal(state.commitments[0], 'debate')}.`, ...effects('readiness'));
      break;
    case 'E33':
      if (choice === 'save') set('No abriste otra intervención temática', 'Conservaste caja y energía; esta decisión no añadió alcance temático.');
      else {const id = choice === 'energy' ? 'T3' : 'T1';
        set(`${topicName(id)} ocupa tu intervención${place ? ` en ${place}` : ''}`, `Defendiste ${proposal(id)}.`, ...effects('support'));}
      break;
    case 'E34':
      if(['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)&&story.discipline){
        if(choice==='save')set('La pregunta sobre Rafa quedó sin responder','Guardaste recursos. Esta decisión no añadió una respuesta pública.');
        else set('Explicaste tu programa al recuperar el vídeo',`Defendiste ${story.discipline.proposalBrief}.`,...effects('support','readiness'));
        break;
      }
      if (choice === 'save') set('La respuesta al debate queda fuera de tu agenda', 'Conservaste recursos. El debate ya terminó; esta decisión no añadió otra intervención.');
      else set('Tu prioridad vuelve al argumento', `Defendiste ${launchStory(state, bundle)?.confirmed?.issue?.brief || proposal(state.commitments[0], 'debate')}.`, ...effects('support', 'readiness'));
      break;
    case 'E36':
      if(story.closing){
        if(choice==='save')set('Guardaste fuerzas para el cierre','Conservaste caja y energía. No hiciste este encuentro ni esta llamada.');
        else if(choice==='open_dialogue')set(`Abriste diálogo con ${party('P2')}`,...effects('relation','support'),`Mantuviste tu propuesta: ${story.closing.ownProposal}.`);
        else set(`Hablaste con los vecinos${place?` de ${place}`:''}`,...effects('support'),`Defendiste ${story.closing.ownProposal}.`);
        break;
      }
      if (choice === 'save') set('Reservaste el esfuerzo de la penúltima parada', 'Conservaste caja y energía para tu jugada. No añadiste otro impulso local.');
      else if (choice === 'open_dialogue') set(`Abriste diálogo con ${party('P2')}`, ...effects('relation', 'support'));
      else set(`La penúltima parada tuvo tu mensaje${place ? ` en ${place}` : ''}`, ...effects('support'));
      break;
    case 'E37':
      if (choice === 'save') set('El último boletín quedó fuera de tu agenda', 'Conservaste caja y energía. No añadiste una intervención antes de las urnas.');
      else set('Tu propuesta llegó al último boletín', `Defendiste ${proposal('T1')}.`, ...effects('support'));
      break;
  }
  if (!result.headline || !result.summary) return null;
  const contact = outcome.eventId === 'E36' && choice === 'open_dialogue'
    ? state.timeline.findLast(e => e.turn < outcome.turn && ['plan', 'event'].includes(e.kind)
      && (!e.partyId || e.partyId === 'P1') && e.changes?.some(c => c.stat === 'relation' && c.target === 'P2' && Number.isFinite(c.delta) && c.delta !== 0)) : null;
  const summarizedPromise = outcome.eventId === 'E11'
    ? promiseThreads(state, sourceBundle).find(p => p.id === outcome.obligations[0]?.target) : null;
  const antecedent = outcome.eventId === 'E11'
    ? summarizedPromise ? {entryId: summarizedPromise.entryId, turn: summarizedPromise.openedTurn,
      label: `${summarizedPromise.name}: ${summarizedPromise.request} · turno ${summarizedPromise.openedTurn}`} : null
    : outcome.eventId === 'E36' && choice === 'open_dialogue'
    ? contact ? {entryId: contact.id, turn: contact.turn, label: `Tu relación con ${party('P2')} · turno ${contact.turn}`} : null
    : story.antecedent;
  if (antecedent && state.timeline.some(e => e.id === antecedent.entryId && e.turn < outcome.turn)) result.antecedent = {...antecedent};
  return result;
}
