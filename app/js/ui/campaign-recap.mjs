import {resolveCampaignBundle} from '../core/campaign.mjs';
import {politicalRecap} from './political-recap.mjs';

const signed=n=>`${n>0?'+':''}${Number(n).toLocaleString('es-ES')}`;
const change=(entry,stat)=> (entry?.changes||[]).filter(c=>c.stat===stat&&(!c.partyId||c.partyId==='P1')).reduce((n,c)=>n+(Number.isFinite(c.delta)?c.delta:0),0);

// Recorded decisions, not an attribution of the electoral result to one action.
export function campaignRecap(state,sourceBundle){
 if(state?.phase!=='ending')return [];
 const bundle=resolveCampaignBundle(sourceBundle,state),district=id=>bundle.provinces.districts.find(d=>d.id===id)?.name;
 const person=id=>bundle.config.staff.find(s=>s.id===id)?.name?.split(' ')[0]||id;
 const party=id=>bundle.config.parties.find(p=>p.id===id)?.name||id;
 const groups=new Map();
 for(const entry of state.timeline||[]){
  if(!['event','plan'].includes(entry.kind)||entry.partyId&&entry.partyId!=='P1'||!Number.isInteger(entry.turn)||entry.turn<1||entry.turn>bundle.config.turns||typeof entry.id!=='string')continue;
  if(!groups.has(entry.turn))groups.set(entry.turn,[]);groups.get(entry.turn).push(entry);
 }
 const choices=[];
 for(const[turn,entries]of groups){
  const candidate=entries.find(e=>e.kind==='plan'&&e.actorId==='candidate'),events=entries.filter(e=>e.kind==='event');
  const payment=entries.find(e=>e.kind==='plan'&&!e.actionId),reserved=events.find(e=>e.reservedStaff),debate=events.filter(e=>e.eventId==='E07');
  const local=events.find(e=>e.changes?.some(c=>c.stat==='organization'&&c.delta>0&&district(c.target)));
  const mediators=entries.filter(e=>e.kind==='plan'&&e.actionId==='mediate'&&change(e,'relation')!==0);
  const org=entries.find(e=>e.kind==='plan'&&e.actionId==='organize'&&change(e,'organization')>0&&district(e.target));
  let title,kind,score,icon,summary=[],references=[];
  const ref=entry=>{if(entry&&!references.some(r=>r.entryId===entry.id))references.push({entryId:entry.id,label:entry.kind==='event'?'Ver respuesta':entry.actorId&&entry.actorId!=='candidate'?`Ver tarea de ${person(entry.actorId)}`:'Ver jugada'});};
  if(candidate?.actionId==='fundraise'&&change(candidate,'budget')>0){
   kind='economy';score=reserved?100:50;icon='fundraise';
   title=reserved?'Delegar para sostener la campaña':'Cambiaste una jugada por caja';
   if(reserved){summary.push(`${person(reserved.reservedStaff)} atendió la noticia; su tarea quedó ocupada.`);ref(reserved);}
   summary.push(`Recaudaste ${change(candidate,'budget')} de caja${payment?`; la agenda costó ${Math.abs(change(payment,'energy'))} de energía`:''}.`);
   if(payment){const net=entries.reduce((n,e)=>n+change(e,'budget'),0);summary.push(`Caja de noticias y agenda: ${signed(net)}.`);}ref(candidate);
  }else if(debate.length){
   kind='politics';score=80;icon='interview';title=candidate?.actionId==='rest'?'Debatir y parar':'Lo que elegiste ante las cámaras';
   const relations=new Map();for(const entry of debate)for(const c of entry.changes||[])if(c.stat==='relation'&&Number.isFinite(c.delta)&&c.delta)relations.set(c.target,(relations.get(c.target)||0)+c.delta);
   const moves=[...relations].filter(([,delta])=>delta).map(([id,delta])=>`${party(id)} ${signed(delta)}`);
   if(candidate?.actionId==='rest'&&([...relations.values()].some(delta=>delta>0)||mediators.some(entry=>change(entry,'relation')>0)))title='Debatir, tender puentes y parar';
   if(moves.length)summary.push(`El debate cambió relaciones: ${moves.join('; ')}.`);
   else{const cost=debate.reduce((n,e)=>n+Math.max(0,-change(e,'energy')),0);summary.push(`${debate.length===1?'La intervención gastó':`Las ${debate.length===3?'tres':debate.length} intervenciones gastaron`} ${cost} de energía.`);}
   ref(debate.at(-1));
   if(candidate?.actionId==='rest'){summary.push(`Después descansaste (${signed(change(candidate,'energy'))} energía).`);ref(candidate);}
   const mediator=mediators[0];if(mediator){summary.push(`${person(mediator.actorId)} se reunió con ${party(mediator.target)}: relación ${signed(change(mediator,'relation'))}.`);ref(mediator);}
  }else if(candidate?.actionId==='visit'&&district(candidate.target)){
   kind='territory';score=turn===bundle.config.turns&&local?90:turn===bundle.config.turns?55:20;icon='visit';
   title=local&&local.changes.some(c=>c.stat==='organization'&&c.delta>0&&c.target!==candidate.target)?turn===bundle.config.turns?'Repartiste el último esfuerzo':'Repartiste el esfuerzo del turno':'Tu apuesta en el territorio';
   if(local){const c=local.changes.find(c=>c.stat==='organization'&&c.delta>0&&district(c.target));summary.push(`Tu respuesta dejó organización ${signed(c.delta)} en ${district(c.target)}.`);ref(local);}
   const advertiser=entries.find(e=>e.kind==='plan'&&e.actionId==='advertise'&&e.target===candidate.target);
   summary.push(advertiser?`Visitaste ${district(candidate.target)} y ${person(advertiser.actorId)} hizo publicidad allí.`:`Visitaste ${district(candidate.target)}.`);ref(candidate);if(advertiser)ref(advertiser);
   if(payment)summary.push(`La agenda costó ${Math.abs(change(payment,'budget'))} de caja y ${Math.abs(change(payment,'energy'))} de energía.`);
  }else if(mediators.length){
   const mediator=mediators[0];kind='politics';score=45;icon='mediate';title='Preparaste una relación para los pactos';
   summary.push(`${person(mediator.actorId)} se reunió con ${party(mediator.target)}: relación ${signed(change(mediator,'relation'))}.`);ref(mediator);
  }else if(org){
   kind='territory';score=40;icon='organize';title='Dejaste organización en el mapa';
   summary.push(`${person(org.actorId)} organizó voluntarios en ${district(org.target)}: ${signed(change(org,'organization'))} nivel.`);ref(org);
  }
  if(title)choices.push({turn,title,kind,icon,score,summary:summary.join(' '),references});
 }
 const stories=politicalRecap(state,sourceBundle);
 if(stories.length){
  const selected=[],turns=new Set(),keys=new Set();
  const ranked=[...stories,...choices].sort((a,b)=>b.score-a.score||a.turn-b.turn);
  for(const item of ranked){const key=item.storyId||item.kind;
   const covered=item.coveredTurns||[item.turn];
   if(covered.some(turn=>turns.has(turn))||keys.has(key))continue;
   selected.push(item);for(const turn of covered)turns.add(turn);keys.add(key);if(selected.length===3)break;
  }
  const featured=selected.find(item=>item.storyId);
  return selected.sort((a,b)=>a.turn-b.turn).map(original=>{const {score,...item}=original;return {...item,...(original===featured?{featured:true}:{})};});
 }
 const selected=[],kinds=new Set();
 for(const item of choices.sort((a,b)=>b.score-a.score||a.turn-b.turn))if(!kinds.has(item.kind)){selected.push(item);kinds.add(item.kind);if(selected.length===3)break;}
 return selected.sort((a,b)=>a.turn-b.turn).map(({score,...item})=>item);
}
