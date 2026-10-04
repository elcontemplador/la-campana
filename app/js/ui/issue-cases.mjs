import {resolveCampaignBundle} from '../core/campaign.mjs';

// Original fictional people and situations, inspired by documented public issues.
// These arguments illustrate the selected public pole; they add no policy effects.
const cases = [
 {id:'alquiler',topicId:'T1',title:'Lucía no puede pagar el alquiler',
  situation:'Le han subido el alquiler a Lucía. Aunque trabaja, tiene que volver a casa de sus padres.',
  question:'¿Limitarás las subidas del alquiler o facilitarás que haya más pisos?',
  humour:'El estudio presume de cocina abierta: abierta al dormitorio, al salón y a la puerta.',
  positions:{
   '-1':{reply:'Propongo limitar las subidas del alquiler y construir más vivienda pública para alquilar.',brief:'limitar subidas y construir vivienda pública',objection:'¿Y si algunos propietarios dejan de alquilar?',limit:'La vivienda pública cuesta dinero y tarda en construirse; los límites pueden reducir los pisos en alquiler.'},
   '1':{reply:'Propongo dar permisos más rápido para construir pisos y garantías a los propietarios que los alquilen.',brief:'más pisos y permisos de obra rápidos',objection:'¿Qué hará Lucía mientras se construyen esos pisos?',limit:'Los pisos nuevos tardan en llegar; dar permisos no baja el alquiler de Lucía de inmediato.'}}},
 {id:'turismo',topicId:'T1',title:'Pisos para turistas, pocos para vecinos',
  situation:'Varios pisos del bloque de Pilar se alquilan a turistas. Su hija no encuentra uno para vivir.',
  question:'¿Limitarás los pisos turísticos o construirás más vivienda para vecinos?',
  humour:'Pilar ya conoce a más despedidas de soltero que vecinos de su escalera.',
  positions:{
   '-1':{reply:'Propongo limitar los pisos turísticos en las zonas donde faltan alquileres para vecinos.',brief:'limitar los pisos turísticos',objection:'¿Qué les dirás a quienes viven de alquilar a turistas?',limit:'Limitar el turismo reduce ese negocio; hace falta comprobar que los pisos vuelven al alquiler para vecinos.'},
   '1':{reply:'Propongo construir más pisos para vecinos sin limitar los pisos turísticos. Exigiría controles de ruido y seguridad.',brief:'construir más sin limitar pisos turísticos',objection:'¿Y si sigue siendo más rentable alquilar a turistas?',limit:'Construir tarda; las reglas de ruido y seguridad no garantizan más alquileres para vecinos.'}}},
 {id:'vivienda-plazos',topicId:'T1',title:'Los pisos siguen esperando permisos',
  situation:'No empieza la construcción de unos pisos porque faltan permisos. Sergio sigue alquilando una habitación.',
  question:'¿Pagarás vivienda pública o acelerarás permisos para construir más pisos?',
  humour:'En la foto electoral ya hay viviendas; en el solar todavía hay una valla.',
  positions:{
   '-1':{reply:'Propongo usar suelo público y pagar la construcción de pisos con alquileres asequibles.',brief:'vivienda pública con alquileres asequibles',objection:'¿De dónde saldrán el suelo y el dinero?',limit:'Construir vivienda pública exige dinero, permisos y servicios para el barrio; Sergio tendrá que esperar.'},
   '1':{reply:'Propongo dar los permisos más rápido y facilitar suelo para que se construyan más pisos.',brief:'más suelo y permisos de obra rápidos',objection:'¿Cómo podrán pagarlos quienes buscan su primera casa?',limit:'Dar permisos no garantiza pisos baratos; también habrá que asegurar servicios para el barrio.'}}},
 {id:'sanidad-espera',topicId:'T2',title:'Carmen espera al especialista',
  situation:'Carmen sigue de baja y no tiene fecha para el especialista.',
  question:'¿Contratarás en la sanidad pública o pagarás citas en clínicas privadas?',
  humour:'Tu equipo tiene fecha para tres mítines. Carmen aún espera una para su consulta.',
  positions:{
   '-1':{reply:'Propongo contratar más profesionales y ampliar los turnos en los centros públicos para reducir la espera.',brief:'contratar en centros sanitarios públicos',objection:'¿Hay profesionales disponibles para contratar?',limit:'Contratar cuesta dinero y encontrar profesionales lleva tiempo; la espera no desaparece al anunciarlo.'},
   '1':{reply:'Propongo que la sanidad pública pague citas en clínicas privadas cuando sus centros no den abasto. Carmen no pagaría la consulta.',brief:'pagar citas privadas desde la sanidad pública',objection:'¿Cómo controlarás lo que cobran y la calidad de la atención?',limit:'Pagar citas fuera cuesta dinero; hay que vigilar la calidad y evitar dejar sin personal a los centros públicos.'}}},
 {id:'escuela-infantil',topicId:'T2',title:'Raúl y Eva necesitan una plaza infantil',
  situation:'Raúl y Eva trabajan, pero su hija se ha quedado sin plaza en la escuela infantil.',
  question:'¿Abrirás más plazas públicas o darás ayudas para pagar centros privados?',
  humour:'El folleto dice «conciliación». La abuela dice que el martes no puede.',
  positions:{
   '-1':{reply:'Propongo abrir más plazas públicas para niños pequeños, con precios que las familias puedan pagar.',brief:'abrir más plazas públicas de escuela infantil',objection:'¿Cuándo estarán listas y quién atenderá a los niños?',limit:'Abrir centros y contratar personal lleva tiempo; esta familia necesita una solución mientras tanto.'},
   '1':{reply:'Propongo ampliar las plazas públicas y dar ayudas según los ingresos para pagar escuelas infantiles privadas.',brief:'ayudas para plazas infantiles privadas',objection:'¿Las ayudas alcanzarán para pagar la plaza?',limit:'Las ayudas cuestan dinero y pueden quedarse cortas si suben los precios; todos los centros necesitan controles.'}}},
 {id:'cuidados',topicId:'T2',title:'Andrés necesita ayuda para cuidar a su madre',
  situation:'Andrés cuida a su madre y espera ayuda a domicilio. Ya no le quedan días libres.',
  question:'¿Ampliarás la ayuda pública a domicilio o contratarás a empresas supervisadas?',
  humour:'La ventanilla pide paciencia. Andrés necesita a alguien el lunes a las ocho.',
  positions:{
   '-1':{reply:'Propongo contratar más profesionales para ampliar las horas de ayuda pública a domicilio.',brief:'más horas de ayuda pública a domicilio',objection:'¿Cómo pagarás esas horas y encontrar a quien las haga?',limit:'La ayuda necesita dinero y personal; aprobarla no garantiza que alguien vaya ya a casa de Andrés.'},
   '1':{reply:'Propongo pagar a empresas autorizadas para ampliar la ayuda a domicilio y comprobar que atienden bien a las familias.',brief:'contratar ayuda a domicilio supervisada',objection:'¿Quién vigilará los horarios y las condiciones del personal?',limit:'Contratar empresas también cuesta dinero; hay que comprobar que cumplen las horas y mantienen al personal.'}}},
 {id:'autonomos',topicId:'T3',title:'Marta paga antes de abrir su taller',
  situation:'Marta necesita permisos y dinero para abrir un taller. Ya paga gastos y aún no tiene clientes.',
  question:'¿Darás ayudas para abrir negocios o reducirás pagos y trámites?',
  humour:'Ya tiene sello, certificado y contraseña. Lo único que falta es el primer cliente.',
  positions:{
   '-1':{reply:'Propongo ayudas y préstamos para abrir pequeños negocios, con formación y protección social para los autónomos.',brief:'ayudas y préstamos para abrir negocios',objection:'¿Cómo recibiría Marta la ayuda antes de tener que cerrar?',limit:'Las ayudas cuestan dinero y pueden llegar tarde; anunciar un préstamo no paga los gastos de Marta.'},
   '1':{reply:'Propongo reducir los pagos al empezar y hacer todos los trámites en una sola oficina.',brief:'reducir pagos y trámites al abrir negocios',objection:'¿Con qué dinero pagarás los servicios si recaudas menos?',limit:'Cobrar menos reduce los ingresos públicos; habrá que explicar cómo se paga la protección de los autónomos.'}}},
 {id:'primer-empleo',topicId:'T3',title:'Dani busca trabajo y le piden experiencia',
  situation:'Dani acaba su formación, pero las empresas le piden experiencia para su primer empleo.',
  question:'¿Pagarás formación con empleo o reducirás el coste de contratar a jóvenes?',
  humour:'La oferta pide entusiasmo, disponibilidad y tres años haciendo exactamente ese primer empleo.',
  positions:{
   '-1':{reply:'Propongo pagar formación práctica y apoyar a las empresas que ofrezcan empleo estable a quienes empiezan.',brief:'pagar formación y apoyar el empleo estable',objection:'¿Cómo evitarás pagar por puestos que ya iban a crearse?',limit:'Las ayudas cuestan dinero; hay que comprobar que crean empleo y que la formación no sustituye puestos normales.'},
   '1':{reply:'Propongo reducir el coste de la primera contratación y ofrecer formación en empresas, con condiciones laborales claras.',brief:'rebajar el coste de contratar a jóvenes',objection:'¿Cómo impedirás que encadenen contratos baratos?',limit:'Contratar más barato no asegura un buen empleo; hacen falta controles para evitar abusos.'}}},
 {id:'energia',topicId:'T3',title:'La factura de la luz amenaza los turnos de la fábrica',
  situation:'Una fábrica paga más por la luz y se plantea reducir turnos. Sus trabajadores temen perder ingresos.',
  question:'¿Darás ayudas para ahorrar energía o bajarás impuestos y acelerarás permisos?',
  humour:'Alguien propone apagar la luz. El encargado recuerda que las máquinas también funcionan con electricidad.',
  positions:{
   '-1':{reply:'Propongo ayudas para que la fábrica gaste menos energía e inversión pública en renovables y redes eléctricas.',brief:'ayudas para ahorrar energía y más renovables',objection:'¿Quién paga las ayudas y cuándo bajarían los gastos?',limit:'Las ayudas cuestan dinero; mejorar la fábrica y la red lleva tiempo y no baja la factura de hoy.'},
   '1':{reply:'Propongo bajar impuestos a la electricidad y dar permisos más rápido a nuevas instalaciones que cumplan las normas.',brief:'bajar impuestos a la luz y acelerar permisos',objection:'¿Cómo pagarás los servicios si cobras menos impuestos?',limit:'Bajar impuestos reduce los ingresos públicos; dar permisos no construye por sí solo las instalaciones.'}}},
 {id:'financiacion',topicId:'T4',title:'Las comunidades piden más dinero para sus servicios',
  situation:'Dos comunidades piden más dinero para hospitales y escuelas. Ninguna quiere recibir menos.',
  question:'¿Fijarás un reparto común o darás más decisión sobre el dinero a cada comunidad?',
  humour:'Todos apoyan la solidaridad. El silencio llega cuando se reparte la factura.',
  positions:{
   '-1':{reply:'Propongo un reparto común del dinero y servicios mínimos de sanidad y educación para todas las comunidades.',brief:'un reparto común para financiar servicios',objection:'¿Cómo contarás que atender a la gente cuesta distinto en cada sitio?',limit:'No todas las comunidades recibirán lo que piden; un reparto común debe tener en cuenta sus costes distintos.'},
   '1':{reply:'Propongo que cada comunidad decida más sobre su financiación y acuerde con las demás cómo ayudar a las que tienen menos.',brief:'más decisión autonómica sobre el dinero',objection:'¿Cómo evitarás que una comunidad tenga peores servicios?',limit:'Dar más decisión no crea dinero; hay que acordar ayudas y mínimos para las comunidades con menos recursos.'}}},
 {id:'transporte-rural',topicId:'T4',title:'El autobús no sirve para ir al médico',
  situation:'El horario del autobús del pueblo no permite ir a la consulta y volver a casa el mismo día.',
  question:'¿Fijarás un servicio mínimo común o dejarás las rutas en manos de cada territorio?',
  humour:'La conexión perfecta existe en el mapa del despacho, donde nadie espera el autobús.',
  positions:{
   '-1':{reply:'Propongo un servicio mínimo de transporte para todos los pueblos y dinero compartido para pagarlo.',brief:'un servicio mínimo de autobús para todos',objection:'¿Quién ajustará los horarios para llegar a la consulta?',limit:'Fijar un mínimo no arregla cada horario; los responsables locales tendrán que adaptar las rutas.'},
   '1':{reply:'Propongo que los responsables del territorio ajusten las rutas y los horarios, con dinero para mantenerlas.',brief:'rutas decididas por cada territorio',objection:'¿Qué pasará en los pueblos donde el servicio cuesta más?',limit:'Decidir las rutas cerca no paga el autobús; los pueblos con menos recursos también necesitan financiación.'}}},
 {id:'agua',topicId:'T4',title:'Dos territorios quieren la misma agua',
  situation:'No hay agua suficiente para todos los riegos previstos. Agricultores y dos administraciones discuten el reparto.',
  question:'¿Fijarás prioridades comunes para el río o negociarás con cada territorio?',
  humour:'Se han anunciado dos reuniones y tres comunicados. El río no ha leído ninguno.',
  positions:{
   '-1':{reply:'Propongo reglas de reparto para toda la cuenca, dando prioridad al agua para beber y fijando cuánto se puede regar.',brief:'reglas comunes para repartir el agua',objection:'¿Cómo escucharás a los agricultores de cada zona?',limit:'Con menos agua, algunos riegos tendrán que reducirse; una regla común no evita esas pérdidas.'},
   '1':{reply:'Propongo que los territorios acuerden el reparto del río y decidan cómo reducir el consumo en su zona.',brief:'negociar el reparto con los territorios',objection:'¿Qué harás si cada territorio exige más de lo que hay?',limit:'El río es compartido; ningún territorio puede decidir su consumo ignorando al resto y habrá que reducir algunos riegos.'}}},
];
const shortSituations={
 alquiler:'Le suben el alquiler a Lucía. Aunque trabaja, tiene que volver a casa de sus padres.',
 turismo:'La hija de Pilar busca alquiler. En el bloque quedan cada vez más pisos para turistas.',
 'vivienda-plazos':'Faltan permisos para construir pisos. Sergio sigue alquilando una habitación.',
 autonomos:'Marta paga gastos antes de abrir su taller. Le faltan permisos y dinero.',
 'primer-empleo':'Dani busca su primer empleo; le piden experiencia.',
 energia:'La fábrica paga más por la luz. Si reduce turnos, sus trabajadores cobrarán menos.',
 'transporte-rural':'El autobús del pueblo no permite ir al médico y volver a casa el mismo día.',
 agua:'Falta agua para todos los riegos previstos. Dos territorios discuten cómo repartirla.',
};
for(const c of cases)c.shortSituation=shortSituations[c.id]||c.situation;
const briefingDisagreements={
 alquiler:'Un informe suma pisos anunciados; el otro, pisos disponibles.',
 turismo:'Uno cuenta alojamientos; otro separa vecinos y turistas.',
 'vivienda-plazos':'Uno cuenta permisos en trámite; otro, viviendas terminadas.',
 'sanidad-espera':'Uno cuenta citas asignadas; otro, pacientes que esperan.',
 'escuela-infantil':'Uno cuenta plazas autorizadas; otro, plazas abiertas.',
 cuidados:'Uno cuenta ayudas aprobadas; otro, horas de cuidado recibidas.',
 autonomos:'Uno enumera ayudas anunciadas; otro, las que ya se pueden pedir.',
 'primer-empleo':'Uno suma ofertas; otro, las que admiten a gente sin experiencia.',
 energia:'Uno cuenta proyectos autorizados; otro, la electricidad que ya se produce.',
 financiacion:'Uno suma el dinero enviado; otro compara lo que cuestan hospitales y escuelas.',
 'transporte-rural':'Uno cuenta rutas; otro mira si permiten ir y volver a la consulta.',
 agua:'Uno usa el volumen anual; otro, el agua disponible en la estación seca.',
};
for(const c of cases)c.briefing=briefingDisagreements[c.id];
// Short formulations keep radio and debate responses comparable on screen.
const shortProposals={
 alquiler:['limitar subidas y construir vivienda pública','más pisos y permisos de obra rápidos'],
 turismo:['limitar los pisos turísticos','construir más sin limitar pisos turísticos'],
 'vivienda-plazos':['vivienda pública con alquileres asequibles','más suelo y permisos de obra rápidos'],
 'sanidad-espera':['contratar en centros sanitarios públicos','pagar citas privadas desde la sanidad pública'],
 'escuela-infantil':['abrir más plazas públicas de escuela infantil','ayudas para plazas infantiles privadas'],
 cuidados:['más horas de ayuda pública a domicilio','contratar ayuda a domicilio supervisada'],
 autonomos:['ayudas y préstamos para abrir negocios','reducir pagos y trámites al abrir negocios'],
 'primer-empleo':['pagar formación y apoyar el empleo estable','rebajar el coste de contratar a jóvenes'],
 energia:['ayudas para ahorrar energía y más renovables','bajar impuestos a la luz y acelerar permisos'],
 financiacion:['un reparto común para financiar servicios','más decisión autonómica sobre el dinero'],
 'transporte-rural':['un servicio mínimo de autobús para todos','rutas decididas por cada territorio'],
 agua:['reglas comunes para repartir el agua','negociar el reparto con los territorios'],
};
for(const c of cases)for(const [i,pole]of [-1,1].entries())c.positions[pole].brief=shortProposals[c.id][i];
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const ISSUE_CASES=freeze(cases);
const hash=value=>{let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return n;};

export function campaignIssue(state,sourceBundle,{topicId=state?.commitments?.[0],sceneKey='radio',caseId=null,provinceId=null,partyId='P1'}={}){
 if(!state)return null;
 const bundle=resolveCampaignBundle(sourceBundle,state),topic=bundle.config.topics.find(t=>t.id===topicId);
 const available=ISSUE_CASES.filter(c=>c.topicId===topicId);
 if(!topic||!available.length)return null;
 const issue=available.find(c=>c.id===caseId)||available[hash(`${state.seed}:${sceneKey}:${topicId}`)%available.length];
 const publicParty=bundle.config.parties.find(p=>p.id===partyId);
 const position=partyId==='P1'?state.parties.P1.positions[topicId]:publicParty?.positions?.[topicId];
 const argument=issue.positions[position];
 if(!argument)return null;
 const place=bundle.provinces.districts.find(p=>p.id===(provinceId||state.initialSetup?.province))?.name||'tu provincia';
 return {id:issue.id,topicId,topicName:topic.name,place,title:issue.title,situation:issue.situation,shortSituation:issue.shortSituation,briefing:issue.briefing,question:issue.question,
  humour:issue.humour,...argument,proposal:argument.brief,positionLabel:topic.poles.find(p=>p.id===position)?.label||topic.name};
}

// Either of the two chosen priorities can open the campaign. The selection is
// presentation-only and seeded independently from the engine's random stream.
export function openingIssue(state,sourceBundle){
 if(!state)return null;
 const bundle=resolveCampaignBundle(sourceBundle,state);
 const priorities=(state.commitments||[]).filter(id=>bundle.config.topics.some(t=>t.id===id));
 if(!priorities.length)return null;
 const topicId=priorities[hash(`${state.seed}:opening`) % priorities.length];
 return campaignIssue(state,bundle,{topicId,sceneKey:'E01'});
}
