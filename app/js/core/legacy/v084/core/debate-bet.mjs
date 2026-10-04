// Only the confirmed public E31 choice can reinforce one debate intervention.
const bets=Object.freeze({
 challenge:{kind:'challenge',topicIndex:0,stage:1,options:['compare_programmes']},
 dialogue:{kind:'dialogue',topicIndex:0,stage:2,options:['open_dialogue']},
 second_priority:{kind:'second_priority',topicIndex:1,stage:0,options:['full_opening','ada_outline']},
});
export function debateBet(state){
 if(!['0.8.3','0.8.4'].includes(state?.rulesVersion)||!['0.8.3','0.8.4'].includes(state.contentVersion)||state.turn<5)return null;
 const entry=(state.timeline||[]).findLast(e=>e.kind==='event'&&e.eventId==='E31'&&e.turn===5
  &&e.turn<=state.turn&&typeof e.id==='string'&&(!e.partyId||e.partyId==='P1')&&bets[e.optionId]);
 return entry?{...bets[entry.optionId],options:[...bets[entry.optionId].options],entryId:entry.id,turn:entry.turn}:null;
}
export function reinforceDebateStage(stage,index,state){
 const bet=debateBet(state);if(!bet||bet.stage!==index)return;
 for(const option of stage.options.filter(o=>bet.options.includes(o.id))){
  if(bet.kind==='dialogue'){
   const relation=option.effects.find(e=>e.type==='relation'&&e.target==='P2');relation.delta+=1;
  }else{
   const reach=option.effects.find(e=>e.type==='support'&&e.target==='national');reach.delta+=20;
   if(bet.kind==='challenge'){
    const relation=option.effects.find(e=>e.type==='relation'&&e.target==='P2');
    if(relation)relation.delta-=1;else option.effects.push({type:'relation',target:'P2',delta:-1});
   }
  }
  option.feedback+=' La apuesta que anunciaste antes del debate refuerza esta intervención.';
  option.shortFeedback=option.feedback;
 }
}
