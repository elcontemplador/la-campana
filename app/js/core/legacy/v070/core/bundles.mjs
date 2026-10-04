import {legacyBundle} from '../../v061/bundle.mjs';
import {bundleV070} from '../bundle.mjs';
import {checksum} from './utils.mjs';
export {legacyBundle,bundleV070};
const base = bundle => bundle.campaignBase ?? bundle;
const identities=new WeakMap();
const identity = bundle => {
  if(!identities.has(bundle))identities.set(bundle,{rulesVersion:bundle.config.rulesVersion,contentVersion:bundle.content.version,scenarioId:bundle.config.scenarioId,bundleChecksum:checksum({config:bundle.config,provinces:bundle.provinces,content:bundle.content})});
  return identities.get(bundle);
};
// Only exact local catalogued data can select a rules engine. No imported code/data.
export function selectBundle(bundle, record) {
  const current=base(bundle);
  if(!record?.rulesVersion)return current;
  const catalogues=current.config.rulesVersion==='0.7.0'&&current.content.version==='0.7.1'
    ? [current,bundleV070,legacyBundle] : [current,legacyBundle];
  for(const candidate of catalogues){
    const known=identity(candidate);
    if(Object.keys(known).every(key=>record[key]===known[key]))return candidate;
  }
  throw new Error('La partida pertenece a una versión desconocida del escenario');
}
export const storagePrefix = record => record.rulesVersion==='0.6.1'&&record.contentVersion==='0.6.0'?'la-campana-v061'
  :record.rulesVersion==='0.7.0'&&record.contentVersion==='0.7.0'?'la-campana-v07'
  :record.rulesVersion==='0.7.0'&&record.contentVersion==='0.7.1'?'la-campana-v071':null;
