import {createGame, dispatch} from '../core/engine.mjs';
import {bundleChecksum} from '../core/scenario.mjs';
import {assertSafeTree, canonical, checksum, clone, fail} from '../core/utils.mjs';
import {selectBundle,storagePrefix,legacyBundle} from '../core/bundles.mjs';

const FORMAT = 'la-campana-save';
const ACTIVE = 'la-campana-active-version';

export function snapshotOf(state) {
  const snapshot = clone(state);
  delete snapshot.commandLog;
  return snapshot;
}

export function exportGame(state, bundle) {
  bundle=selectBundle(bundle,state);
  if (state.bundleChecksum !== bundleChecksum(bundle)) throw new Error('El escenario ha cambiado');
  const snapshot = snapshotOf(state);
  const envelope = {format: FORMAT, formatVersion: '1', rulesVersion: state.rulesVersion,
    contentVersion: state.contentVersion, scenarioId: state.scenarioId, bundleChecksum: state.bundleChecksum,
    seed: state.seed, setup: clone(state.initialSetup), commands: clone(state.commandLog), snapshot,
    checksum: checksum(snapshot)};
  return JSON.stringify(envelope);
}

export function replay(envelope, bundle) {
  bundle=selectBundle(bundle,envelope);
  let state = createGame(bundle, envelope.seed, envelope.setup);
  for (const command of envelope.commands) {
    const result = dispatch(state, command, bundle);
    if (!result.ok) return fail('INVALID_REPLAY', 'El registro no reconstruye una partida válida: ' + result.error.message);
    state = result.state;
  }
  if (checksum(snapshotOf(state)) !== envelope.checksum || canonical(snapshotOf(state)) !== canonical(envelope.snapshot)) {
    return fail('SNAPSHOT_MISMATCH', 'El estado guardado no coincide con sus decisiones. Se conserva tu partida anterior.');
  }
  return {ok: true, state};
}

export function importGame(text, bundle) {
  try {
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > bundle.config.runtime.maxImportBytes) return fail('SAVE_TOO_LARGE', 'El archivo supera el tamaño permitido para una partida');
    const envelope = JSON.parse(text);
    assertSafeTree(envelope);
    if (!envelope || envelope.format !== FORMAT || envelope.formatVersion !== '1') return fail('INVALID_SAVE_FORMAT', 'Este archivo no es una partida de La campaña');
    try {bundle=selectBundle(bundle,envelope);} catch {return fail('INCOMPATIBLE_SAVE','La partida pertenece a una versión desconocida. Conserva el archivo original.');}
    if (envelope.rulesVersion !== bundle.config.rulesVersion || envelope.contentVersion !== bundle.content.version
      || envelope.scenarioId !== bundle.config.scenarioId || envelope.bundleChecksum !== bundleChecksum(bundle)) return fail('INCOMPATIBLE_SAVE', 'La partida pertenece a otra versión del escenario. Conserva el archivo original.');
    if (!Array.isArray(envelope.commands) || envelope.commands.length > bundle.config.runtime.maxCommands) return fail('COMMAND_LIMIT', 'El registro contiene demasiadas decisiones');
    if (!envelope.snapshot || typeof envelope.checksum !== 'string') return fail('INVALID_SNAPSHOT', 'El archivo no contiene un estado verificable');
    return replay(envelope, bundle);
  } catch (error) {
    return fail('INVALID_SAVE', 'No se pudo abrir la partida: ' + error.message);
  }
}

export function saveGame(state, bundle, storage = globalThis.localStorage) {
  try {
    const PREFIX=storagePrefix(state);if(!PREFIX)throw new Error('Versión no compatible');
    const previous = storage.getItem(PREFIX + '-latest');
    const target = previous === '0' ? '1' : '0';
    const text = exportGame(state, bundle);
    storage.setItem(PREFIX + '-slot-' + target, text);
    storage.setItem(PREFIX + '-latest', target);
    storage.setItem(ACTIVE,PREFIX);
    return {ok: true};
  } catch {
    return fail('STORAGE_UNAVAILABLE', 'No se pudo autoguardar; puedes descargar el archivo de partida');
  }
}

export function loadGame(bundle, storage = globalThis.localStorage) {
  try {
    const source=bundle.campaignBase??bundle;
    const active=storage.getItem(ACTIVE),current=storagePrefix({rulesVersion:source.config.rulesVersion,contentVersion:source.content.version});
    const prefixes=[...new Set([active,current,'la-campana-v084','la-campana-v083','la-campana-v082','la-campana-v081','la-campana-v08','la-campana-v071','la-campana-v07','la-campana-v061'].filter(prefix=>['la-campana-v085','la-campana-v084','la-campana-v083','la-campana-v082','la-campana-v081','la-campana-v08','la-campana-v071','la-campana-v07','la-campana-v061'].includes(prefix)))];
    let sawFile = false;
    for(const PREFIX of prefixes){
    const pointer = storage.getItem(PREFIX + '-latest');
    const order = pointer === '1' ? ['1', '0'] : ['0', '1'];
    for (const slot of order) {
      const text = storage.getItem(PREFIX + '-slot-' + slot);
      if (!text) continue;
      sawFile = true;
      const result = importGame(text, bundle);
      if (result.ok&&storagePrefix(result.state)===PREFIX) return {...result, recovered: slot !== pointer || !!active&&PREFIX!==active,sourceVersion:result.state.rulesVersion};
    }
    }
    return fail(sawFile ? 'NO_VALID_SAVE' : 'NO_SAVE', sawFile ? 'Ninguno de los guardados es compatible; puedes importar un archivo' : 'Todavía no hay una campaña guardada');
  } catch {
    return fail('STORAGE_UNAVAILABLE', 'El navegador no permite acceder al guardado local');
  }
}
