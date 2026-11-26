import {bundle,command,finishEvent,freePlan} from './helpers.mjs';
import {getEventView} from '../app/js/core/engine.mjs';

// Complete legal campaigns; selectors never rewrite a snapshot or an event.
export function completeForRecap(state,choices={}){
 let s=state;
 while(s.phase!=='election'){
  if(s.phase==='event'){
   const preferred=choices[s.activeEvent],view=getEventView(s,bundle);
   if(preferred){const option=view.options.find(o=>o.id===preferred);if(!option?.availability.available)throw Error('Unavailable recap choice '+s.activeEvent+'/'+preferred);
    s=command(s,'CHOOSE_OPTION',{optionId:preferred,staffId:option.reserveStaff?option.availability.staffChoices[0]:null});
   }else s=finishEvent(s);
  }else if(s.phase==='planning'){
   const plan=freePlan(s);if(s.turn===5){const actor=Object.keys(plan.staff)[0];if(actor)plan.staff[actor]={id:'prepare',target:null};}
   s=command(s,'CONFIRM_PLAN',{plan});
  }else if(s.phase==='debrief')s=command(s,'CONTINUE');else throw Error('Unexpected phase '+s.phase);
 }
 s=command(s,'BEGIN_NEGOTIATION');
 while(s.phase==='negotiation'){
  if(s.negotiation.stage==='offer')s=command(s,'PROPOSE',{offer:[2,2,1,1]});
  s=command(s,'VOTE',{vote:'no'});
 }
 if(s.phase!=='ending')throw Error('No ending');return s;
}
