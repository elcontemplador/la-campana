import {createGame, dispatch} from '../core/engine.mjs';
import {selectBundle} from '../core/bundles.mjs';
import {canonical} from '../core/utils.mjs';

// Recover the actual opening offer with its original cash, relationships,
// initiative and rules. Never borrow the resources left over at the ending.
export function firstPactTable(finished, sourceBundle) {
  if (finished?.phase !== 'ending') throw new Error('Termina la campaña para volver a la primera propuesta.');
  const opening = finished.commandLog.findIndex(command => command.type === 'BEGIN_NEGOTIATION');
  if (opening < 0) throw new Error('Esta partida no contiene el comienzo de la investidura.');
  const rules = selectBundle(sourceBundle, finished);
  let state = createGame(rules, finished.seed, finished.initialSetup);
  for (const command of finished.commandLog.slice(0, opening + 1)) {
    const result = dispatch(state, command, rules);
    if (!result.ok) throw new Error('No se ha podido reconstruir la primera propuesta de esta partida.');
    state = result.state;
  }
  if (state.phase !== 'negotiation' || canonical(state.electionResult) !== canonical(finished.electionResult)) {
    throw new Error('El recuento reconstruido no coincide con el de tu campaña.');
  }
  return state;
}
