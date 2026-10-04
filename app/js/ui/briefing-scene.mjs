// Invented campaign drafts. These numbers are scene props, never poll data.
const cases={
 alquiler:['Los alquileres que no se pueden visitar','«Hay 40 pisos disponibles»','De los 40 anuncios, 30 dicen «reservado». Solo quedan 10 pisos.'],
 turismo:['El piso turístico contado dos veces','«Hay 24 pisos turísticos»','Hay 24 anuncios, pero 8 pisos aparecen en dos portales. Son 16 pisos.'],
 'vivienda-plazos':['Los pisos del discurso siguen en el papel','«Ya hay 120 pisos nuevos»','Son 120 solicitudes de obra. No hay ninguna vivienda terminada.'],
 'sanidad-espera':['Una cita no es una consulta','«Carmen ya ha visto al especialista»','Carmen tiene una cita asignada. Todavía no ha ido a la consulta.'],
 'escuela-infantil':['Las plazas de una escuela aún cerrada','«Hay 60 plazas infantiles nuevas»','Se han autorizado 60 plazas, pero la escuela todavía está cerrada.'],
 cuidados:['La ayuda aprobada aún no ha llegado','«Andrés ya recibe 20 horas de ayuda»','Le han aprobado 20 horas para su madre. Todavía no ha empezado el servicio.'],
 autonomos:['La ayuda anunciada que Marta no puede pedir','«Marta ya puede pedir la ayuda»','La ayuda está anunciada. Aún no hay un formulario para solicitarla.'],
 'primer-empleo':['Las ofertas que no son para el primer empleo','«Hay 50 ofertas para jóvenes sin experiencia»','De las 50 ofertas, 40 piden experiencia. Solo 10 admiten a quienes empiezan.'],
 energia:['Tres parques que todavía no producen luz','«Tres parques nuevos ya abaratan la luz»','Los tres parques tienen permiso. Ninguno está conectado a la red.'],
 financiacion:['El dinero que todavía no llegó al centro','«El centro de salud ya tiene el dinero»','El dinero está aprobado en el presupuesto. Todavía no se ha transferido al centro.'],
 'transporte-rural':['El autobús llega después de la cita médica','«El autobús llega a tiempo para la consulta»','La consulta es a las 10. El autobús llega a las 11.'],
 agua:['El embalse no tiene toda esa agua para regar','«Hay 30 millones de litros para regar»','De esos 30 millones de litros, 12 están reservados para beber. Quedan 18 para regar.'],
};
export function briefingScene(state,{issue,provinceId,antecedent=null}={}){
 if(!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion)||!['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)||!cases[issue?.id])return null;
 const [title,draft,fact]=cases[issue.id];
 return {eventId:'E08',turn:8,provinceId,format:'politics',icon:'research',issueId:issue.id,topicId:issue.topicId,antecedent,
  speaker:{kind:'team',id:'campaign-team',name:'Tu equipo',role:'Ha detectado un error en el borrador'},
  title,shortBody:`El borrador dice ${draft}. ${fact}`,
  body:`La frase aún no ha salido de la sala de campaña. Tu propuesta sigue siendo ${issue.brief}. Puedes pagar una comprobación completa, encargar la respuesta a Inés o quitar esa frase del discurso.`,
  briefingDecision:{caseId:issue.id,draft,fact,proposal:issue.brief},
  optionLabels:{verify:'Comprobar y preparar la respuesta',ines_verify:'Encargárselo a Inés',remove:'Quitar la frase del discurso'},
  optionSpeeches:{verify:'Comprobad los datos y dejadme una respuesta que pueda explicar.',ines_verify:'Inés, prepara la explicación. Hoy dejas las otras tareas.',remove:'Fuera esa frase. Podemos defender nuestra propuesta sin inventarnos resultados.'},
  optionIntents:{verify:'Pagas una comprobación completa y sumas preparación para tus próximas intervenciones.',ines_verify:'Inés prepara la respuesta. Ocupa su tarea y coordina al equipo.',remove:'Retiras la frase. Conservas caja y equipo disponibles, sin preparación adicional.'}};
}
