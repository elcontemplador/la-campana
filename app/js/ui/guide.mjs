// Presentation only: guide preferences never change the campaign or its rules.
import {actionCost} from '../core/actions.mjs';
import {resolveCampaignBundle} from '../core/campaign.mjs';
import {teamTaskLabel} from './team.mjs';

export const GUIDE_LEVEL_KEY='la-campana-guide-level';
export function loadGuideLevel(storage){try{return (storage??globalThis.localStorage)?.getItem(GUIDE_LEVEL_KEY)==='advanced'?'advanced':'basic';}catch{return 'basic';}}
export function saveGuideLevel(level,storage){if(!['basic','advanced'].includes(level))return false;try{const destination=storage??globalThis.localStorage;if(!destination?.setItem)return false;destination.setItem(GUIDE_LEVEL_KEY,level);return true;}catch{return false;}}

export function guidedLesson(view,state,level='basic'){
 if(!view||!state)return view;
 const result={...view,level:level==='advanced'?'advanced':'basic',more:[]};
 if(view.chapter==='initial-complete'){result.body='Ya has jugado un turno. Sigue con tu campaña; la guía volverá cuando lleguen los pactos.';return result;}
 if(state.phase==='event'){
  result.body=state.activeEvent==='E07'
   ?'Elige qué contestas. Cada respuesta aplica su coste y efecto al pulsarla. Hay tres intervenciones; después eliges tu jugada del turno.'
   :'Lee qué ocurre y qué gana o pierde cada respuesta. Pulsar Responder aplica esa decisión al momento. Después elegirás tu jugada en el mapa.';
  result.more=['La preparación disponible puede mejorar algunas respuestas. Mira los efectos de cada tarjeta antes de elegir.','Si encargas la respuesta a alguien del equipo, esa persona puede quedar ocupada este turno.'];
 }else if(view.id==='recount'){
  result.body='Mira cómo se reparten los escaños. Puedes avanzar por provincias o ver el Congreso completo; saltar la animación no cambia el resultado.';
 }else if(view.id==='province'){
  result.body='Si quieres concentrarte en un escaño, elige una provincia. Ganar y Defender señalan oportunidades del sondeo. Puedes cambiar de destino antes de Jugar.';
  result.more=['El margen del último escaño es una estimación: una visita no promete ese número de votos.','La organización local sigue trabajando en los próximos cierres. Visitar concentra tu esfuerzo en una provincia.'];
 }else if(view.id==='action'){
  result.body='Elige una: Visitar gana apoyo local; Medios llega a más provincias; Recaudar repone caja; Descansar recupera energía. Revisa el coste total y pulsa Jugar.';
  result.more=['El candidato hace una sola jugada. El equipo propone hasta dos tareas: puedes aceptarlas, cambiarlas o elegir Ahorrar.','El equipo actúa antes: ensayar puede ayudar a Medios hoy. Debes poder pagar el plan con la caja que ya tienes, antes de recaudar.'];
 }else if(view.id==='consequence'&&state.phase==='debrief'){
  result.body='Comprueba lo que ganaste y gastaste. Mira también qué hizo el equipo. Una buena jugada puede sumar apoyo aunque el sondeo no dé un escaño más todavía.';
  result.more=['El sondeo también recoge las jugadas rivales. El cambio total no se debe solo a tu acción.','Las fichas, la presencia local y las relaciones sirven para decisiones posteriores; no son escaños directos.'];
 }else if(view.id==='rival'&&state.phase==='debrief'){
  result.body='Tus rivales también han jugado. Mira dónde avanzaron y decide si quieres responderles en el siguiente turno o seguir con tu plan.';
  result.more=['Puedes competir por una provincia y, a la vez, necesitar a ese partido para formar Gobierno.','Cuando aparece una réplica en Medios, comparar propuestas puede enfriar la relación y salir mal.'];
 }else if(view.id==='pact'){
  result.body=state.phase==='ending'?'Este es tu resultado. Revisa qué pasó y qué cambiarías. Repetir conserva la candidatura y la clave; tú puedes tomar otras decisiones.':'Ahora importan los apoyos: necesitas 176 síes en la primera votación, o más síes que noes en la segunda. Mira la previsión antes de proponer y votar.';
  result.more=['Una buena relación ayuda, pero el programa ofrecido y las prioridades de cada partido también cuentan.','Compara qué consigues y qué cedes. Tus prioridades iniciales aparecen junto al acuerdo.'];
 }
 if(result.level==='basic')result.more=[];
 return result;
}

export function guideReference(state,sourceBundle){
 const bundle=resolveCampaignBundle(sourceBundle,state||{}),c=bundle.config;
 const current=state?.parties?.P1;
 const definition=id=>c.candidateActions.find(a=>a.id===id);
 const labels={visit:'Visitar',interview:'Medios',fundraise:'Recaudar',rest:'Descansar'};
 const benefits={visit:'Ganas apoyo en la provincia elegida.',interview:'Ganas apoyo en las provincias donde te presentas.',fundraise:`Recibes hasta ${definition('fundraise').effect.budget} de caja; después de ${definition('fundraise').effect.abuseAfter} recaudaciones, hasta ${definition('fundraise').effect.lateBudget}.`,rest:`Recuperas hasta ${definition('rest').effect.energy} de energía por descansar.`};
 const when={visit:'Para disputar un escaño concreto o defender una provincia.',interview:'Para llegar a más provincias. Aprovecha una ficha de preparación si la tienes.',fundraise:'Cuando necesitas financiar próximos turnos. Desde la tercera vez también pierdes reputación.',rest:'Cuando te falta energía para otra salida. El equipo puede seguir trabajando y gastando caja.'};
 const actions=['visit','interview','fundraise','rest'].map(id=>{
  const a=definition(id),cost=state?actionCost(state,bundle,'P1','candidate',id,id==='interview'?'national':null):a.cost;
  return {id,label:labels[id],benefit:benefits[id],when:when[id],cost};
 });
 const notes={
  organize:['Añade presencia local que aporta apoyo desde este cierre y en los siguientes.','Es más útil si quedan turnos y la provincia aún tiene margen de mejora.'],
  prepare:['Ganas fichas para mejorar Medios y determinadas respuestas de noticias o debate.','El equipo ensaya antes de tu jugada. Para una noticia o debate ya contestado, llega tarde.'],
  mediate:['Mejoras la relación con el rival elegido.','Prepara un posible pacto; la relación por sí sola no garantiza su voto.'],
  wait:['Conservas caja; esa persona no hace otra tarea.','Elige Ahorrar cuando prefieras reservar dinero. No genera ingresos.'],
  advertise:['Ganas apoyo ahora en una provincia o en tu ámbito nacional.','Cuesta caja, sin cansar al candidato. La opción nacional cuesta más.'],
  research:['Ves un sondeo provincial más preciso durante el plazo indicado.','Reduce la incertidumbre de la información; no suma apoyo.'],
  outreach:['Mejoras la relación con una asociación de la campaña.','Puede abrir o cambiar escenas. No entrega votos automáticamente.'],
 };
 const tasks=['organize','prepare','mediate','wait','advertise','research','outreach'].map(id=>{
  const a=c.staffActions.find(x=>x.id===id);
  const costs=state?state.selectedStaff.map(actor=>{const person=c.staff.find(p=>p.id===actor);return {name:person?.name||actor,...actionCost(state,bundle,'P1',actor,id),...(id==='prepare'?{readiness:a.effect.readiness+Number(person?.bonus?.extraReadiness||0)+(c.rulesVersion!=='0.6.1'&&state.candidate.profile==='preparacion'?1:0)}:{})};}):[{name:'Base',...a.cost,...(id==='prepare'?{readiness:a.effect.readiness}:{})}];
  const detail=id==='organize'?`+${a.effect.organization} equipo local; máximo ${c.resources.organization.max} por provincia.`
   :id==='prepare'?`Hasta ${c.resources.readiness.max} fichas guardadas. Cada persona aporta lo indicado abajo; el perfil y su especialidad ya están incluidos si hay una partida abierta.`
   :id==='mediate'?`+${a.effect.relation} relación, hasta ${c.resources.relation.max}. Llegar a ${c.negotiation.minRelationForAutomaticSupport} permite considerar el programa; no asegura su voto.`
   :id==='research'?`Mejora ${a.effect.pollPrecisionTurns} sondeos: el de este cierre y el siguiente.`
   :id==='outreach'?`+${a.effect.rapport} relación civil de base; el especialista y el perfil pueden añadir un bono.`:'';
  return {id,label:teamTaskLabel(id),benefit:notes[id][0],detail,when:notes[id][1],costs,nationalCost:a.nationalCost};
 });
 const modern=['0.8.4','0.8.5'].includes(c.rulesVersion);
 const resources=[
  {id:'budget',label:'Caja',body:'Paga tus acciones y las tareas del equipo. Revisa el coste conjunto junto a Jugar. Recaudar financia los turnos siguientes: no permite pagar un plan que ahora no puedes costear.'},
  {id:'energy',label:'Energía',body:`La gasta el candidato al salir. El equipo no la gasta. Si empiezas la jugada con muy poca energía, Visitar y Medios rinden menos. Al cerrar el turno recuperas hasta ${c.resources.energy.recovery}; Descansar añade su recuperación. El tope es ${c.resources.energy.max}.`},
  {id:'readiness',label:'Preparación',body:`Fichas para reforzar intervenciones. Medios usa como máximo una por jugada; algunas noticias y respuestas del debate también las piden. Puedes guardar hasta ${c.resources.readiness.max}. Ensaya antes de necesitarlas.`},
  {id:'cohesion',label:'Cohesión',body:modern?'Mide cómo de coordinado está el equipo. Por encima de 60, Visitar y Medios ganan fuerza; por debajo pierden. En 60 su efecto es neutro. El cambio es gradual y llega hasta un 20 % más o menos.':'Mide la coordinación del equipo. En esta edición, una cohesión muy baja reduce el efecto de Visitar y Medios.'},
  {id:'reputation',label:'Reputación',body:'Es tu imagen general: mejora ligeramente tu atractivo en las provincias donde compites. Algunas respuestas la cambian y recaudar demasiado la reduce. No sustituye una buena relación con otro partido.'},
 ];
 return {actions,tasks,resources:resources.map(r=>({...r,value:current?.[r.id],max:c.resources[r.id].max})),modern,turns:c.turns,costScope:state?'Costes de tu candidato; las tareas del equipo se suman.':'Costes base; el perfil y los especialistas pueden cambiarlos.',recovery:c.resources.energy.recovery};
}
