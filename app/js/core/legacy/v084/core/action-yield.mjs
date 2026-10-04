// One public rule shared by execution and action preview. Historical engines
// keep their own original calculation; callers can preview both contracts.
export function actionRepeatPercent(actionId,repeats,config){
  const values=config.rulesVersion==='0.8.4'&&actionId==='interview'
    ?config.support.interviewRepeatPercent:config.support.repeatPercent;
  return values[Math.min(repeats,values.length-1)];
}

export function cohesionPercent(cohesion,config){
  if(config.rulesVersion==='0.8.4'){
    const curve=config.support.cohesionCurve;
    return Math.max(curve.minPercent,Math.min(curve.maxPercent,
      100+(cohesion-curve.baseline)*curve.percentPerPoint));
  }
  return cohesion<config.support.cohesionLowBelow?config.support.cohesionLowPercent:100;
}
