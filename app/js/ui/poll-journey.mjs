import {createGame} from '../core/engine.mjs';
import {campaignObjective,resolveCampaignBundle} from '../core/campaign.mjs';

const starts=new Map();
const band=p=>p&&[p.min,p.median,p.max].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=350)
 &&p.min<=p.median&&p.median<=p.max?{min:p.min,median:p.median,max:p.max}:null;
const range=p=>p.min===p.max?String(p.min):`${p.min}–${p.max}`;

export function publicCampaignObjective(state,sourceBundle){
 const awaitingCount=['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion)&&['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)
  &&state.phase==='debrief'&&state.turn===sourceBundle.config.turns;
 if(!awaitingCount)return campaignObjective(state,sourceBundle);
 // Shadow the frozen count without reading it or modifying the saved state.
 const publicState=Object.create(state);
 Object.defineProperty(publicState,'electionResult',{value:null});
 return campaignObjective(publicState,sourceBundle);
}

// Reproduce only the actual starting publication. This is not a passive-policy
// counterfactual or an attribution of the current result to the player's moves.
export function pollJourney(state,sourceBundle){
 if(!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion)||!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)
  ||!['event','planning','debrief','ending'].includes(state.phase))return null;
 const publication=state.publishedPolls?.P1,current=band(publication?.projection?.P1);
 if(!current||!Number.isSafeInteger(publication.turn)||publication.turn<0||publication.turn>state.turn)return null;
 let initial;
 try{
  const bundle=resolveCampaignBundle(sourceBundle,state);
  const key=JSON.stringify([state.bundleChecksum,state.seed,state.initialSetup]);
  if(!starts.has(key)){
   const start=createGame(bundle,state.seed,state.initialSetup);
   const first=band(start.publishedPolls.P1.projection.P1);if(!first)return null;
   if(starts.size>=64)starts.delete(starts.keys().next().value);
   starts.set(key,first);
  }
  initial={...starts.get(key)};
 }catch{return null;}
 let count=null;
 if(state.phase==='ending'){
  const value=state.electionResult?.national?.seatsByParty?.P1;
  if(Number.isSafeInteger(value)&&value>=0&&value<=350)count=value;
 }
 const moved=publication.turn>0;
 const finalLabel=`Sondeos: inicio ${range(initial)} · último ${range(current)}`+(count===null?'':` · recuento ${count}`);
 return {initial,current:{...current},publicationTurn:publication.turn,count,
  deltaMedian:current.median-initial.median,
  label:state.phase==='ending'?finalLabel:
   moved?`Sondeos: inicio ${range(initial)} → ahora ${range(current)} escaños`:`Sondeo inicial: ${range(initial)} escaños`,
  note:'El sondeo inicial muestra tu apoyo de partida, no cómo acabarán diez turnos. Los siguientes reúnen las jugadas de todos los partidos y su margen de error.'};
}
