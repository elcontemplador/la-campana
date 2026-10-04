import {resolveCampaignBundle} from '../core/campaign.mjs';
import {campaignIssue} from './issue-cases.mjs';

const optionIds = ['announce_now', 'costed_commitment', 'postpone_answer'];
const explanations = {
  autonomos: {
    '-1': {
      question: '¿Cómo financiarías las ayudas y evitarías que llegasen tarde?',
      commitment: 'Antes de las urnas explicaré cómo financiaría las ayudas y evitaría que llegasen tarde.',
      postponement: 'Mantengo mi propuesta. Hoy aplazo la explicación de la financiación y los plazos de las ayudas.',
      request: 'las ayudas para abrir el taller de Marta',
      delivery: 'una explicación de la financiación y los plazos de las ayudas',
      explanation: 'Propondría reservar una partida para ayudas de arranque, dando menos prioridad a otros gastos. Habría un anticipo y otro pago al justificar los gastos. Publicaría el calendario de pagos; ponerlo en marcha dependería de aprobar esa financiación.',
    },
    '1': {
      question: '¿Cómo pagarías la protección de los autónomos si cobras menos al empezar?',
      commitment: 'Antes de las urnas explicaré cómo financiaría la protección de los autónomos al cobrar menos al empezar.',
      postponement: 'Mantengo mi propuesta. Hoy no voy a explicar cómo pagaría la protección de los autónomos.',
      request: 'los pagos al abrir el taller de Marta',
      delivery: 'una explicación de los ingresos y la protección de los autónomos',
      explanation: 'Propondría cubrir la rebaja inicial con el presupuesto general, reasignando gasto. La cuota ordinaria volvería tras el arranque y la protección se mantendría durante la rebaja. Habría que acordar qué otros gastos reciben menos dinero.',
    },
  },
  'primer-empleo': {
    '-1': {
      question: '¿Cómo comprobarías que las ayudas crean empleo y no sustituyen puestos normales?',
      commitment: 'Antes de las urnas explicaré cómo comprobaría que las ayudas crean empleo y que la formación no sustituye puestos normales.',
      postponement: 'Mantengo mi propuesta. Hoy aplazo la explicación de los controles de las ayudas y la formación.',
      request: 'las ayudas para el primer empleo de Dani',
      delivery: 'una explicación de los controles de las ayudas y la formación',
      explanation: 'Propondría exigir un puesto nuevo, un contrato estable y formación con tutor para recibir la ayuda. Se comprobaría que no sustituye a otra persona; incumplir obligaría a devolverla. Esos controles también necesitarían personal y presupuesto.',
    },
    '1': {
      question: '¿Cómo evitarías que las empresas encadenasen contratos baratos?',
      commitment: 'Antes de las urnas explicaré qué controles propondría para evitar que se encadenasen contratos baratos.',
      postponement: 'Mantengo mi propuesta. Hoy aplazo la explicación de los controles contra los contratos baratos.',
      request: 'la rebaja del coste de la primera contratación',
      delivery: 'una explicación de los controles contra el abuso de contratos baratos',
      explanation: 'Propondría limitar la rebaja a la primera contratación y exigir una duración mínima. Se revisarían las sustituciones de plantilla; encadenar contratos para repetir la rebaja obligaría a devolverla. La inspección también necesitaría recursos.',
    },
  },
  energia: {
    '-1': {
      question: '¿Quién pagaría las ayudas y cuándo ahorraría la fábrica?',
      commitment: 'Antes de las urnas explicaré cómo pagaría las ayudas y de qué dependería que bajasen los gastos de la fábrica.',
      postponement: 'Mantengo mi propuesta. Hoy aplazo la explicación de quién pagaría las ayudas y cuándo podrían reducir los gastos.',
      request: 'las ayudas para ahorrar energía en la fábrica',
      delivery: 'una explicación de la financiación y los plazos de ahorro',
      explanation: 'Propondría una partida pública para financiar parte de las mejoras; la empresa pagaría el resto. El ahorro podría llegar tras instalar y comprobar los equipos. Aprobar la financiación y hacer las obras marcaría los plazos.',
    },
    '1': {
      question: 'Si bajas los impuestos a la luz, ¿de dónde sale el dinero para los servicios?',
      commitment: 'Antes de las urnas diré qué gastos recortaría para bajar los impuestos a la luz y cuándo podrían funcionar las nuevas instalaciones.',
      postponement: 'Mantengo mi propuesta. Hoy no voy a decir qué gastos recortaría ni cuándo habría nuevas instalaciones.',
      request: 'la rebaja de impuestos a la luz y los permisos',
      delivery: 'una explicación de la financiación y los plazos de las instalaciones',
      explanation: 'Propondría compensar la rebaja con menos gasto en otras partidas, que habría que acordar en el presupuesto. Los permisos tendrían un trámite más rápido manteniendo los controles. Las obras y la conexión a la red seguirían marcando cuándo llega la nueva energía.',
    },
  },
};

// This is the public account of E04, including its promised explanation.
// It never reads polls, private rival state, pending plans or promise outcomes.
export function economicDilemma(state, sourceBundle, {turn = state?.turn} = {}) {
  if (!['0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion) || state.contentVersion !== state.rulesVersion
    || typeof state.seed !== 'string' || !Number.isSafeInteger(turn)
    || turn < 1 || turn > state.turn) return null;
  let bundle;
  try { bundle = resolveCampaignBundle(sourceBundle, state); }
  catch { return null; }
  if (bundle.config.rulesVersion !== state.rulesVersion || bundle.content.version !== state.contentVersion) return null;
  const event = bundle.content.events.find(item => item.id === 'E04' && item.turn === turn);
  if (event?.options?.length !== optionIds.length
    || !optionIds.every(id => event.options.some(option => option.id === id))) return null;
  const ownEntry = entry => entry && (!entry.partyId || entry.partyId === 'P1')
    && typeof entry.id === 'string' && entry.id.length > 0;
  const current = state.phase === 'event' && state.activeEvent === 'E04' && state.turn === turn;
  const recorded = (state.timeline || []).some(entry => ownEntry(entry) && entry.kind === 'event'
    && entry.eventId === 'E04' && entry.turn === turn && optionIds.includes(entry.optionId));
  if (!current && !recorded) return null;
  const visit = (state.timeline || []).findLast(entry => ownEntry(entry) && entry.kind === 'plan'
    && entry.actorId === 'candidate' && entry.actionId === 'visit'
    && Number.isSafeInteger(entry.turn) && entry.turn > 0 && entry.turn < turn
    && bundle.provinces.districts.some(province => province.id === entry.target));
  const provinceId = visit?.target || state.initialSetup?.province;
  const place = bundle.provinces.districts.find(province => province.id === provinceId)?.name;
  const actor = bundle.config.civilActors.find(item => item.id === 'C2');
  if (!place || !actor) return null;
  const issue = campaignIssue(state, bundle, {topicId: 'T3', sceneKey: 'E04', provinceId});
  const explanation = explanations[issue?.id]?.[state.parties?.P1?.positions?.T3];
  if (!explanation) return null;
  return {
    eventId: 'E04', turn, provinceId, format: 'politics', icon: 'interview',
    title: issue.title,
    shortBody: `${issue.shortSituation} ${explanation.question}`,
    body: `${issue.situation} Hay prensa en el encuentro con ${actor.name}. Tu propuesta: ${issue.brief}. ${actor.name} pregunta: «${explanation.question}» Puedes defenderla ante la prensa, prometer una respuesta antes de las urnas o aplazar la respuesta. Después eliges tu jugada.`,
    optionLabels: {
      announce_now: 'Defender mi propuesta ante la prensa',
      costed_commitment: 'Prometer una respuesta antes de las urnas',
      postpone_answer: 'Aplazar la respuesta',
    },
    optionSpeeches: {
      announce_now: issue.reply,
      costed_commitment: explanation.commitment,
      postpone_answer: explanation.postponement,
    },
    optionIntents: {
      announce_now: 'Defiendes tu propuesta ante la prensa. Gastas caja y energía; dejas la pregunta sin una respuesta detallada.',
      costed_commitment: 'Trabajas la explicación y prometes entregarla en el turno 10. Gastas energía y renuncias al anuncio de hoy.',
      postpone_answer: `Conservas recursos y aplazas la respuesta. El contacto con ${actor.name} puede enfriarse.`,
    },
    optionDetails: {
      announce_now: `Tu intervención pública busca alcance en ${place}, según tu propuesta y la preferencia local. La pregunta de ${actor.name} queda sin una explicación detallada.`,
      costed_commitment: `Prometes ${explanation.delivery} para el turno 10. El trabajo de hoy prepara la respuesta y busca reforzar la relación con ${actor.name}. La entrega también necesitará recursos.`,
      postpone_answer: `No abres una nueva promesa ni gastas recursos. Aplazar la respuesta puede enfriar la relación con ${actor.name}; tu programa se mantiene.`,
    },
    speaker: {kind: 'civil', id: 'C2', name: actor.name, role: 'Pregunta con la prensa presente'},
    antecedent: null, issueId: issue.id, topicId: issue.topicId,
    economicDecision: {caseId: issue.id, question: explanation.question, proposal: issue.proposal,
      request: explanation.request, delivery: explanation.delivery, explanation: explanation.explanation},
  };
}
