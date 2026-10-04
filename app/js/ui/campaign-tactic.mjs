import {actionPreview} from './preview.mjs';
import {validatePlan} from '../core/engine.mjs';

// Point to an unused, prepared alternative. Never replace the player's draft or
// use a future result to decide which basic action to advertise.
export function campaignTactic(state,bundle,{plan,mediaPlan}={}){
 if(!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion)||!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)||state.phase!=='planning'
  ||plan?.candidate?.id!=='visit'||mediaPlan?.candidate?.id!=='interview')return null;
 const own=state.parties.P1;
 if(!Number.isSafeInteger(own.readiness)||own.readiness<1)return null;
 const validation=validatePlan(state,mediaPlan,bundle);if(!validation.ok)return null;
 const visit=actionPreview(state,bundle,plan.candidate,{plan}),media=actionPreview(state,bundle,mediaPlan.candidate,{plan:mediaPlan});
 if(!visit?.yield||!media?.yield||!media.yield.readinessConsumed)return null;
 const visits=Object.entries(own.repeatCounts||{}).filter(([key])=>key.startsWith('visit:')).reduce((sum,[,n])=>sum+Number(n||0),0);
 const unused=visits>=2&&Number(own.repeatCounts?.interview||0)===0;
 const fresher=visit.yield.repeatPercent<media.yield.repeatPercent;
 if(!unused&&!fresher)return null;
 return {actionId:'interview',reason:unused?'unused-preparation':'repeated-visit',
  title:'Una respuesta lista para Medios',
  message:unused?'Ya has hecho varias visitas. Tu entrevista está preparada.'
   :'Ya has venido aquí. Medios permite aprovechar tu respuesta preparada.',
  consequence:'Llega a todo tu ámbito y usa 1 ficha. Tú eliges; Jugar confirma.',
  cost:{...validation.cost}};
}
