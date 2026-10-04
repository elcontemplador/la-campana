import {resolveCampaignBundle} from '../core/campaign.mjs';

// One bounded description of preparation, separate from energy/staff costs.
export function debatePreparationText(option, state, sourceBundle) {
  const bounds=resolveCampaignBundle(sourceBundle,state).config.resources.readiness;
  const current=Number(state.parties.P1.readiness||0);
  const needed=Number(option.availability?.requiredReadiness||0);
  const delta=(option.effects||[]).filter(e=>e.type==='stat'&&e.stat==='readiness')
    .reduce((sum,e)=>sum+Number(e.delta||0),0);
  const after=Math.max(bounds.min,Math.min(bounds.max,current+delta));
  if(needed>current)return `Necesita ${needed} ficha${needed===1?'':'s'}; tienes ${current}`;
  if(delta<0)return `Usa ${current-after} ficha${current-after===1?'':'s'} · quedan ${after}`;
  if(delta>0&&after===current)return `Preparación al máximo (${bounds.max}); el ensayo no añade fichas`;
  if(delta>0)return `Preparación +${after-current} · tendrás ${after}${after-current!==delta?' · límite alcanzado':''}`;
  return `Conservas ${current} ficha${current===1?'':'s'}`;
}

export function debateChoiceIntent(option, state, sourceBundle, intent='') {
  const own=state.parties.P1;
  const resources=resolveCampaignBundle(sourceBundle,state).config.resources;
  let text=intent;
  if(option.id==='ada_outline'&&own.readiness>=resources.readiness.max)
    text=text.replace('y añade preparación','sin añadir fichas con preparación al máximo');
  if(option.id==='open_dialogue')
    text=text.replace('y acercas dos interlocutores','para buscar acuerdos con dos interlocutores');
  if(own.reputation>=resources.reputation.max)
    text=text.replace('ganas reputación y alcance','reputación al máximo y más alcance')
      .replace('Ganas reputación y conservas recursos','Tu reputación está al máximo y conservas recursos')
      .replace('alcance y reputación','alcance; la reputación está al máximo');
  if(own.cohesion>=resources.cohesion.max)
    text=text.replace('refuerzas alcance y cohesión','refuerzas alcance; la cohesión ya está al máximo');
  if(option.effects?.some(e=>e.type==='relation'&&e.delta<0&&own.relations[e.target]<=resources.relation.min))
    text=text.replace('enfrías la relación con tu rival','la relación con tu rival ya está en el mínimo')
      .replace('pero enfría la relación','la relación ya está en el mínimo')
      .replace('y enfriar un punto más la relación','sin bajar más la relación, que ya está en el mínimo');
  if(option.effects?.some(e=>e.type==='relation'&&e.target==='P2'&&e.delta>0&&own.relations.P2>=resources.relation.max))
    text=text.replace('Tu apuesta puede acercarte un punto más a este rival.','La relación con este rival ya está en el máximo.');
  return text;
}
