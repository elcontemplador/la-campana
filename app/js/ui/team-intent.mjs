// Intentions for existing staff tasks, using only the legal draft and public facts.
import {resolveCampaignBundle} from '../core/campaign.mjs';
import {actionCost, validatePlan} from '../core/actions.mjs';
import {teamWork, teamTaskLabel} from './team.mjs';
import {ownAgreementPreparation, dialoguePreparation} from './play.mjs';

const sign = n => n > 0 ? `+${n}` : String(n);
const clamp = (n, limits) => Math.min(limits.max, Math.max(limits.min, n));

export function teamIntent(state, sourceBundle, {staffId, task, plan} = {}) {
  if (!state) return null;
  const bundle = resolveCampaignBundle(sourceBundle, state), {config} = bundle;
  const actor = config.staff.find(s => s.id === staffId);
  const action = config.staffActions.find(a => a.id === task?.id);
  const title = teamTaskLabel(task?.id, action?.label || 'Tarea del equipo');
  const result = {title, reason: '', outcome: '', timing: '', badge: '', warning: null, legal: false,
    cost: action ? actionCost(state, bundle, 'P1', staffId, task.id, task.target ?? null) : {budget: 0, energy: 0}};
  if (!actor || !state.selectedStaff.includes(staffId) || !action) {
    return {...result, reason: 'Elige una tarea del catálogo para un integrante de tu equipo.',
      outcome: 'No hay una tarea válida preparada.', badge: 'Elige una tarea', warning: 'Integrante o tarea no disponible.'};
  }
  const draft = plan ? {...plan, candidate: plan.candidate ? {...plan.candidate} : null,
    staff: {...plan.staff, [staffId]: {...task}}} : null;
  const validation = draft ? validatePlan(state, draft, sourceBundle) : null;
  result.legal = state.phase === 'planning' && !state.reservedStaff.includes(staffId) && validation?.ok === true;
  const work = teamWork(state, sourceBundle, {plan: draft, provinceId: task.target, rivalId: task.target});
  const effect = work.effects[staffId];
  const topic = config.topics.find(t => t.id === state.commitments[0]);
  const ownPosition = topic?.poles.find(p => p.id === state.parties.P1.positions[topic.id])?.label;
  const place = bundle.provinces.districts.find(d => d.id === task.target)?.name || task.target;
  const closes = work.organization.remainingCloses;
  const previous = (state.timeline || []).findLast(e => e.turn < state.turn && e.kind === 'plan'
    && e.actorId === staffId && e.actionId === task.id && (e.target ?? null) === (task.target ?? null));
  if (previous) result.entryId = previous.id;

  if (task.id === 'organize') {
    result.title = `${title} · ${place}`;
    const visit = draft?.candidate?.id === 'visit';
    const visitPlace = bundle.provinces.districts.find(d => d.id === draft?.candidate?.target)?.name;
    result.reason = visit && draft.candidate.target === task.target
      ? `Tu visita te lleva a ${place}. El equipo deja voluntarios para que el trabajo siga cuando te marches.`
      : visit ? `Visitas ${visitPlace}; el equipo organiza ${place}. La presencia local sigue sin esperar tu siguiente visita.`
      : `En ${place}, el equipo organiza voluntarios mientras tú ${draft?.candidate?.id === 'fundraise' ? 'recaudas' : draft?.candidate?.id === 'rest' ? 'descansas' : draft?.candidate?.id === 'interview' ? 'intervienes en medios' : 'haces tu jugada'}. Esa presencia trabaja en cada cierre.`;
    result.outcome = effect ? `Equipo local ${effect.before} → ${effect.after} (${sign(effect.gain)}). Trabaja desde hoy; quedan ${closes} ${closes === 1 ? 'cierre' : 'cierres'}, incluido este.` : '';
    result.timing = closes === 1 ? 'Equipo → último cierre de campaña' : `Equipo → cierre de hoy y ${closes - 1} posteriores`;
    if (effect?.gain === 0) result.warning = 'La organización ya está al máximo; la tarea sigue costando caja.';
    else if (closes === 1) result.warning = 'Solo queda el cierre de hoy para aprovechar ese equipo local.';
  } else if (task.id === 'prepare') {
    const media = ['interview', 'contrast'].includes(draft?.candidate?.id);
    result.reason = media ? `Tu prioridad es «${ownPosition}». Ensayáis cómo defenderla; el equipo prepara antes de tu intervención de hoy.`
      : state.turn === config.turns ? `Ensayáis «${ownPosition}», pero la jugada elegida no usa preparación y este es el último turno.`
      : `Tu prioridad es «${ownPosition}». Ensayáis argumentos que quedarán disponibles para una intervención posterior.`;
    result.outcome = effect ? `Preparación ${effect.before} → ${effect.after} (${sign(effect.gain)}). ${media
      ? `Tu intervención usa ${work.preparation.used} ficha; quedan ${work.preparation.afterAction}.`
      : `Tras el equipo, reservas ${work.preparation.proposed} fichas.`}` : '';
    result.timing = media ? 'Equipo → intervención de hoy → reserva restante'
      : state.turn < config.turns ? 'Equipo → próxima intervención que elijas' : 'Último turno → no hay otra intervención de campaña';
    if (effect?.gain === 0) result.warning = 'La preparación ya está al máximo al llegar esta tarea; sigues pagando el ensayo.';
    else if (!media && state.turn === config.turns) result.warning = 'La jugada elegida no usa preparación y ya no habrá otra intervención de campaña.';
  } else if (task.id === 'mediate') {
    const rival = config.parties.find(p => p.id === task.target);
    result.title = `${title} · ${rival?.name || task.target}`;
    const common = config.topics.filter(t => state.parties.P1.positions[t.id] === rival?.positions[t.id]);
    const different = config.topics.find(t => state.parties.P1.positions[t.id] !== rival?.positions[t.id]);
    if (!common.length) result.reason = 'No compartís postura en los cuatro temas. Hablar abre interlocución; tu programa se mantiene.';
    else if (!different) result.reason = 'Compartís las cuatro posturas. La reunión mantiene interlocución; coincidir no decide un voto de investidura.';
    else {
      const shared = common[0].poles.find(p => p.id === state.parties.P1.positions[common[0].id]).label;
      result.reason = `Compartís «${shared}»; diferís en ${different.name.toLowerCase()}. Hablar no modifica tu programa.`;
    }
    result.outcome = effect ? `Reunión: confianza ${effect.before} → ${effect.after} (${sign(effect.gain)}). El acuerdo depende también del programa.` : '';
    const agreement=ownAgreementPreparation(state,bundle,{partnerId:task.target});
    if(agreement&&effect?.gain>0)result.agreementPurpose=agreement.reason;
    else if(effect?.gain>0){
      const bridge=dialoguePreparation(state,bundle);
      if(bridge?.nextTarget===task.target)result.agreementPurpose=`Buscáis acercar a ${bridge.partners.map(p=>p.name).join(' y ')} para valorar una propuesta ajena. Tu apoyo dependerá del programa y del recuento.`;
    }
    result.timing = 'Reunión hoy → conversación tras el recuento';
    if (effect?.gain === 0) result.warning = 'La confianza ya está al máximo; esta reunión sigue costando caja.';
    else if (draft?.candidate?.id === 'contrast' && draft.candidate.target === task.target)
      result.warning = 'Después, el contraste del candidato enfría a ese mismo interlocutor.';
  } else if (task.id === 'wait') {
    result.reason = 'Este integrante no hace una tarea adicional. Guardas su coste para la agenda del candidato o una negociación posterior.';
    result.outcome = 'Coste 0: no añade ingresos, preparación, organización ni confianza.';
    result.timing = 'Este turno → conservar caja';
  } else if (task.id === 'research') {
    result.title = `${title} · ${place}`;
    result.reason = `El equipo contrasta información de ${place} para decidir dónde volver. Afinar el sondeo no aumenta tu apoyo.`;
    result.outcome = state.turn === config.turns ? 'Afinas el último sondeo; ya no hay otra publicación de campaña.'
      : 'Reduce la incertidumbre en las dos próximas publicaciones del sondeo.';
    result.timing = state.turn === config.turns ? 'Cierre de hoy → último sondeo' : 'Cierre de hoy → sondeo de hoy y del turno siguiente';
    const earlierResearch = result.legal && Object.entries(draft.staff).some(([id, item]) => id.localeCompare(staffId) < 0
      && item.id === 'research' && item.target === task.target);
    if (earlierResearch) result.warning = 'Otra tarea del equipo ya afina esa provincia hoy; repetir no mejora más la precisión.';
    else if (state.parties.P1.research?.[task.target]?.through >= state.turn + 1)
      result.warning = 'La precisión ya cubre estas publicaciones; pagar otra tarea no extiende ese plazo.';
    else if (state.turn === config.turns) result.warning = 'Después de este sondeo viene el recuento; ya no podrás cambiar la campaña.';
  } else if (task.id === 'outreach') {
    const civil = config.civilActors.find(c => c.id === task.target);
    result.title = `${title} · ${civil?.name || task.target}`;
    result.reason = `El equipo abre conversación con ${civil?.name || 'la asociación'} mientras tú haces tu jugada.`;
    const rapport = {...state.rapport};
    let profileUsed = Boolean(state.profileUsed?.rapport), gain = 0, before = 0, after = 0;
    if (result.legal) for (const [id, item] of Object.entries(draft.staff).sort(([a], [b]) => a.localeCompare(b))) {
      if (item.id !== 'outreach') continue;
      const specialist = config.staff.find(s => s.id === id);
      let delta = action.effect.rapport + (specialist?.bonus.extraRapport || 0);
      if (state.candidate.profile === 'conexion' && !profileUsed) {delta += 1; profileUsed = true;}
      const old = rapport[item.target];
      rapport[item.target] = clamp(old + delta, config.resources.rapport);
      if (id === staffId) {before = old; after = rapport[item.target]; gain = after - old;}
    }
    result.outcome = result.legal ? `Relación civil ${before} → ${after} (${sign(gain)}). El contacto puede abrir nuevas noticias.` : '';
    result.timing = state.turn === config.turns ? 'Último turno → contacto registrado' : 'Contacto hoy → posibles noticias posteriores';
    if (result.legal && gain === 0) result.warning = 'La relación civil ya está al máximo; el contacto sigue costando caja.';
    else if (state.turn === config.turns) result.warning = 'No quedan noticias posteriores de campaña para aprovechar este contacto.';
  } else if (task.id === 'advertise') {
    result.title = `${title} · ${task.target === 'national' ? 'Nacional' : place}`;
    result.reason = 'Pagas espacio para llevar tu mensaje a más público, mientras el candidato mantiene su propia jugada.';
    result.outcome = 'Busca alcance inmediato; el sondeo también incluye a los rivales y no garantiza votos ni escaños.';
    result.timing = 'Equipo → alcance antes del sondeo de este cierre';
  }

  if (result.legal) {
    if (task.id === 'organize') result.badge = effect?.gain === 0 ? 'Ya al máximo'
      : `${sign(effect.gain)} equipo · ${closes === 1 ? 'Solo este cierre' : `${closes} cierres`}`;
    else if (task.id === 'prepare') {
      const usedToday = ['interview', 'contrast'].includes(draft?.candidate?.id);
      result.badge = !usedToday && state.turn === config.turns ? 'Ya no habrá otra intervención'
        : effect?.gain === 0 ? 'Ya al máximo'
        : `${sign(effect.gain)} ${effect.gain === 1 ? 'ficha' : 'fichas'} · ${usedToday
          ? draft.candidate.id === 'interview' ? 'Medios hoy' : 'Intervención hoy' : 'Reserva'}`;
    } else if (task.id === 'mediate') result.badge = effect?.gain === 0 ? 'Ya al máximo'
      : `Confianza ${effect.before} → ${effect.after}`;
    else if (task.id === 'wait') result.badge = 'Sin gasto';
  }
  if (!result.legal) {
    result.outcome = 'Esta tarea no se ejecutará mientras la agenda completa no sea válida.';
    result.warning = state.reservedStaff.includes(staffId) ? 'Ya dedica su tarea a la noticia o al debate de hoy.'
      : state.phase !== 'planning' ? 'Las tareas se preparan al planificar y se ejecutan al pulsar Jugar.'
      : validation?.error?.message || 'Completa la jugada y las tareas de los integrantes disponibles.';
    result.badge = state.reservedStaff.includes(staffId) ? 'Integrante ocupado'
      : ['INSUFFICIENT_BUDGET', 'INSUFFICIENT_ENERGY'].includes(validation?.error?.code) ? 'Revisa recursos de la agenda'
      : 'Revisa la agenda';
  }
  const aims = {
    organize: closes===1?'Los voluntarios trabajan en el cierre de hoy.':'Deja presencia local para los próximos cierres, aunque visites otro lugar.',
    prepare: ['interview','contrast'].includes(draft?.candidate?.id)?'Ensaya tu prioridad para reforzar la intervención de hoy.':'Prepara tu prioridad para una próxima intervención.',
    mediate: result.agreementPurpose||result.reason,
    wait: 'Reserva caja para tu jugada o para negociar después.',
    research: 'Comprueba el sondeo para elegir mejor el siguiente destino.',
    outreach: 'Abre un contacto civil que puede traer nuevas noticias.',
    advertise: 'Lleva tu mensaje a más público mientras haces tu jugada.',
  };
  result.brief=aims[task.id]||result.reason;
  return result;
}
