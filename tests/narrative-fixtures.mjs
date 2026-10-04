import {newGame,command,freePlan} from './helpers.mjs';
import {getEventView} from '../app/js/core/engine.mjs';
import {bundle} from './helpers.mjs';
import {POLITICAL_SCENE_IDS} from '../app/js/ui/political-scenes.mjs';
let cache;
export function narrativeFixtures(){
 if(cache)return cache;
 const wanted=new Set(POLITICAL_SCENE_IDS),found=new Map();
 for(let n=0;n<35&&found.size<wanted.size;n++)for(let mode=0;mode<3&&found.size<wanted.size;mode++){
  let s=newGame('political-'+n,{difficulty:'iniciacion',staff:['S1','S4']});
  while(s.phase!=='election'){
   if(s.phase==='event'){
    if(wanted.has(s.activeEvent)&&!found.has(s.activeEvent))found.set(s.activeEvent,structuredClone(s));
    const view=getEventView(s,bundle),available=view.options.filter(o=>o.availability.available);
    const free=available.find(o=>!o.reserveStaff&&!o.availability.cost.budget&&!o.availability.cost.energy);
    const pick=mode===0?free:mode===1?available[0]:available.find(o=>o.reserveStaff)||free;
    s=command(s,'CHOOSE_OPTION',{optionId:pick.id,staffId:pick.reserveStaff?pick.availability.staffChoices[0]:null});
   }else if(s.phase==='planning')s=command(s,'CONFIRM_PLAN',{plan:freePlan(s)});
   else if(s.phase==='debrief')s=command(s,'CONTINUE');
  }
 }
 if(found.size!==wanted.size)throw Error('Missing legal narrative fixtures: '+[...wanted].filter(id=>!found.has(id)).join(','));
 cache=found;return found;
}
