import {fail, present} from './utils.mjs';
import {resolveCampaignBundle} from './campaign.mjs';

export function actionCost(state, bundle, partyId, actorId, actionId, target = null) {
  const list = actorId === 'candidate' ? bundle.config.candidateActions : bundle.config.staffActions;
  const a = list.find(x => x.id === actionId);
  if (!a) throw new Error('Acción desconocida');
  const cost = {...(target === 'national' && a.nationalCost ? a.nationalCost : a.cost)};
  if (partyId === 'P1') {
    const profile = bundle.config.candidateProfiles.find(x => x.id === state.candidate.profile);
    if (profile.drawback.action === actionId) cost[profile.drawback.resource] += profile.drawback.extra;
    if (actorId !== 'candidate') {
      const specialist = bundle.config.staff.find(x => x.id === actorId);
      if (specialist?.bonus.action === actionId && specialist.bonus.discountBudget) cost.budget -= specialist.bonus.discountBudget;
    }
  }
  cost.budget = Math.max(0, cost.budget);
  cost.energy = Math.max(0, cost.energy);
  return cost;
}

export function validatePlan(state, plan, bundle, partyId = 'P1') {
  bundle = resolveCampaignBundle(bundle, state);
  if (!plan || typeof plan !== 'object' || !plan.candidate || !plan.staff || Array.isArray(plan.staff)) return fail('INVALID_PLAN', 'Completa una acción de candidato y las tareas del equipo');
  const own = state.parties[partyId];
  if (!own) return fail('UNKNOWN_PARTY', 'Candidatura no válida');
  const staffIds = partyId === 'P1' ? state.selectedStaff : ['G1', 'G2'];
  const available = staffIds.filter(id => partyId !== 'P1' || !state.reservedStaff.includes(id));
  if (Object.keys(plan.staff).some(id => !available.includes(id))) return fail('STAFF_UNAVAILABLE', 'Una tarea usa a un colaborador que ya está ocupado');
  if (available.some(id => !Object.hasOwn(plan.staff, id))) return fail('INCOMPLETE_PLAN', 'Asigna una tarea a cada colaborador disponible');
  const items = [['candidate', plan.candidate], ...available.sort().map(id => [id, plan.staff[id]])];
  const cost = {budget: 0, energy: 0};
  for (const [actor, item] of items) {
    if (!item || typeof item.id !== 'string' || Object.keys(item).some(k => !['id', 'target'].includes(k))) return fail('INVALID_ACTION', 'Una acción no tiene el formato esperado');
    const list = actor === 'candidate' ? bundle.config.candidateActions : bundle.config.staffActions;
    const action = list.find(x => x.id === item.id);
    if (!action) return fail('INVALID_ACTION', 'Elige una acción del catálogo');
    const target = item.target ?? null;
    const party = bundle.config.parties.find(p => p.id === partyId);
    const provinceTarget = bundle.provinces.districts.some(d => d.id === target) && present(party, target);
    if (action.target === 'none' && target !== null) return fail('INVALID_TARGET', 'Esta acción no necesita destino');
    if (action.target === 'province' && !provinceTarget) return fail('INVALID_TARGET', 'La candidatura debe concurrir en la provincia elegida');
    if (action.target === 'national' && target !== null && target !== 'national') return fail('INVALID_TARGET', 'La entrevista tiene alcance nacional');
    if (action.target === 'civil_actor' && !bundle.config.civilActors.some(c => c.id === target)) return fail('INVALID_TARGET', 'Elige un interlocutor civil');
    if (action.target === 'rival_party' && (!bundle.config.parties.some(p => p.id === target) || target === partyId)) return fail('INVALID_TARGET', 'Elige otra candidatura');
    if (action.target === 'province_or_national' && !provinceTarget && target !== 'national') return fail('INVALID_TARGET', 'Elige una provincia o una campaña nacional');
    const c = actionCost(state, bundle, partyId, actor, item.id, target);
    cost.budget += c.budget;
    cost.energy += c.energy;
  }
  if (cost.budget > own.budget) return {...fail('INSUFFICIENT_BUDGET', `La agenda necesita ${cost.budget} de presupuesto; tienes ${own.budget}. La recaudación llega al resolver el turno.`), cost};
  if (cost.energy > own.energy) return {...fail('INSUFFICIENT_ENERGY', `La agenda necesita ${cost.energy} de energía; tienes ${own.energy}`), cost};
  return {ok: true, cost, items};
}
