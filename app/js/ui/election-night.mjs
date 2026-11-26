import {resolveCampaignBundle} from '../core/campaign.mjs';
import {canCampaignHere} from './strategy.mjs';

function leadingParties(votes) {
  const entries = Object.entries(votes);
  const highest = Math.max(0, ...entries.map(([, count]) => count));
  return entries.filter(([, count]) => highest > 0 && count === highest)
    .map(([id]) => id).sort();
}

function provincialReport(district, result, poll) {
  const forecast = poll?.opportunity;
  const projectedPlayerSeats = forecast?.player === 'P1' && forecast.present
    && Number.isInteger(forecast.seats) ? forecast.seats : null;
  const playerSeats = result.seatsByParty.P1 ?? 0;
  const leaders = leadingParties(result.partyVotes);
  const previousLeaders = leadingParties(Object.fromEntries(
    Object.entries(poll?.values ?? {}).map(([id, value]) => [id, value.center])));
  const holder = result.lastSeat?.holder;
  const challenger = result.lastSeat?.challenger;
  const margin = result.lastSeat?.votesNeeded;
  const hasContest = holder && challenger && holder !== challenger && Number.isInteger(margin) && margin > 0;
  return {
    provinceId: district.id, provinceName: district.name, seats: district.seats,
    playerSeats, projectedPlayerSeats, change: projectedPlayerSeats === null ? null : playerSeats - projectedPlayerSeats,
    leader: leaders[0] ?? null, leaders, previousLeader: previousLeaders[0] ?? null,
    leaderChanged: leaders.length === 1 && previousLeaders.length === 1 && leaders[0] !== previousLeaders[0],
    lastSeatHolder: holder ?? null, challenger: hasContest ? challenger : null,
    marginVotes: hasContest ? margin : null,
  };
}

function playerVisits(state) {
  const visits = new Map();
  for (const entry of state.timeline ?? []) {
    if (entry.kind !== 'plan' || entry.actionId !== 'visit' || entry.actorId !== 'candidate') continue;
    if (entry.partyId && entry.partyId !== 'P1') continue;
    if (!Number.isInteger(entry.turn) || entry.turn < 1 || entry.turn > state.turn) continue;
    const previous = visits.get(entry.target);
    visits.set(entry.target, {count: (previous?.count ?? 0) + 1, lastTurn: Math.max(previous?.lastTurn ?? 0, entry.turn)});
  }
  return visits;
}

function chooseStops(contestants, state) {
  const visits = playerVisits(state);
  const mostVisited = [...contestants].filter(row => visits.has(row.provinceId)).sort((a, b) => {
    const first = visits.get(a.provinceId), second = visits.get(b.provinceId);
    return second.count - first.count || second.lastTurn - first.lastTurn;
  })[0];
  const start = state.initialSetup?.province;
  const first = mostVisited ?? contestants.find(row => row.provinceId === start) ?? contestants[0];
  if (!first) return [];
  const stops = [{...first, beat: 'campaign', visit: visits.get(first.provinceId) ?? null, isStart: first.provinceId === start}];
  const remaining = contestants.filter(row => row !== first);
  const involvesPlayer = row => row.lastSeatHolder === 'P1' || row.challenger === 'P1';
  const duel = [...remaining].filter(row => row.marginVotes !== null).sort((a, b) =>
    Number(involvesPlayer(b)) - Number(involvesPlayer(a)) || a.marginVotes - b.marginVotes)[0];
  if (duel) stops.push({...duel, beat: 'duel'});
  const surprise = remaining.filter(row => row !== duel).sort((a, b) =>
    Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0) || Number(b.leaderChanged) - Number(a.leaderChanged)
    || b.seats - a.seats)[0];
  if (surprise) stops.push({...surprise, beat: 'poll'});
  return stops;
}

// Each bulletin counts whole, disjoint returns. Only published bulletins feed the
// partial standings. Leave one unreported player district for the Congress screen.
export function electionRevealSteps(state, sourceBundle, {limit = 3} = {}) {
  const result = state?.electionResult ?? state?.election ?? state?.result;
  if (!result?.districts || limit <= 0) return [];
  const bundle = resolveCampaignBundle(sourceBundle, state);
  const districts = bundle.provinces.districts.filter(d => result.districts[d.id]);
  const contestants = districts.filter(d => canCampaignHere(bundle, d.id)).map(d =>
    provincialReport(d, result.districts[d.id], state.publishedPolls?.P1?.districts?.[d.id]));
  const stops = chooseStops(contestants, state);
  const selected = new Set(stops.map(row => row.provinceId));
  const other = districts.filter(d => !selected.has(d.id)).sort((a, b) => a.seats - b.seats || a.id.localeCompare(b.id));
  const last = other.findLast(d => canCampaignHere(bundle, d.id)) ?? other.at(-1);
  const queue = other.filter(d => d !== last).map(d => d.id);
  const counted = [];
  const tally = Object.fromEntries(bundle.config.parties.map(party => [party.id, 0]));
  const totalSeats = districts.reduce((sum, district) => sum + district.seats, 0);

  return stops.slice(0, limit).map((stop, index) => {
    let batch = [];
    if (index > 0) {
      const middle = Math.max(0, Math.ceil(districts.length / 2) - counted.length - 1);
      batch = queue.splice(0, index === stops.length - 1 ? queue.length : middle);
    }
    batch.push(stop.provinceId);
    for (const districtId of batch) {
      counted.push(districtId);
      for (const [id, seats] of Object.entries(result.districts[districtId].seatsByParty)) tally[id] += seats;
    }
    const lastPending = last && counted.length === districts.length - 1 ? {name: last.name, seats: last.seats} : null;
    return {...stop, partial: {
      districts: [...counted], districtCount: districts.length, seatsByParty: {...tally},
      seats: Object.values(tally).reduce((sum, seats) => sum + seats, 0), totalSeats, lastPending,
    }};
  });
}

const number = new Intl.NumberFormat('es-ES', {useGrouping: 'always'});
const seatCount = value => value === 1 ? 'un escaño' : `${number.format(value)} escaños`;

// The catalogue keeps the full official names for tables and the ballot.
export function electionPlaceName(name) {
  return name.split('/')[0].replace(/^(.+) \(([^)]+)\)$/u, '$2 $1');
}

export function electionBulletin(step, parties) {
  const party = id => parties.find(item => item.id === id)?.name.replace(/^Partido /u, '') ?? id;
  const place = electionPlaceName(step.provinceName);
  let title = step.playerSeats ? `${place} te da ${seatCount(step.playerSeats)}` : `Te quedas sin escaño en ${place}`;
  let story = '';
  if (step.beat === 'campaign') {
    if (step.visit?.count === 1) story = `Visitaste ${place} en el turno ${step.visit.lastTurn}.`;
    else if (step.visit) story = `Hiciste ${step.visit.count} visitas a ${place}. La última fue en el turno ${step.visit.lastTurn}.`;
    else if (step.isStart) story = 'Aquí empezaste tu campaña.';
  } else if (step.beat === 'duel') {
    if (step.lastSeatHolder === 'P1') title = `Te llevas el último escaño de ${place}`;
    else if (step.challenger === 'P1') title = `Se te escapa el último escaño de ${place}`;
    else title = `${party(step.lastSeatHolder)} se lleva el último escaño de ${place}`;
    const extra = step.marginVotes === 1 ? 'un voto más' : `${number.format(step.marginVotes)} votos más`;
    const rival = step.lastSeatHolder === 'P1' ? 'nos habría adelantado' : `habría adelantado a ${party(step.lastSeatHolder)}`;
    story = step.challenger === 'P1'
      ? `Con ${extra} habríamos adelantado a ${party(step.lastSeatHolder)} si los demás votos seguían igual.`
      : `Con ${extra}, ${party(step.challenger)} ${rival} si los demás votos seguían igual.`;
  } else if (step.change) {
    const direction = step.change > 0 ? 'más' : 'menos';
    title = `${seatCount(Math.abs(step.change))} ${direction} de lo previsto en ${place}`;
    title = title.charAt(0).toUpperCase() + title.slice(1);
  } else if (step.leaderChanged) {
    title = `${party(step.leader)} acaba por delante de ${party(step.previousLeader)} en ${place}`;
    story = `El último sondeo situaba a ${party(step.previousLeader)} en cabeza por votos.`;
  }
  return {title, story};
}

export function congressBulletin(seatsByParty, parties) {
  const own = seatsByParty.P1 ?? 0;
  const leaders = leadingParties(seatsByParty);
  const first = seatsByParty[leaders[0]] ?? 0;
  const names = leaders.map(id => parties.find(p => p.id === id)?.name.replace(/^Partido /u, '') ?? id);
  const subject = new Intl.ListFormat('es').format(names);
  let title = own ? `Tu candidatura obtiene ${seatCount(own)}` : 'Tu candidatura se queda sin escaños';
  if (own >= 176) {
    return {title: `Mayoría absoluta con ${seatCount(own)}`, story: 'Tu grupo tiene los votos necesarios para investir a tu candidato en la primera votación.'};
  }
  if (leaders.includes('P1')) {
    title = leaders.length === 1 ? `Tu partido encabeza el Congreso con ${seatCount(own)}` : `Empatas en cabeza con ${seatCount(own)}`;
  }
  if (first >= 176) return {title, story: `${subject} suma ${seatCount(first)} y alcanza la mayoría absoluta. Ahora se vota la investidura.`};
  if (leaders.length > 1) return {title, story: `${subject} empatan a ${number.format(first)} escaños. La primera votación necesita 176 síes.`};
  if (leaders[0] === 'P1') {
    const needed = 176 - own;
    return {title, story: `Si tus diputados votan sí, necesitas ${needed === 1 ? 'un voto más' : needed + ' votos más'} para ganar la primera votación.`};
  }
  return {title, story: `${subject} es el primer grupo, con ${seatCount(first)}. Ninguna candidatura llega por sí sola a los 176 escaños.`};
}
