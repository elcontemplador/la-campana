import {bundle,newGame,command,finishEvent,freePlan} from './helpers.mjs';

const cache=new Map();
// Search real first-turn commands; no flags or event IDs are forced.
export function secondTurnEvent(eventId,setup={}){
 const key=JSON.stringify([eventId,setup]);if(cache.has(key))return structuredClone(cache.get(key));
 for(let n=0;n<80;n++){
  let s=finishEvent(newGame('v080-second-'+n,{difficulty:'iniciacion',...setup}));
  s=command(command(s,'CONFIRM_PLAN',{plan:freePlan(s)}),'CONTINUE');
  if(s.activeEvent===eventId){cache.set(key,s);return structuredClone(s);}
 }
 throw Error('No legal current fixture for '+eventId);
}
