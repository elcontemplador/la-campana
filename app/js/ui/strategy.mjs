// Only published information enters these presentation helpers.
export function canCampaignHere(bundle, provinceId) {
  const player = bundle.config.parties.find(party => party.id === 'P1');
  return !!player && (player.eligibility === 'all' || player.eligibility.includes(provinceId));
}

export function campaignDestinations(bundle) {
  return bundle.provinces.districts.filter(district => canCampaignHere(bundle, district.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function campaignRanking(poll, parties) {
  return parties.map((party, index) => {
    const projection = poll?.projection?.[party.id];
    const national = poll?.national?.[party.id];
    return {
      partyId: party.id,
      projection: projection || null,
      national: national || null,
      median: Number.isFinite(projection?.median) ? projection.median : null,
      center: Number.isFinite(national?.center) ? national.center : null,
      index,
    };
  }).sort((a, b) => (b.median ?? -1) - (a.median ?? -1)
    || (b.center ?? -1) - (a.center ?? -1) || a.index - b.index)
    .map((row, index) => ({...row, rank: index + 1}));
}

export function provinceShortlist(poll, districts, limit = 3) {
  const candidates = [];
  for (const district of districts) {
    const opportunity = poll?.districts?.[district.id]?.opportunity;
    if (!opportunity?.present || opportunity.player !== 'P1'||poll?.districts?.[district.id]?.campaignReachAtLimit) continue;
    for (const kind of ['attack', 'defense']) {
      const margin = opportunity[kind];
      const votes = Number(kind === 'attack' ? margin?.votesNeeded : margin?.votesMargin);
      if (!margin || !Number.isFinite(votes) || votes < 0) continue;
      candidates.push({provinceId: district.id, provinceName: district.name,
        kind, votes, against: margin.against, seats: opportunity.seats});
    }
  }
  candidates.sort((a, b) => a.votes - b.votes
    || (a.kind === 'defense' ? 0 : 1) - (b.kind === 'defense' ? 0 : 1)
    || a.provinceName.localeCompare(b.provinceName, 'es'));
  const selected = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.provinceId)) continue;
    selected.push(candidate);
    seen.add(candidate.provinceId);
    if (selected.length >= Math.max(0, Math.min(3, limit))) break;
  }
  return Math.max(0, Math.min(3, limit)) ? selected : [];
}

export function suggestedVisit(poll, bundle, startingProvince) {
  const electorate=bundle.config.electorate;
  return campaignDestinations(bundle).filter(district=>district.id!==startingProvince).map(district=>{
    const opportunity=poll?.districts?.[district.id]?.opportunity;
    const needed=opportunity?.attack?.votesNeeded;
    if(!opportunity?.present||!Number.isFinite(needed)||needed<0||poll?.districts?.[district.id]?.campaignReachAtLimit)return null;
    const cast=Math.floor(district.seats*electorate.perSeat*electorate.turnoutPermille/1000);
    const candidateVotes=cast-Math.floor(cast*electorate.blankPermilleOfCast/1000)-Math.floor(cast*electorate.invalidPermilleOfCast/1000);
    return {provinceId:district.id,votesNeeded:needed,score:district.seats/(1+needed/Math.max(1,candidateVotes)*100)};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.votesNeeded-b.votesNeeded||a.provinceId.localeCompare(b.provinceId))[0]||null;
}
