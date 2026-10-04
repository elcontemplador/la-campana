import {readFileSync} from 'node:fs';
import {createGame, dispatch, getEventView, validatePlan} from '../app/js/core/engine.mjs';

const data = name => JSON.parse(readFileSync(new URL('../data/' + name, import.meta.url), 'utf8'));
export const bundle = {config: data('game_config.json'), provinces: data('provinces_2023.json'), content: data('events.json')};
export const defaultSetup = {name: 'Alex Prado', portrait: 'portrait-1', profile: 'preparacion', staff: ['S1', 'S2'], commitments: ['T1', 'T2'], province: '09'};
export const newGame = (seed = 'test-campana', setup = {}) => createGame(bundle, seed, {...defaultSetup, ...setup});
export function command(state, type, extra = {}, scenario = bundle) {
  const result = dispatch(state, {id: `test-${state.revision + 1}`, expectedRevision: state.revision, type, ...extra}, scenario);
  if (!result.ok) throw new Error(result.error.code + ': ' + result.error.message);
  return result.state;
}
export function finishEvent(state, prefer = null) {
  while (state.phase === 'event') {
    const view = getEventView(state, bundle);
    const option = (prefer ? view.options.find(o => o.id === prefer && o.availability.available) : null)
      ?? view.options.find(o => o.availability.available && !o.reserveStaff && o.availability.cost.budget === 0 && o.availability.cost.energy === 0);
    state = command(state, 'CHOOSE_OPTION', {optionId: option.id, staffId: option.reserveStaff ? option.availability.staffChoices[0] : null});
  }
  return state;
}
export function freePlan(state) {
  return {candidate: {id: 'rest', target: null}, staff: Object.fromEntries(state.selectedStaff.filter(id => !state.reservedStaff.includes(id)).map(id => [id, {id: 'wait', target: null}]))};
}
export function playCampaign(state, policy = freePlan) {
  while (state.phase !== 'election') {
    if (state.phase === 'event') state = finishEvent(state);
    if (state.phase === 'planning') {
      let plan = policy(state);
      if (!validatePlan(state, plan, bundle).ok) plan = freePlan(state);
      state = command(state, 'CONFIRM_PLAN', {plan});
    }
    if (state.phase === 'debrief') state = command(state, 'CONTINUE');
  }
  return state;
}
