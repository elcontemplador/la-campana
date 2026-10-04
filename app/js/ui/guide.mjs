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
   :state.activeEvent==='E31'&&['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)
    ?'Elige qué quieres preparar para el debate. Pulsar Responder guarda tu elección al momento, sin gastar recursos. Después puedes poner al equipo a ensayar. En el debate podrás cambiar de respuesta.'
    :'Lee qué ocurre y qué ganas o pierdes con cada respuesta. Pulsar Responder aplica esa decisión al momento. Después elegirás tu jugada en el mapa.';
  result.more=['Las fichas de preparación se gastan al usarlas. Algunas respuestas las necesitan: mira el coste de cada tarjeta.','Si encargas la respuesta a alguien del equipo, esa persona puede quedar ocupada y no hacer otra tarea ese turno.'];
 }else if(view.id==='recount'){
  result.body='Mira cómo se reparten los escaños. Puedes avanzar por provincias o ver el Congreso completo; saltar la animación no cambia el resultado.';
 }else if(view.id==='province'){
  result.body='Elige una provincia del mapa. Ganar señala dónde puedes quitarle un escaño a un rival; Defender, dónde puedes perder uno tuyo. Puedes cambiar de destino antes de Jugar.';
  result.more=['Las cifras del sondeo son estimaciones. Los votos que faltan para un escaño no son los que dará una visita.','Organizar voluntarios deja un equipo que suma apoyo al terminar cada turno. Visitar busca apoyo con una sola salida del candidato.'];
 }else if(view.id==='action'){
  result.body='Elige una: Visitar gana apoyo local; Medios llega a más provincias; Recaudar repone caja; Descansar recupera energía. Revisa el coste total y pulsa Jugar.';
  result.more=['El candidato hace una sola jugada. El equipo propone hasta dos tareas: puedes aceptarlas, cambiarlas o elegir Ahorrar.','El equipo actúa antes: ensayar puede ayudar a Medios hoy. Debes poder pagar el plan con la caja que ya tienes, antes de recaudar.'];
 }else if(view.id==='consequence'&&state.phase==='debrief'){
  result.body='Comprueba lo que ganaste y gastaste. Mira también qué hizo el equipo. Una buena jugada puede sumar apoyo aunque el sondeo no dé un escaño más todavía.';
  result.more=['El sondeo también recoge las jugadas rivales. El cambio total no se debe solo a tu acción.','Ensayar prepara futuras respuestas; los voluntarios trabajan en la provincia; las reuniones ayudan a pactar. Ninguna de esas tareas garantiza un escaño.'];
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
 const benefits={visit:'Buscas ganar apoyo en la provincia elegida.',interview:'Buscas ganar apoyo en las provincias donde te presentas.',fundraise:`Recibes hasta ${definition('fundraise').effect.budget} de caja las primeras ${definition('fundraise').effect.abuseAfter} veces; después, hasta ${definition('fundraise').effect.lateBudget} cada vez.`,rest:`Recuperas hasta ${definition('rest').effect.energy} de energía por descansar.`};
 const when={visit:'Para disputar un escaño concreto o defender una provincia.',interview:'Para llegar a más provincias. Aprovecha una ficha de preparación si la tienes.',fundraise:'Cuando necesitas financiar próximos turnos. Desde la tercera vez también pierdes reputación.',rest:'Cuando te falta energía para otra salida. El equipo puede seguir trabajando y gastando caja.'};
 const actions=['visit','interview','fundraise','rest'].map(id=>{
  const a=definition(id),cost=state?actionCost(state,bundle,'P1','candidate',id,id==='interview'?'national':null):a.cost;
  return {id,label:labels[id],benefit:benefits[id],when:when[id],cost};
 });
 const notes={
  organize:['Deja un equipo de voluntarios que suma apoyo al terminar este turno y los siguientes.','Es más útil al principio: los voluntarios tienen más turnos para trabajar.'],
  prepare:['Ganas fichas de preparación: las gastas para mejorar Medios o responder a algunas noticias y al debate.','El ensayo sirve para Medios de este mismo turno. No cambia una noticia o un debate que ya hayas contestado.'],
  mediate:['Mejoras la relación con el rival elegido.','Prepara un posible pacto; la relación por sí sola no garantiza su voto.'],
  wait:['Conservas caja; esa persona no hace otra tarea.','Elige Ahorrar cuando prefieras reservar dinero. No genera ingresos.'],
  advertise:['Busca apoyo este turno en una provincia o en todas las provincias donde te presentas.','Cuesta caja, sin cansar al candidato. La opción nacional cuesta más.'],
  research:['Obtienes una estimación más precisa de cómo vas en una provincia.','Te ayuda a elegir dónde actuar. Consultar el sondeo no hace que más gente te apoye.'],
  outreach:['Mejoras la relación con una asociación de la campaña.','Puede abrir o cambiar escenas. No entrega votos automáticamente.'],
 };
 const tasks=['organize','prepare','mediate','wait','advertise','research','outreach'].map(id=>{
  const a=c.staffActions.find(x=>x.id===id);
  const costs=state?state.selectedStaff.map(actor=>{const person=c.staff.find(p=>p.id===actor);return {name:person?.name||actor,...actionCost(state,bundle,'P1',actor,id),...(id==='prepare'?{readiness:a.effect.readiness+Number(person?.bonus?.extraReadiness||0)+(c.rulesVersion!=='0.6.1'&&state.candidate.profile==='preparacion'?1:0)}:{})};}):[{name:'Base',...a.cost,...(id==='prepare'?{readiness:a.effect.readiness}:{})}];
  const detail=id==='organize'?`+${a.effect.organization} equipo local; máximo ${c.resources.organization.max} por provincia.`
   :id==='prepare'?`Puedes guardar hasta ${c.resources.readiness.max} fichas. Abajo ves cuántas aporta cada persona. En una partida abierta ya se incluyen las ventajas de tu perfil y su especialidad.`
   :id==='mediate'?`Sube ${a.effect.relation} puntos la relación, hasta un máximo de ${c.resources.relation.max}. Con ${c.negotiation.minRelationForAutomaticSupport} puntos, el rival puede apoyar un programa que le encaje; aún no tienes su voto asegurado.`
   :id==='research'?`Mejora ${a.effect.pollPrecisionTurns} sondeos: el que verás al terminar este turno y el siguiente.`
   :id==='outreach'?`La relación con la asociación sube ${a.effect.rapport} puntos de base. Tu perfil y el especialista pueden aumentarlos.`:'';
  return {id,label:teamTaskLabel(id),benefit:notes[id][0],detail,when:notes[id][1],costs,nationalCost:a.nationalCost};
 });
 const modern=['0.8.4','0.8.5'].includes(c.rulesVersion);
 const resources=[
  {id:'budget',label:'Caja',body:'Paga tus acciones y las tareas del equipo. Revisa el coste conjunto junto a Jugar. Recaudar financia los turnos siguientes: no permite pagar un plan que ahora no puedes costear.'},
  {id:'energy',label:'Energía',body:`Es la fuerza que le queda al candidato para actuar. Sus jugadas pueden gastarla; las tareas del equipo no. Con muy poca energía, Visitar y Medios consiguen menos apoyo. Al terminar cada turno recuperas hasta ${c.resources.energy.recovery}, además de lo que recuperes con Descansar. El máximo es ${c.resources.energy.max}.`},
  {id:'readiness',label:'Preparación',body:`Son fichas que ganas al ensayar y gastas al intervenir. Medios usa una automáticamente si la tienes; algunas respuestas de noticias o debate también cuestan una ficha. Puedes guardar hasta ${c.resources.readiness.max}. Por ejemplo: si tienes 2 y Medios usa 1, te queda 1 para otra intervención.`},
  {id:'cohesion',label:'Cohesión',body:modern?'Mide cómo de coordinado está el equipo. Por encima de 60, Visitar y Medios ganan fuerza; por debajo pierden. En 60 su efecto es neutro. El cambio es gradual y llega hasta un 20 % más o menos.':'Mide la coordinación del equipo. En esta edición, una cohesión muy baja reduce el efecto de Visitar y Medios.'},
  {id:'reputation',label:'Reputación',body:'Es la imagen que das a los votantes. Una reputación más alta te favorece un poco en las provincias donde compites. Algunas respuestas la cambian y recaudar demasiado la reduce. No es lo mismo que llevarte bien con otro partido.'},
 ];
 return {actions,tasks,resources:resources.map(r=>({...r,value:current?.[r.id],max:c.resources[r.id].max})),modern,turns:c.turns,costScope:state?'Costes de tu candidato; las tareas del equipo se suman.':'Costes base; el perfil y los especialistas pueden cambiarlos.',recovery:c.resources.energy.recovery};
}
