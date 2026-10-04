import {resolveCampaignBundle} from '../core/campaign.mjs';
import {canCampaignHere} from './strategy.mjs';

// A public seat opportunity explains relevance; it does not describe a move,
// reveal an electoral result, or require a visit to this province.
export function rivalContest(state, sourceBundle, context = {}) {
  const {partyId, provinceId} = context || {};
  if (!state || !['event', 'planning', 'debrief'].includes(state.phase)
    || !Number.isSafeInteger(state.turn) || state.turn < 1
    || typeof partyId !== 'string' || partyId === 'P1' || typeof provinceId !== 'string') return null;
  let bundle;
  try {bundle = resolveCampaignBundle(sourceBundle, state);} catch {return null;}
  if (state.turn > bundle.config.turns) return null;
  const province = bundle.provinces.districts.find(d => d.id === provinceId);
  const rival = bundle.config.parties.find(p => p.id === partyId);
  if (!province || !rival || !canCampaignHere(bundle, provinceId)) return null;
  const cutoff = state.phase === 'debrief' ? state.turn : state.turn - 1;
  const poll = state.publishedPolls?.P1;
  if (!poll || !Number.isSafeInteger(poll.turn) || poll.turn < 0 || poll.turn > cutoff) return null;
  const opportunity = poll.districts?.[provinceId]?.opportunity;
  if (opportunity?.present !== true || opportunity.player !== 'P1') return null;
  const choices = [
    {kind: 'defense', against: opportunity.defense?.against, margin: opportunity.defense?.votesMargin},
    {kind: 'attack', against: opportunity.attack?.against, margin: opportunity.attack?.votesNeeded},
  ].filter(choice => choice.against === partyId && Number.isFinite(choice.margin) && choice.margin >= 0);
  const choice = choices.sort((a, b) => a.margin - b.margin)[0];
  if (!choice) return null;
  const text = choice.kind === 'attack'
    ? `Tu próximo escaño en ${province.name} está en disputa con ${rival.name}, según el sondeo.`
    : `${rival.name} puede disputar tu escaño más ajustado en ${province.name}, según el sondeo.`;
  return {partyId, provinceId, provinceName: province.name, kind: choice.kind, text};
}
