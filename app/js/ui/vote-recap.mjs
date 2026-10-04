import {resolveCampaignBundle} from '../core/campaign.mjs';

// Recorded votes only. No forecast, relationship or new decision is computed here.
export function voteRecap(state, sourceBundle) {
  const n = state?.negotiation;
  if (state?.phase !== 'negotiation' || !n?.history?.length) return null;
  const vote = n.history.at(-1), lastCommand = state.commandLog?.at(-1)?.type;
  if (vote.invested !== false || ![1, 2].includes(vote.ballot)) return null;
  const {yes, no, abstain} = vote.totals || {};
  if (![yes, no, abstain].every(value => Number.isSafeInteger(value) && value >= 0)) return null;
  if (yes + no + abstain < 1 || (vote.ballot === 1 ? yes >= 176 : yes > no)) return null;

  const same = n.proponent === vote.proponent && n.ballot === 2 && vote.ballot === 1;
  const advanced = n.proponent !== vote.proponent && n.ballot === 1 && vote.ballot === 2;
  const fresh = lastCommand === 'VOTE';
  // After a revision the first ballot remains useful historical context; after
  // proposing a different agreement the previous candidate's banner is stale.
  if ((!same && !advanced) || (!fresh && !(same && lastCommand === 'REVISE_OFFER'))) return null;

  const bundle = resolveCampaignBundle(sourceBundle, state);
  const name = id => bundle.config.parties.find(p => p.id === id)?.name;
  const proponentName = name(vote.proponent), currentName = name(n.proponent);
  if (!proponentName || !currentName) return null;
  const margin = vote.ballot === 1 ? yes - 176 : yes - no;
  // Arithmetic distance only, keeping the recorded noes fixed; it does not
  // predict how switching a vote or changing an agreement would affect totals.
  const yesGapWithNoFixed = vote.ballot === 1 ? 176 - yes : no - yes + 1;
  const rule = vote.ballot === 1
    ? {kind: 'absolute', threshold: 176, margin, yesGapWithNoFixed, text: 'Primera votación: al menos 176 síes.'}
    : {kind: 'simple', threshold: null, margin, yesGapWithNoFixed, text: 'Segunda votación: más síes que noes; el empate no basta.'};
  const title = same ? `${proponentName}: la primera votación no alcanza 176`
    : `${proponentName}: la segunda votación no logra la investidura`;
  const summary = `${yes} síes · ${no} noes · ${abstain} abstenciones.`;
  const context = same
    ? {kind: 'second-ballot', proponent: n.proponent, proponentName: currentName, ballot: 2,
      text: fresh ? 'La siguiente votación exige más síes que noes. La propuesta sigue en juego.'
        : 'Este resultado corresponde a la primera votación. Ahora se votará el acuerdo actual: bastan más síes que noes.'}
    : {kind: 'next-proponent', proponent: n.proponent, proponentName: currentName, ballot: 1,
      text: `Ahora ${currentName} presenta su acuerdo.`};
  return {kind: context.kind, fresh, proponent: vote.proponent, proponentName,
    ballot: vote.ballot, totals: {yes, no, abstain}, rule, title, summary, context};
}
