// Presentation of existing choices. No new claims, effects, promises or rules.
import {campaignIssue,openingIssue} from './issue-cases.mjs';
import {politicalContradiction} from './political-contradiction.mjs';
import {launchStory} from './launch-story.mjs';
export const PRESS_SCENE_IDS = Object.freeze(['E01', 'E06', 'E09', 'E15', 'E16', 'E19', 'E20', 'E21', 'E22']);

const publicPhases = new Set(['debrief', 'election', 'negotiation', 'ending']);
const negative = value => typeof value === 'number' && Number.isFinite(value) && value < 0;

export function pressScene(state, bundle, eventId, turn) {
  if (!state || !PRESS_SCENE_IDS.includes(eventId) || !Number.isInteger(turn)
    || turn < 1 || turn > state.turn) return null;
  const event = bundle.content.events.find(e => e.id === eventId && e.turn === turn);
  if (!event?.options?.length) return null;
  const cutoff = publicPhases.has(state.phase) ? state.turn : state.turn - 1;
  const past = (state.timeline || []).filter(e => e && Number.isInteger(e.turn)
    && e.turn > 0 && e.turn < turn && e.turn <= cutoff && typeof e.id === 'string' && e.id.length);
  const party = id => bundle.config.parties.find(p => p.id === id);
  const partyName = id => party(id)?.name || id;
  const visit = past.findLast(e => e.kind === 'plan' && e.actorId === 'candidate'
    && e.actionId === 'visit' && (!e.partyId || e.partyId === 'P1'));
  const provinceId = visit?.target || state.initialSetup?.province;
  const place = bundle.provinces.districts.find(d => d.id === provinceId)?.name;
  if (!place) return null;
  const current = ['0.8.3','0.8.4','0.8.5'].includes(state.rulesVersion) && ['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion);
  const topics = bundle.config.topics;
  const launch = current && eventId === 'E15' ? launchStory(state, bundle)?.confirmed : null;
  const announced = launch?.issue && launch.topicId && launch.turn < turn
    && past.some(entry => entry.id === launch.entryId && entry.kind === 'event' && entry.eventId === 'E01') ? launch : null;
  const priority = announced?.topicId
    || (state.commitments || []).find(id => topics.some(t => t.id === id)) || topics[0]?.id;
  const topic = id => topics.find(t => t.id === id);
  const posture = id => topic(id)?.poles.find(p => p.id === state.parties.P1.positions?.[id])?.label
    || topic(id)?.name || 'tu propuesta';
  const own = posture(priority);
  const topicName = topic(priority)?.name?.toLowerCase() || 'tu prioridad';
  const issue = eventId==='E01' ? openingIssue(state,bundle)
    : campaignIssue(state, bundle, {topicId: priority, sceneKey: eventId, provinceId, caseId: announced?.issue.id});
  if (['E01', 'E15', 'E16', 'E19', 'E20', 'E21'].includes(eventId) && !issue) return null;
  const result = {eventId, turn, provinceId, format: 'politics', icon: 'interview', title: '',
    shortBody: '', body: '', optionLabels: {}, optionIntents: {}, optionSpeeches: {}, antecedent: null,
    speaker: {kind: 'press', id: 'press', name: 'La redacción', role: 'Busca tu respuesta'}};
  const scene = (title, shortBody, body, labels, intents) => Object.assign(result,
    {title, shortBody, body, optionLabels: labels, optionIntents: intents});
  const reference = (entry, label) => entry ? {entryId: entry.id, turn: entry.turn, label} : null;
  const team = role => {result.speaker = {kind: 'team', id: 'campaign-team', name: 'La mesa de campaña', role};};

  switch (eventId) {
    case 'E01':
      if (['0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)) {
        const launch = launchStory(state, bundle);
        if (!launch) return null;
        const [first, second] = launch.choices;
        const situations = `${first.issue.shortSituation} ${second.issue.shortSituation} ¿Con cuál abres la campaña?`;
        result.icon = 'interview';
        team('Elige el primer anuncio');
        scene('Tu primer titular',
          situations.length <= 220 ? situations : `${first.issue.title}. ${second.issue.title}. ¿Con cuál abres la campaña?`,
          `${first.issue.situation} ${second.issue.situation} Las dos propuestas están en tu programa. Puedes abrir con una de ellas o reservar el anuncio. Cada anuncio cuesta 2 de caja y 4 de energía. Después eliges tu jugada en el mapa.`,
          {launch_first: first.label, launch_second: second.label, keep_interval: 'Reservar el anuncio y seguir la ruta'},
          {launch_first: `Abres con ${first.subject}; dejas ${second.subject} fuera del primer anuncio. Gastas caja y energía.`,
            launch_second: `Abres con ${second.subject}; dejas ${first.subject} fuera del primer anuncio. Gastas caja y energía.`,
            keep_interval: 'Conservas caja y energía. Renuncias a los dos anuncios y eliges tu próxima jugada en el mapa.'});
        result.issueIds = launch.choices.map(choice => choice.issue.id);
        result.topicIds = launch.choices.map(choice => choice.topicId);
        result.optionSpeeches = {
          launch_first: first.issue.reply,
          launch_second: second.issue.reply,
          keep_interval: 'Reservemos el anuncio. Hoy empezamos por la ruta; el programa sigue en pie.'};
        result.optionDetails = {
          launch_first: `${first.issue.reply} ${first.issue.limit}`,
          launch_second: `${second.issue.reply} ${second.issue.limit}`,
          keep_interval: 'No haces ninguno de los dos anuncios ni gastas recursos. El equipo queda disponible; ahora eliges tu jugada.'};
        result.optionIntentions = {...result.optionIntents};
        break;
      }
      result.icon = 'research';
      result.speaker.role = 'Te pide una respuesta';
      scene(issue.title,
        `${issue.shortSituation} ${issue.question}`,
        `${issue.situation} ${issue.question} Tu propuesta: ${issue.brief}. Puedes preparar la respuesta, pedir ayuda al equipo o responder ahora. La preparación te sirve para Medios y el debate. Después eliges tu jugada.`,
        {contrast: 'Preparar mi respuesta', team_review: 'Pedir ayuda al equipo', keep_interval: 'Responder ahora'},
        {contrast: 'Ganas preparación para Medios y el debate. Cuesta dinero; la revisión de tu propuesta queda pendiente.',
          team_review: 'Ganas preparación y cohesión. El colaborador que elijas no podrá hacer otra tarea este turno.',
          keep_interval: 'Conservas caja y equipo disponibles; no añades preparación.'});
      result.issueId=issue.id;
      result.topicId=issue.topicId;
      result.optionSpeeches={contrast:`Mi propuesta: ${issue.brief}. Antes de responder, prepararé cómo explicarla.`,
        team_review:`Mi propuesta: ${issue.brief}. Que el equipo me ayude a preparar la respuesta.`,
        keep_interval:`Mi propuesta: ${issue.brief}. Responderé ahora, sin preparación adicional.`};
      result.optionDetails={contrast:'Revisas los argumentos de tu propuesta antes de responder. Sumas 2 fichas de preparación; queda pendiente revisar la propuesta.',
        team_review:'Eliges a un colaborador para preparar la respuesta. Sumas 1 ficha de preparación y 1 de cohesión; ocupa su tarea de este turno.',
        keep_interval:'Respondes con la propuesta que elegiste al crear la partida. No gastas recursos ni sumas preparación.'};
      break;
    case 'E06': {
      if (['0.7.1', '0.8.0', '0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)) {
        const contradiction = politicalContradiction(state, bundle, {turn});
        if (!contradiction) return null;
        result.icon = 'organize';
        result.issueId = contradiction.id;
        result.topicId = contradiction.topicId;
        result.messages = contradiction.messages;
        team('Tiene que aclarar qué anuncia la campaña');
        scene('Tu campaña dice sí y no',
          'El anuncio de un acto contradice tu programa. ¿Lo corriges o dejas circular los dos mensajes?',
          `Tu programa dice: «${contradiction.programme}». La convocatoria dice: «${contradiction.announcement}». La imprenta ha impreso los dos sin protestar. Puedes corregir el anuncio, encargarlo a Saúl o mantenerlo para buscar atención. Cancelar retira el acto y su anuncio; el programa sigue igual.`,
          {reschedule: 'Corregir el anuncio', saul_mediates: 'Que Saúl acuerde la corrección',
            keep_claim: 'Mantener los dos mensajes', cancel: 'Cancelar el acto y retirar el anuncio'},
          {reschedule: 'Pagas con caja y energía para aclarar qué defiendes. Retiras el mensaje que contradice tu programa.',
            saul_mediates: 'Saúl ocupa su tarea y gastas caja. El equipo acuerda retirar el mensaje contrario.',
            keep_claim: `Buscas atención en ${place} sin gastar. No corriges los mensajes y dejas la contradicción abierta.`,
            cancel: 'Renuncias al acto y retiras su anuncio, sin gasto. Asumes el desgaste de cancelar.'});
        result.optionSpeeches = {
          reschedule: `Retirad ese anuncio. Nuestro programa dice: ${contradiction.programme}.`,
          saul_mediates: 'Saúl, acuerda con el equipo cómo corregir el anuncio. Nuestro programa se mantiene.',
          keep_claim: 'Dejad los dos mensajes. No quiero perder esa atención ahora.',
          cancel: 'Cancelamos ese acto y retiramos su anuncio. El programa se mantiene.'};
        result.optionDetails = {
          reschedule: 'Corriges el anuncio, no tu postura. Cuesta 2 de caja y 4 de energía; buscas recuperar confianza y coordinación.',
          saul_mediates: 'Saúl acuerda la corrección dentro del equipo. Cuesta 1 de caja y ocupa su tarea; se retira el mensaje contrario.',
          keep_claim: 'No gastas caja ni energía. Buscas atención local y aplazas la discusión del equipo; ambos mensajes siguen circulando.',
          cancel: 'Cancelas el acto y retiras su convocatoria. No gastas recursos; la cancelación desgasta la reputación y al equipo.'};
        result.optionIntentions = {...result.optionIntents};
        break;
      }
      const delegation = past.findLast(e => e.kind === 'event' && e.reservedStaff
        && ['E02', 'E03', 'E04'].includes(e.eventId));
      result.antecedent = reference(delegation, `La delegación anterior · turno ${delegation?.turn}`);
      result.icon = 'organize';
      team('Coordina los actos');
      scene('Dos carteles. Un solo candidato.',
        `Dos anuncios te sitúan en dos actos a la misma hora. Tu propuesta de ${topicName} no cabe en dos atriles a la vez. ¿Corriges, delegas o conservas la atención?`,
        `El cartel llama la atención en ${place}, pero la agenda es incompatible. Rehacerla o negociar el horario cierra el problema; conservar el anuncio deja una contradicción pendiente.`,
        {reschedule: '«Corregimos el horario y lo explicamos»', saul_mediates: '«Saúl, acuerda un horario que podamos cumplir»',
          keep_claim: '«Dejemos el cartel; ahora nos da presencia»', cancel: '«Ese segundo acto se cancela»'},
        {reschedule: 'Corriges la agenda y buscas recuperar confianza; pagas con caja y energía.',
          saul_mediates: 'Saúl ocupa su tarea y gastas caja; el cambio acordado cierra la contradicción.',
          keep_claim: 'Priorizas la atención local; aceptas que los anuncios incompatibles sigan abiertos.',
          cancel: 'Cierras el problema sin gasto; asumes el desgaste público e interno de cancelar.'});
      break;
    }
    case 'E09': {
      if (['0.7.1', '0.8.0', '0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)) {
        const contradiction = politicalContradiction(state, bundle, {turn});
        if (!contradiction) return null;
        result.issueId = contradiction.id;
        result.topicId = contradiction.topicId;
        result.messages = contradiction.messages;
        result.priorEntryId = contradiction.priorEntryId;
        result.antecedent = contradiction.priorEntryId ? {entryId: contradiction.priorEntryId,
          turn: contradiction.priorTurn, label: `Mantuviste los dos mensajes · turno ${contradiction.priorTurn}`} : null;
        result.speaker = {kind: 'press', id: 'press', name: 'Lola Rivas', role: 'Pide una respuesta sobre los dos mensajes'};
        scene('¿Con cuál de los dos te quedas?',
          contradiction.priorEntryId
            ? `Conservaste los dos mensajes en el turno ${contradiction.priorTurn}. Ahora aparecen juntos. Lola pregunta: «¿Cuál es tu propuesta?»`
            : 'Lola muestra tu programa y el anuncio que lo contradice. «¿Cuál es tu propuesta?»',
          `Tu programa dice: «${contradiction.programme}». El anuncio dice: «${contradiction.announcement}». Dar la cara o encargar la corrección retira el anuncio contrario, con un coste de credibilidad. Mantener ambos conserva recursos y deja el problema abierto.`,
          {explain: 'Dar la cara y retirar el anuncio', team_correction: 'Que el equipo publique la corrección',
            leave_unresolved: 'No retirar ninguno de los dos mensajes'},
          {explain: 'Gastas energía para explicar el error y retirar el anuncio. Asumes el desgaste público e interno.',
            team_correction: 'Pagas y ocupas una tarea para publicar la corrección. Conservas energía, con mayor desgaste de reputación.',
            leave_unresolved: `No gastas recursos. La contradicción sigue abierta y pone distancia con ${partyName('P2')} y ${partyName('P3')}.`});
        result.optionSpeeches = {
          explain: `Mi propuesta es ${contradiction.proposal}. Dejé circular un anuncio que decía lo contrario. Lo retiro.`,
          team_correction: `Publicad la corrección: proponemos ${contradiction.proposal} y retiramos el anuncio contrario.`,
          leave_unresolved: 'No voy a retirar ninguno de los dos mensajes.'};
        result.optionDetails = {
          explain: 'Cuesta 6 de energía. Retiras el anuncio y cierras la contradicción; no borras el desgaste ni cambias tu programa.',
          team_correction: 'Cuesta 3 de caja y la tarea de un colaborador. Publica la corrección; el equipo trabaja con un solo mensaje.',
          leave_unresolved: `No cuesta caja ni energía. Mantienes la contradicción, con desgaste de reputación y de relación con ${partyName('P2')} y ${partyName('P3')}.`};
        result.optionIntentions = {...result.optionIntents};
        break;
      }
      const claim = past.findLast(e => e.kind === 'event' && e.eventId === 'E06' && e.optionId === 'keep_claim');
      result.antecedent = reference(claim, `Conservaste los dos anuncios · turno ${claim?.turn}`);
      scene('La hemeroteca no acepta llegar a los dos.',
        claim
          ? `Conservaste los dos anuncios en el turno ${claim.turn}. Ahora aparecen juntos: misma hora, mismo candidato. ¿Das la explicación, encargas la corrección o lo dejas abierto?`
          : 'La prensa pregunta por dos anuncios incompatibles: misma hora, mismo candidato. ¿Das la explicación, encargas la corrección o dejas el asunto abierto?',
        `En ${place}, el centro vecinal y el mercado anunciaron tu presencia a la misma hora. Un candidato, dos sitios: ni la furgoneta puede resolverlo. Explicar o delegar cierra la contradicción, con desgaste de credibilidad. Dejarla abierta también pone distancia con ${partyName('P2')} y ${partyName('P3')}.`,
        {explain: '«Debí corregirlo. Esta es la agenda válida»', team_correction: '«Publiquemos la corrección con el equipo»', leave_unresolved: '«Seguimos; no voy a corregir los anuncios»'},
        {explain: 'Das la cara y cierras la contradicción; gastas energía y asumes el desgaste del error.',
          team_correction: 'Buscas una corrección coordinada; pagas, ocupas una tarea y aceptas un mayor desgaste público.',
          leave_unresolved: `Conservas recursos; asumes el desgaste y la distancia con ${partyName('P2')} y ${partyName('P3')}.`});
      result.optionSpeeches = {
        explain: 'Anunciamos dos actos a la misma hora. Fue un error de nuestra agenda; publicamos la corrección y pido disculpas.',
        team_correction: 'Mi equipo publicará la agenda corregida. No voy a pedir a nadie que espere en un acto al que no puedo llegar.',
        leave_unresolved: 'Mantengo los anuncios y la ruta. No voy a dedicar otra intervención a corregir esa agenda.'};
      break;
    }
    case 'E15':
      if (current) {
        scene('Lola quiere el titular. Tu equipo pone una pega.',
          `${issue.shortSituation} Lola pregunta: «${issue.objection}»`,
          `${announced ? 'Abriste la campaña con este problema. ' : ''}${issue.situation} Lola cierra su pieza. Puedes defender tu propuesta con una frase contundente, explicar también su dificultad con el equipo o enviar una nota prudente. ${issue.humour}`,
          {bold_line: 'Lanzar el titular', team_line: 'Explicar también la dificultad', written_note: 'Enviar una nota prudente'},
          {bold_line: 'Buscas más atención nacional. Gastas energía; el equipo pierde cohesión porque dejas el obstáculo fuera de la respuesta.',
            team_line: 'Defiendes la propuesta sin esconder su dificultad. Ocupas una tarea; buscas atención nacional y cohesión.',
            written_note: 'Conservas energía y equipo disponible. Buscas credibilidad, pero cedes atención nacional.'});
        result.issueId = issue.id;
        result.topicId = issue.topicId;
        result.contextNote = {label: 'Lo que pide el equipo', text: issue.limit};
        result.optionSpeeches = {bold_line: issue.reply,
          team_line: `${issue.reply} ${issue.limit}`,
          written_note: `Nuestra propuesta: ${issue.brief}. ${issue.limit}`};
        result.headlineDecision = {caseId: issue.id, proposal: issue.brief, obstacle: issue.limit};
        result.antecedent = announced?.antecedent || null;
        break;
      }
      scene('Una periodista te pide una solución',
        `${issue.shortSituation} ¿Respondes en directo, lo preparas con el equipo o envías una nota?`,
        `${issue.question} ${issue.limit} ${issue.humour} Responder en directo te da visibilidad, pero divide al equipo. Prepararlo con un colaborador ocupa su tarea. La nota escrita da credibilidad, pero menos atención.`,
        {bold_line: 'Defender la propuesta ante el micrófono', team_line: 'Acordar la respuesta con el equipo', written_note: 'Enviar propuesta y límites por escrito'},
        {bold_line: 'Hablas en directo y llamas la atención. Gastas energía y el equipo pierde cohesión.',
          team_line: 'Preparáis la respuesta juntos. El colaborador ocupa su tarea de este turno.',
          written_note: 'No gastas recursos. La nota mejora tu reputación, pero recibes menos atención.'});
      result.issueId = issue.id;
      result.contextNote = {label: 'La objeción del equipo', text: issue.limit};
      result.optionSpeeches = {bold_line: issue.reply,
        team_line: `Mi prioridad: ${issue.brief.toLowerCase()}. Mi equipo y yo vamos a explicar cómo llevarla adelante.`,
        written_note: `${issue.reply} ${issue.limit}`};
      break;
    case 'E16':
      scene('Un micrófono abierto graba la broma del equipo',
        '«El cartel llegará antes que la solución», bromea alguien del equipo. El micrófono estaba abierto. ¿Te ríes, explicas el contexto o proteges a tu gente?',
        `${issue.situation} Querías hablar de esa necesidad; ahora te preguntan por la broma. Bromear llama la atención, pero divide al equipo. Explicar lo ocurrido cuesta dinero y mejora tu reputación. Dejarlo pasar une al equipo, pero pierdes atención.`,
        {own_joke: '«Veo que el micrófono también tiene su campaña»', full_context: '«Expliquemos qué pasó antes y después»', let_it_pass: '«No hagamos una disputa con nuestra propia gente»'},
        {own_joke: 'Respondes con una broma. Gastas energía y el equipo pierde cohesión.',
          full_context: current
            ? 'Preparas la explicación. Cuesta caja; buscas reputación y preparación, sin convertirlo en otra broma.'
            : 'Pagas para preparar la explicación. Mejoras tu reputación, pero pierdes atención.',
          let_it_pass: 'No gastas recursos y el equipo gana cohesión. Pierdes atención en los medios nacionales.'});
      result.issueId = issue.id;
      result.optionSpeeches = {
        own_joke: `El micrófono ha hecho más campaña que la furgoneta. Ahora, la propuesta: ${issue.brief.toLowerCase()}.`,
        full_context: `Era una broma interna sobre nuestros anuncios, no sobre quien espera una solución. ${issue.reply}`,
        let_it_pass: 'No voy a convertir una broma interna en una disputa con mi equipo. Seguimos con la agenda.'};
      break;
    case 'E19':
      scene('Dices cien reuniones cuando eran diez',
        'Tu guion decía «10 reuniones» y has dicho «100» en antena. La redacción ya tiene el corte. ¿Corriges, lo explica el equipo o te ríes de tu cero de más?',
        `Tu guion hablaba de reuniones de campaña; no estabas dando una estadística del país. Querías explicar tu propuesta: ${issue.brief}. La postura se mantiene. Dar la cara apuesta por credibilidad; delegar ocupa una tarea. La broma disputa atención y trata la cifra con menos seriedad.`,
        {correct_now: '«He confundido la cifra. La corrijo»', team_explanation: '«Preparad una explicación con la cifra correcta»', admit_with_humour: '«A esa cifra le sobró un poco de entusiasmo»'},
        {correct_now: 'Asumes el error para recuperar credibilidad; gastas energía y cedes protagonismo.',
          team_explanation: 'El equipo prepara la corrección. Cuesta dinero, ocupa una tarea y cambia la cohesión.',
          admit_with_humour: 'No gastas recursos y llamas la atención. Pierdes reputación por bromear con el error.'});
      result.issueId = issue.id;
      result.optionSpeeches = {
        correct_now: 'Dije cien reuniones y el guion decía diez. Me equivoqué; corrijo la cifra antes de seguir con la propuesta.',
        team_explanation: `Publicaremos la corrección: diez reuniones, no cien. Después, mi equipo explicará nuestra propuesta: ${issue.brief}.`,
        admit_with_humour: 'Se me ha colado un cero con muchas ganas de hacer campaña. Eran diez reuniones, no cien.'};
      break;
    case 'E20': {
      const loss = (entry, stat) => (entry.changes || []).filter(c => c.stat === stat
        && (stat === 'support' ? c.partyId === entry.partyId : c.target === entry.partyId)
        && typeof c.delta === 'number' && Number.isFinite(c.delta)).reduce((sum, c) => sum + c.delta, 0);
      const blunder = past.findLast(e => e.kind === 'rival' && e.actionId === 'contrast'
        && e.partyId !== 'P1' && party(e.partyId) && (current
          ? party(e.target) && e.target !== e.partyId && (loss(e, 'support') < 0 || loss(e, 'reputation') < 0)
          : (e.changes || []).some(change =>
          change.stat === 'support' && change.partyId === e.partyId && negative(change.delta)
          || change.stat === 'reputation' && change.target === e.partyId && negative(change.delta))));
      result.antecedent = reference(blunder, `${blunder ? partyName(blunder.partyId) : 'Contraste rival'} · turno ${blunder?.turn}`);
      if (blunder) result.speaker = {kind: 'party', id: blunder.partyId, name: partyName(blunder.partyId), role: 'Su contraste perjudicó a su propia campaña'};
      const setback = blunder && current
        ? `${partyName(blunder.partyId)} ${loss(blunder, 'support') < 0 ? 'perdió apoyo' : 'dañó su reputación'} tras ${blunder.target === 'P1' ? 'criticarte' : `criticar a ${partyName(blunder.target)}`}`
        : blunder ? `${partyName(blunder.partyId)} perdió apoyo tras criticarte` : '';
      scene(blunder ? 'Un rival mete la pata en un vídeo' : 'Un vídeo de campaña se hace viral',
        blunder
          ? `${setback}; el vídeo circula. ¿Le respondes, hablas con otros partidos o vuelves a ${place}?`
          : `Un vídeo de campaña circula por las redes. ¿Le respondes, hablas con otros partidos o vuelves a ${place}?`,
        `${issue.situation} Esa necesidad sigue esperando mientras el vídeo ocupa el boletín. Tu propuesta: ${issue.brief.toLowerCase()}. Puedes responder al vídeo, hablar de pactos o explicar tu propuesta en ${place}.`,
        {amplify_clip: '«Respondamos con ese fragmento»', cool_reaction: '«Prefiero abrir una conversación»', local_priority: `«Mi prioridad sigue en ${place}»`},
        {amplify_clip: 'Respondes al vídeo para llamar la atención. Gastas dinero y energía; el equipo pierde cohesión.',
          cool_reaction: current
            ? `Hablas con ${partyName('P2')} y ${partyName('P3')}. Buscas confianza y algo de alcance, sin gastar recursos.`
            : `Mejoras la relación con ${partyName('P2')} y ${partyName('P3')}. No gastas recursos, pero pierdes atención.`,
          local_priority: 'Defiendes tu prioridad local; empleas energía y renuncias a disputar el vídeo.'});
      result.issueId = issue.id;
      result.optionSpeeches = {
        amplify_clip: `Ese fragmento merece una respuesta. Mi propuesta: ${issue.brief.toLowerCase()}.`,
        cool_reaction: `Prefiero hablar con ${partyName('P2')} y ${partyName('P3')} antes que encadenar vídeos. No he cambiado mi programa.`,
        local_priority: `${issue.reply} Voy a explicarlo en ${place}; no a pasar la mañana repitiendo ese vídeo.`};
      break;
    }
    case 'E21': {
      const attacker = past.findLast(e => e.kind === 'rival' && e.actionId === 'contrast' && e.target === 'P1'
        && e.partyId !== 'P1' && party(e.partyId));
      result.antecedent = reference(attacker, `${attacker ? partyName(attacker.partyId) : 'Contraste rival'} criticó tu propuesta · turno ${attacker?.turn}`);
      result.speaker={kind:'press',id:'press',name:'La redacción',role:'Pregunta por tu propuesta pública'};
      scene('La periodista insiste: ¿cómo lo harás?',
        `${issue.situation} «${issue.objection}». ¿Respondes, delegas o sigues?`,
        `${attacker?`Antes, ${partyName(attacker.partyId)} criticó tu propuesta. `:''}Tu propuesta: ${issue.brief.toLowerCase()}. ${issue.limit} Responder mejora tu reputación y tu visibilidad, pero cuesta dinero y energía. Inés puede preparar una respuesta breve. Si sigues tu agenda, dejas la pregunta sin responder.`,
        {long_answer: '«Voy a explicar mi propuesta con detalle»', ines_brief: '«Inés, prepara la respuesta»', keep_own_agenda: '«No voy a hacer toda la campaña respondiendo»'},
        {long_answer: 'Defiendes tu credibilidad con detalle; gastas caja y energía que no podrás dedicar a otras jugadas.',
          ines_brief: 'Inés prepara la respuesta. Cuesta dinero y ocupa su tarea.',
          keep_own_agenda: 'No gastas recursos y el equipo gana cohesión. Pierdes atención en los medios nacionales.'});
      result.issueId = issue.id;
      result.optionSpeeches = {long_answer: `${issue.reply} ${issue.limit}`,
        ines_brief: `Inés, explica nuestra propuesta: ${issue.brief}. Incluye el límite; no quiero un eslogan que lo esconda.`,
        keep_own_agenda: 'La propuesta sigue en pie. Hoy mantengo la agenda; no voy a responder otra vez ante el micrófono.'};
      break;
    }
    case 'E22': {
      const publicProvision = state.parties.P1.positions.T2 === -1;
      const railReply = publicProvision
        ? 'Defenderé más personal, mantenimiento y capacidad en la red pública. Los viajeros necesitan un servicio que funcione.'
        : 'Defenderé reforzar el servicio público y contratar apoyo con plazos y control público. Los viajeros necesitan una alternativa.';
      if (current) {
        const proposal = publicProvision
          ? 'más personal y mantenimiento en la red pública'
          : 'reforzar el servicio público y contratar apoyo supervisado';
        scene('Nuria teme perder su cita. Andrés no llega al trabajo.',
          `Un tren averiado deja a los viajeros esperando en ${place}. Lola ofrece entrevistarte: ¿vas al andén, defiendes tu plan o esperas información?`,
          'Nuria lleva meses esperando una consulta y teme perderla. Andrés avisa al trabajo de que no llegará a su turno. Nadie les dice cuándo saldrá otro tren. Lola pregunta qué harías para evitar que vuelva a pasar. Aún no se sabe qué causó la avería. El tren no ha leído el programa electoral.',
          {listen_affected: `Ir al andén de ${place}`, prepared_position: 'Defender mi plan en la entrevista', wait_for_details: 'No intervenir todavía'},
          {listen_affected: `Das prioridad a los viajeros y a la presencia en ${place}. Gastas energía; no haces la entrevista nacional de esta noticia.`,
            prepared_position: 'Llevas tu propuesta a la entrevista nacional. Usas una ficha, caja y energía; no vas al andén en esta noticia.',
            wait_for_details: 'Esperas información y conservas recursos. Buscas prudencia y cohesión; cedes atención nacional.'});
        result.contextNote = {label: 'Tu propuesta de servicios', text: proposal};
        result.optionSpeeches = {
          listen_affected: 'Nuria, Andrés: ¿os han dicho si habrá otro tren o un autobús? Quiero escucharos antes de salir ante las cámaras.',
          prepared_position: `${railReply} Todavía no sabemos qué ha fallado; no voy a inventarme un culpable.`,
          wait_for_details: 'Primero quiero saber qué ha pasado. No voy a anunciar una reparación que no puedo garantizar.'};
        result.railDecision = {provinceId, publicProvision, proposal};
        break;
      }
      scene('Un tren averiado deja a los viajeros esperando',
        'Una avería deja a viajeros en el andén. Nuria teme perder una consulta; Andrés, su turno de trabajo. ¿Los escuchas, explicas tu plan o esperas datos?',
        `Todavía no conoces la causa ni el plazo de reparación: no la atribuyas a nadie. ${railReply} Escuchar en ${place} cuesta energía. Explicar tu propuesta usa preparación, caja y energía; no repara la avería. Esperar conserva recursos y cede la primera atención.`,
        {listen_affected: 'Escuchar a los viajeros en el andén', prepared_position: 'Explicar cómo reforzarías el servicio', wait_for_details: 'Esperar datos antes de intervenir'},
        {listen_affected: 'Priorizas escuchar y estar presente; el candidato gasta energía.',
          prepared_position: 'Defiendes tu propuesta con una ficha, caja y energía; renuncias a esperar más datos.',
          wait_for_details: 'Priorizas prudencia y equipo sin gasto; aceptas ceder la primera atención.'});
      result.optionSpeeches = {
        listen_affected: 'Antes del comunicado, quiero escuchar a quienes esperan. ¿Qué viaje han perdido y qué información necesitan?',
        prepared_position: railReply,
        wait_for_details: 'No voy a inventar una causa ni un plazo. Esperaré información contrastada antes de hacer mi intervención.'};
      break;
    }
  }

  // Aliases describe existing decisions; they cannot introduce a new command.
  const optionIds = new Set(event.options.map(option => option.id));
  for (const key of Object.keys(result.optionLabels)) if (!optionIds.has(key)) delete result.optionLabels[key];
  for (const key of Object.keys(result.optionIntents)) if (!optionIds.has(key)) delete result.optionIntents[key];
  for (const key of Object.keys(result.optionSpeeches)) if (!optionIds.has(key)) delete result.optionSpeeches[key];
  for (const field of ['optionDetails', 'optionIntentions']) if (result[field])
    for (const key of Object.keys(result[field])) if (!optionIds.has(key)) delete result[field][key];
  return result.title ? result : null;
}
