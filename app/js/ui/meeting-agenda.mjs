// Political context, not a demand, agreement or new effect. Only public programmes.
import {resolveCampaignBundle} from '../core/campaign.mjs';
import {campaignIssue} from './issue-cases.mjs';

export function meetingAgenda(state, sourceBundle, partyId, {topicId = null, speakerId = 'P1'} = {}) {
  if (!state || !partyId || partyId === speakerId) return null;
  const bundle = resolveCampaignBundle(sourceBundle, state);
  const rival = bundle.config.parties.find(p => p.id === partyId);
  const speaker = bundle.config.parties.find(p => p.id === speakerId);
  if (!rival || !speaker) return null;
  const positions = speakerId === 'P1' ? state.parties?.P1?.positions || {} : speaker.positions || {};
  const rivalPositions = partyId === 'P1' ? state.parties?.P1?.positions || {} : rival.positions || {};
  const topics = bundle.config.topics.filter(t => [-1, 1].includes(positions[t.id])
    && [-1, 1].includes(rivalPositions[t.id]));
  if (!topics.length) return null;
  const speakerPriorities = speakerId === 'P1' ? state.commitments : speaker.defaultCommitments;
  const rivalPriorities = partyId === 'P1' ? state.commitments : rival.defaultCommitments;
  const priority = t => (speakerPriorities?.includes(t.id) ? 2 : 0)
    + (rivalPriorities?.includes(t.id) ? 1 : 0);
  const ordered = [...topics].sort((a,b) => priority(b)-priority(a)
    || bundle.config.topics.indexOf(a)-bundle.config.topics.indexOf(b));
  const topic = topicId ? ordered.find(t => t.id === topicId)
    : ordered.find(t => positions[t.id] !== rivalPositions[t.id]) || ordered[0];
  if (!topic) return null;
  // Stable for the same party/topic across turns and phases, independent of engine RNG.
  const own = campaignIssue(state, bundle, {topicId: topic.id, sceneKey: 'meeting:'+partyId, partyId: speakerId});
  const other = campaignIssue(state, bundle, {topicId: topic.id, caseId: own?.id, partyId});
  if (!own || !other) return null;
  const shared = positions[topic.id] === rivalPositions[topic.id];
  const speakerLabel = speakerId === 'P1' ? 'Tú' : speaker.name.replace(/^Partido /,'');
  const rivalLabel = partyId === 'P1' ? 'Tú' : rival.name.replace(/^Partido /,'');
  return {partyId, partyName: rival.name, speakerId, speakerName: speaker.name, topicId: topic.id, topicName: topic.name,
    caseId: own.id, situation: own.shortSituation, question: own.question,
    ownProposal: own.proposal, rivalProposal: other.proposal, shared,
    summary: shared ? `Ambos: ${own.proposal}.`
      : `${speakerLabel}: ${own.proposal}. ${rivalLabel}: ${other.proposal}.`,
    label: shared ? 'Punto de encuentro' : 'Diferencia de programa'};
}
