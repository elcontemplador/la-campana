// Presentation only. IDs, costs and effects remain defined by the game rules.
import {resolveCampaignBundle} from '../core/campaign.mjs';
import {validatePlan} from '../core/actions.mjs';
export const BASIC_TEAM_TASKS = Object.freeze(['organize', 'prepare', 'mediate', 'wait']);
const labels = Object.freeze({
  organize: 'Organizar voluntarios', prepare: 'Ensayar intervención', mediate: 'Reunirse para pactar', wait: 'Ahorrar',
  research: 'Afinar sondeo', outreach: 'Contactar asociaciones', advertise: 'Publicidad',
});
const purposes = Object.freeze({
  organize: 'Equipo local que sigue trabajando', prepare: 'Para medios y debate',
  mediate: 'Abrir una conversación', wait: 'Sin gasto ni efecto adicional',
  research: 'Sondeos con menos incertidumbre', outreach: 'Abre posibles noticias', advertise: 'Apoyo inmediato',
});
export const teamTaskLabel = (id, fallback = '') => labels[id] || fallback;
export const teamTaskPurpose = id => purposes[id] || '';
export function teamTaskTiming(id, candidateId = '') {
  if (id === 'organize') return 'Hoy → cada cierre';
  if (id === 'prepare') return ['interview', 'contrast'].includes(candidateId) ? 'Ensayo → tu jugada de hoy' : 'Ensayo → próxima intervención';
  if (id === 'mediate') return 'Reunión → futuros pactos';
  if (id === 'research') return 'Este sondeo → el siguiente';
  if (id === 'outreach') return 'Contacto → posibles noticias';
  if (id === 'advertise') return 'Publicidad → apoyo hoy';
  return 'Este turno → conservar caja';
}

// Read known resources and the legal draft, never hidden vote/support weights.
// Staff act before the candidate. Proposed gains are not committed resources.
export function teamWork(state, originalBundle, {plan=null, provinceId=null, rivalId=null}={}) {
  const {config}=resolveCampaignBundle(originalBundle,state),own=state.parties.P1;
  const legalDraft=state.phase==='planning'&&!!plan&&validatePlan(state,plan,originalBundle).ok;
  const organization={...(own.organization||{})},relations={...(own.relations||{})};
  let readiness=Number(own.readiness||0);
  const effects={};
  const clamp=(value,bounds)=>Math.min(bounds.max,Math.max(bounds.min,value));
  if(legalDraft)for(const [id,task] of Object.entries(plan.staff||{}).sort(([a],[b])=>a.localeCompare(b))) {
    if(!state.selectedStaff.includes(id)||state.reservedStaff.includes(id))continue;
    const action=config.staffActions.find(a=>a.id===task.id),person=config.staff.find(s=>s.id===id);
    if(!action)continue;
    if(task.id==='prepare') {
      const before=readiness;
      const profileBonus=['0.7.0','0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(config.rulesVersion)&&state.candidate.profile==='preparacion'?1:0;
      readiness=clamp(before+Number(action.effect.readiness)+Number(person?.bonus?.extraReadiness||0)+profileBonus,config.resources.readiness);
      effects[id]={kind:'readiness',before,after:readiness,gain:readiness-before};
    } else if(task.id==='organize') {
      const before=Number(organization[task.target]||0);
      const after=clamp(before+Number(action.effect.organization),config.resources.organization);
      organization[task.target]=after;effects[id]={kind:'organization',before,after,gain:after-before};
    } else if(task.id==='mediate') {
      const before=Number(relations[task.target]||0);
      const after=clamp(before+Number(action.effect.relation),config.resources.relation);
      relations[task.target]=after;effects[id]={kind:'relation',before,after,gain:after-before};
    }
  }
  const organizationCurrent=Number(own.organization?.[provinceId]||0);
  const relationCurrent=Number(own.relations?.[rivalId]||0);
  const used=legalDraft&&['interview','contrast'].includes(plan.candidate?.id)&&readiness>0?1:0;
  const remainingCloses=Math.max(0,Number(config.turns)-state.turn+(state.phase==='planning'?1:0));
  return {legalDraft,effects,
    organization:{current:organizationCurrent,proposed:Number(organization[provinceId]||0),max:config.resources.organization.max,remainingCloses},
    preparation:{current:Number(own.readiness||0),proposed:readiness,gain:readiness-Number(own.readiness||0),max:config.resources.readiness.max,used,afterAction:readiness-used},
    dialogue:{current:relationCurrent,proposed:Number(relations[rivalId]||0),gain:Number(relations[rivalId]||0)-relationCurrent,
      gate:config.negotiation.minRelationForAutomaticSupport,bridge:config.negotiation.dialogueBridge.minPlayerRelation,
      min:config.resources.relation.min,max:config.resources.relation.max},
    publishedResearch:state.publishedPolls?.P1?.districts?.[provinceId]?.researched===true,
  };
}
