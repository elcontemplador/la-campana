import {resolveCampaignBundle} from '../core/campaign.mjs';
import {present} from '../core/utils.mjs';

function shareFrom(value) {
  if (!value || !Number.isInteger(value.center) || value.center < 0 || value.center > 10000
    || !Number.isInteger(value.low) || !Number.isInteger(value.high)
    || value.low < 0 || value.high > 100 || value.low > value.high
    || value.center / 100 < value.low || value.center / 100 > value.high) return null;
  // Published centers use basis points; all three returned values use percent.
  return {center: value.center / 100, low: value.low, high: value.high};
}

// A view of the player's published provincial poll, including during election.
// Never substitute the frozen count: the UI may still be revealing that result.
export function provinceContest(state, sourceBundle, provinceId) {
  if (!state || typeof provinceId !== 'string'
    || !['rulesVersion', 'contentVersion', 'scenarioId', 'bundleChecksum']
      .every(key => typeof state[key] === 'string' && state[key])) return null;
  let bundle;
  try { bundle = resolveCampaignBundle(sourceBundle, state); }
  catch { return null; }
  const district = bundle.provinces.districts.find(d => d.id === provinceId);
  if (!district) return null;
  const publication = state.publishedPolls?.P1;
  if (!Number.isInteger(publication?.turn) || publication.turn < 0
    || !Number.isInteger(state.turn) || publication.turn > state.turn) return null;
  const poll = publication.districts?.[district.id];
  if (!poll?.values || typeof poll.values !== 'object') return null;
  const parties = bundle.config.parties.map(p => {
    const eligible = present(p, district.id);
    return {id: p.id, identityId: p.identityId ?? null, name: p.name,
      shortName: p.short || p.shortName || p.abbreviation || p.name,
      color: p.color, present: eligible,
      share: eligible ? shareFrom(poll.values[p.id]) : null};
  });
  if (!parties.some(p => p.share)) return null;
  const byId = new Map(parties.map(p => [p.id, p]));
  const raw = poll.lastSeat;
  let lastSeat = null;
  const holder = byId.get(raw?.holder), challenger = byId.get(raw?.challenger);
  if (raw?.estimated === true && holder?.present && holder.share?.center > 0
    && (raw.challenger === null && raw.votesNeeded === 0
      || challenger?.present && challenger.share?.center > 0 && challenger.id !== holder.id
        && Number.isSafeInteger(raw.votesNeeded) && raw.votesNeeded > 0)) {
    lastSeat = {holder: holder.id, holderName: holder.name,
      challenger: challenger?.id ?? null, challengerName: challenger?.name ?? null,
      votesNeeded: raw.votesNeeded, estimated: true, basis: 'additional_challenger_votes'};
  }
  const summary = lastSeat
    ? `${lastSeat.holderName} tiene el último escaño del sondeo${lastSeat.challengerName
      ? `; lo disputa ${lastSeat.challengerName}` : ''}.`
    : 'El sondeo muestra el apoyo a cada partido.';
  return {provinceId: district.id, provinceName: district.name, totalSeats: district.seats,
    source: 'published_poll', turn: publication.turn, estimated: true,
    parties, lastSeat, summary,
    note: publication.turn === 0 ? 'Sondeo inicial; puede cambiar.'
      : publication.turn === state.turn ? 'Sondeo actual; puede cambiar.'
      : `Sondeo del turno ${publication.turn}; puede cambiar.`};
}
