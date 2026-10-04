// Resolve a declared priority using immutable public setup only, never surveys.
export function resolvePriorityTopic(effect,state,bundle){
  if(effect?.type!=='priority_support'||!['0.8.0','0.8.1','0.8.2','0.8.3'].includes(bundle?.config?.rulesVersion)
    ||state?.rulesVersion!==bundle.config.rulesVersion||![0,1].includes(effect.priorityIndex))return null;
  const topicId=state.initialSetup?.commitments?.[effect.priorityIndex];
  return bundle.config.topics.some(topic=>topic.id===topicId)?topicId:null;
}

export function resolveTopicEffect(effect,state,bundle){
  if(effect?.type!=='priority_support')return effect;
  const topicId=resolvePriorityTopic(effect,state,bundle);
  if(!topicId)throw new Error('La prioridad del anuncio no pertenece al programa');
  return {type:'topic_support',topicId,base:effect.base};
}

export const hasV07Features=rulesVersion=>['0.7.0','0.8.0','0.8.1','0.8.2','0.8.3'].includes(rulesVersion);
