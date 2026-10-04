import {disciplineProgrammeBrief} from './party-discipline.mjs';
import {resolveCampaignBundle} from '../core/campaign.mjs';
import {campaignIssue, ISSUE_CASES} from './issue-cases.mjs';
import {resolveTopicEffect} from '../core/topic-effects.mjs';

const levels = ['baja', 'media', 'alta'];
const isPole = value => value === -1 || value === 1;

// Explain an actual thematic effect from the player's published local survey.
// Do not call getEventView: its effect preview also computes unpublished values.
export function eventLocalReception(state, sourceBundle, optionId) {
  if (state?.phase !== 'event' || typeof optionId !== 'string') return null;
  let bundle;
  try { bundle = resolveCampaignBundle(sourceBundle, state); }
  catch { return null; }
  const event = bundle.content.events.find(item => item.id === state.activeEvent);
  const scene = event?.stages ? event.stages[state.eventStage] : event;
  const option = scene?.options?.find(item => item.id === optionId);
  const rawEffect = option?.effects?.find(item => ['topic_support','priority_support'].includes(item.type));
  const effect = rawEffect?resolveTopicEffect(rawEffect,state,bundle):null;
  if (!effect) return null;

  const provinceId = state.focusProvince;
  const province = bundle.provinces.districts.find(item => item.id === provinceId);
  const issue = state.publishedPolls?.P1?.districts?.[provinceId]?.issues?.[effect.topicId];
  const position = state.parties?.P1?.positions?.[effect.topicId];
  if (!province || !isPole(position) || !isPole(issue?.position)
      || !Number.isInteger(issue.salience) || issue.salience < 1 || issue.salience > 3) return null;

  const sceneKey=event.id==='E01'?'launch:'+effect.topicId:event.id==='E04'&&['0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)?'E04':event.id==='E05'&&['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)?'E05':'E33';
  const ownCase = campaignIssue(state, bundle, {topicId: effect.topicId, sceneKey, provinceId});
  const commonCase = ISSUE_CASES.find(item => item.id === ownCase?.id && item.topicId === effect.topicId);
  const originalProposal=commonCase?.positions?.[issue.position]?.brief;
  const preferredProposal=event.id==='E05'&&['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)?disciplineProgrammeBrief(ownCase?.id,issue.position,originalProposal):originalProposal;
  if (typeof preferredProposal !== 'string' || !preferredProposal.trim()) return null;
  const matches = position === issue.position, salience = issue.salience, level = levels[salience - 1];
  return {
    provinceId, provinceName: province.name, topicId: effect.topicId,
    preferredProposal, matches, salience, level,
    text: `Preferencia del sondeo: ${preferredProposal}. Tu propuesta ${matches ? 'coincide' : 'va en otra dirección'}. Importancia ${level}.`,
  };
}
