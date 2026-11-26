import {campaignObjective, resolveCampaignBundle} from '../core/campaign.mjs';
import {campaignRecap} from './campaign-recap.mjs';

const endings = {
  government: 'Presides el Gobierno',
  support: 'Apoyaste la investidura',
  opposition: 'En la oposición',
  deadlock: 'Congreso sin acuerdo',
};
const list = new Intl.ListFormat('es', {type: 'conjunction'});

export function campaignCover(state, sourceBundle, memories = campaignRecap(state, sourceBundle)) {
  if (state?.phase !== 'ending' || !state.electionResult || !endings[state.outcome?.type]) return null;
  const {config} = resolveCampaignBundle(sourceBundle, state);
  const seatsByParty = state.electionResult.national.seatsByParty;
  const player = config.parties.find(party => party.id === 'P1');
  const history = state.negotiation?.history || [];
  const accepted = history.find(vote => vote.invested);
  const ownLast = history.findLast(vote => vote.proponent === 'P1');
  const vote = accepted || ownLast || history.at(-1);
  const partyName = id => config.parties.find(party => party.id === id)?.name || id;
  const partner = ['government', 'support'].includes(state.outcome.type);
  const priorities = state.initialSetup.commitments.map(id => {
    const index = config.topics.findIndex(topic => topic.id === id);
    const status = accepted && partner
      ? (accepted.offer[index] >= config.negotiation.commitmentMinUnits ? 'En el acuerdo' : 'Reducida')
      : null;
    return {name: config.topics[index].name, status};
  });
  let ballot = '';
  let backers = '';
  if (vote) {
    const subject = vote.proponent === 'P1' ? 'Tu propuesta' : 'La propuesta del ' + partyName(vote.proponent);
    const round = vote.ballot === 1 ? 'primera' : 'segunda';
    ballot = `${subject} reunió ${vote.totals.yes} síes y ${vote.totals.no} noes en ${round} votación.`;
    if (accepted) {
      const others = config.parties.filter(party =>
        party.id !== vote.proponent && seatsByParty[party.id] > 0 && vote.votes[party.id] === 'yes');
      if (others.length) {
        const verb = others.length === 1 ? 'votó' : 'votaron';
        backers = 'También ' + verb + ' a favor ' + list.format(others.map(party => 'el ' + party.name)) + '.';
      }
    }
  }
  const memory = memories.find(item => item.featured) || memories[0];
  let memoryText = null;
  if (memory) {
    // Each title/summary comes from a confirmed event or plan. Some titles only
    // name the case, so use its recorded choice for the line on the poster.
    if (memory.posterLine) {
      memoryText = memory.posterLine;
    } else if (memory.storyId === 'neighbour-question') {
      memoryText = memory.title + '. ' + memory.summary;
    } else if (memory.storyId) {
      memoryText = memory.title.replace(/[.;]$/, '') + '.';
    } else {
      memoryText = memory.summary.split(/(?<=[.!?])\s/)[0] || memory.title;
    }
  }
  const objective = campaignObjective(state, sourceBundle);
  return {
    name: state.candidate.name, portraitId: state.candidate.portrait,
    partyName: player.name, mark: player.short, color: player.color,
    seats: seatsByParty.P1 || 0, totalSeats: Object.values(seatsByParty).reduce((a,b) => a+b, 0),
    result: endings[state.outcome.type], type: state.outcome.type,
    priorities, objective, ballot, backers, memory, memoryText: memoryText || ballot,
  };
}
