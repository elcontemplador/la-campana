import {createGame, dispatch, validatePlan, actionCost} from '../core/engine.mjs';
import {selectBundle} from '../core/bundles.mjs';
import {resolveCampaignBundle} from '../core/campaign.mjs';

// Bound the work done by a presentation helper, including malformed imports.
const MAX_COMMANDS = 250;
const campaignCommands = new Set(['CHOOSE_OPTION', 'CONFIRM_PLAN', 'CONTINUE']);
const allCommands = new Set([...campaignCommands, 'BEGIN_NEGOTIATION', 'PROPOSE', 'COUNTEROFFER', 'VOTE']);
const taskNames = {wait: 'Ahorrar', research: 'Investigar'};
const sameEntry = (a, b) => a && b && JSON.stringify(a) === JSON.stringify(b);

// Reconstruct only the recorded campaign. Alternative plans are validated, never
// dispatched: this does not calculate hypothetical polls, elections or victories.
export function replayRoute(state, sourceBundle, provinceId) {
  try {
    if (state?.phase !== 'ending' || !state.electionResult || !state.initialSetup
      || !Array.isArray(state.timeline) || !Array.isArray(state.commandLog)
      || !state.commandLog.length || typeof state.seed !== 'string') return null;
    const bundle = resolveCampaignBundle(sourceBundle, state);
    const district = bundle.provinces.districts.find(d => d.id === provinceId);
    if (!district || state.commandLog.length > Math.min(MAX_COMMANDS, bundle.config.runtime.maxCommands)
      || state.timeline.length > MAX_COMMANDS * 16) return null;
    const ids = new Set();
    for (const [index, command] of state.commandLog.entries()) {
      if (!allCommands.has(command?.type) || command.expectedRevision !== index
        || typeof command.id !== 'string' || !command.id.length || command.id.length > 128
        || ids.has(command.id)) return null;
      ids.add(command.id);
    }
    if (!state.timeline.some(e => e.kind === 'plan' && e.actorId === 'candidate'
      && e.actionId === 'visit' && e.target === provinceId && e.turn >= 1 && e.turn <= bundle.config.turns
      && (!e.partyId || e.partyId === 'P1'))) return null;
    const originalEntries = new Map(state.timeline.map(e => [e.id, e]));
    if (originalEntries.size !== state.timeline.length) return null;
    let replay = createGame(selectBundle(sourceBundle,state), state.seed, state.initialSetup);
    if (replay.bundleChecksum !== state.bundleChecksum || replay.rulesVersion !== state.rulesVersion
      || replay.contentVersion !== state.contentVersion) return null;
    const half = Math.floor(bundle.config.turns / 2), candidates = [];
    let earlyOrganization = false;
    for (const command of state.commandLog) {
      if (replay.phase === 'election') break;
      if (!campaignCommands.has(command?.type)) return null;
      if (replay.turn <= half && replay.parties.P1.organization[provinceId] > 0) earlyOrganization = true;
      const prospective = [];
      if (command.type === 'CONFIRM_PLAN' && replay.turn < bundle.config.turns
        && replay.parties.P1.organization[provinceId] < bundle.config.resources.organization.max) {
        for (const [staffId, task] of Object.entries(command.plan?.staff || {})) {
          if (!['wait', 'research'].includes(task?.id)) continue;
          // Staff tasks execute in ID order. An earlier task in the same plan
          // could consume the last organization level before this replacement.
          const earlierOrganization = Object.entries(command.plan.staff).filter(([id, item]) =>
            id < staffId && item?.id === 'organize' && item.target === provinceId).length;
          if (replay.parties.P1.organization[provinceId] + earlierOrganization
            >= bundle.config.resources.organization.max) continue;
          const plan = structuredClone(command.plan);
          plan.staff[staffId] = {id: 'organize', target: provinceId};
          const validation = validatePlan(replay, plan, bundle);
          if (!validation.ok) continue;
          const staff = bundle.config.staff.find(s => s.id === staffId);
          if (!staff) continue;
          prospective.push({turn: replay.turn, staff: {id: staff.id, name: staff.name},
            previousTask: structuredClone(task), newTask: {id: 'organize', target: provinceId},
            cost: actionCost(replay, bundle, 'P1', staffId, 'organize', provinceId),
            planCost: {...validation.cost}});
        }
      }
      const result = dispatch(replay, command, sourceBundle);
      if (!result.ok) return null;
      replay = result.state;
      if (replay.turn <= half && replay.parties.P1.organization[provinceId] > 0) earlyOrganization = true;
      for (const item of prospective) {
        const entry = replay.timeline.findLast(e => e.turn === item.turn && e.kind === 'plan'
          && e.actorId === item.staff.id && e.actionId === item.previousTask.id
          && (e.target ?? null) === (item.previousTask.target ?? null));
        if (!sameEntry(entry, originalEntries.get(entry?.id))) return null;
        candidates.push({...item, entryId: entry.id});
      }
    }
    if (replay.phase !== 'election' || earlyOrganization) return null;
    // The recommendation must describe this route, rather than a plausible but
    // unrelated command log supplied alongside its ending.
    if (replay.timeline.some(e => !sameEntry(e, originalEntries.get(e.id)))) return null;
    const rank = turn => turn >= 4 && turn <= 7 ? 7 - turn : 20 + Math.abs(7 - turn);
    candidates.sort((a, b) => rank(a.turn) - rank(b.turn) || a.staff.id.localeCompare(b.staff.id));
    const chosen = candidates[0];
    if (!chosen) return null;
    const oldTarget = bundle.provinces.districts.find(d => d.id === chosen.previousTask.target)?.name;
    const previous = taskNames[chosen.previousTask.id] + (oldTarget ? ` en ${oldTarget}` : '');
    const firstName = chosen.staff.name.split(' ')[0];
    return {...chosen, target: provinceId, targetName: district.name,
      title: `Otra ruta: voluntarios en ${district.name}`,
      text: `Ya visitaste ${district.name}. Al repetir con la misma clave, prueba Voluntarios allí con ${firstName} en el turno ${chosen.turn}, en lugar de ${previous}. La tarea cuesta ${chosen.cost.budget} de caja; conserva tu jugada y las demás tareas de ese turno. Compara el resultado: no garantiza un escaño.`};
  } catch {
    // Missing or incompatible replay data should not prevent the balance opening.
    return null;
  }
}
