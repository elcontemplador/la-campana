/**
 * Reparto electoral puro. Los votos sintéticos se cierran fuera de este módulo.
 * Contrato institucional: docs/03_REGLAS_INSTITUCIONALES.md (v1.0).
 * Productos cruzados exactos: Number cuando todos caben en su rango seguro;
 * BigInt para cifras mayores. La función no consume azar.
 */

const MAX_SEATS = 350;
const MAX_COUNT = BigInt(Number.MAX_SAFE_INTEGER);
const PARTY_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const FORBIDDEN_IDS = new Set(['constructor', 'prototype', '__proto__']);

const failure = (error) => ({ ok: false, error });
const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const isRecord = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function equalOrderMembers(order, members) {
  return Array.isArray(order)
    && order.length === members.length
    && new Set(order).size === order.length
    && order.every((id) => typeof id === 'string' && members.includes(id));
}

/**
 * @param {object} input
 * @returns {{ok: boolean, error?: string, validVotes?: number, castVotes?: number,
 * eligible?: string[], seatsByParty?: object, seatOrder?: string[], conventions?: string[]}}
 */
export function allocateSeats(input) {
  return allocateSeatsInternal(input, false);
}

// Una única implementación; este punto permite contrastar la optimización
// contra el camino exacto de BigInt en las pruebas, sin otro asignador.
export const electoralTestHooks = Object.freeze({
  allocateSeatsBigInt: (input) => allocateSeatsInternal(input, true),
});

function allocateSeatsInternal(input, forceBigInt) {
  if (!isRecord(input)) return failure('INVALID_ALLOCATION_INPUT');
  const { method, seats, partyVotes, blankVotes, invalidVotes } = input;
  if (method !== 'dhondt' && method !== 'single_member') return failure('INVALID_ELECTORAL_METHOD');
  if (!Number.isSafeInteger(seats) || seats < 1 || seats > MAX_SEATS
    || (method === 'single_member' && seats !== 1)) return failure('INVALID_SEAT_COUNT');
  if (!isRecord(partyVotes)) return failure('INVALID_PARTY_VOTES');
  if (!isCount(blankVotes) || !isCount(invalidVotes)) return failure('INVALID_VOTE_COUNT');

  const ids = Object.keys(partyVotes).sort(compareIds);
  let candidateVotes = 0n;
  for (const id of ids) {
    if (!PARTY_ID.test(id) || FORBIDDEN_IDS.has(id)) return failure('INVALID_PARTY_ID');
    if (!isCount(partyVotes[id])) return failure('INVALID_VOTE_COUNT');
    candidateVotes += BigInt(partyVotes[id]);
  }
  const valid = candidateVotes + BigInt(blankVotes);
  const cast = valid + BigInt(invalidVotes);
  if (cast > MAX_COUNT) return failure('INVALID_VOTE_COUNT');
  if (valid === 0n) return failure('NO_VALID_VOTES');

  const eligible = ids.filter((id) => partyVotes[id] > 0
    && (method === 'single_member' || 100n * BigInt(partyVotes[id]) >= 3n * valid));
  if (eligible.length === 0) {
    return failure(method === 'single_member' ? 'NO_CANDIDATE_VOTES' : 'NO_ELIGIBLE_LISTS');
  }

  const tieOrders = input.tieOrders === undefined ? {} : input.tieOrders;
  if (!isRecord(tieOrders)) return failure('INVALID_TIE_ORDER');
  const voteGroups = new Map();
  for (const id of ids.filter((id) => partyVotes[id] > 0)) {
    const key = String(partyVotes[id]);
    if (!voteGroups.has(key)) voteGroups.set(key, []);
    voteGroups.get(key).push(id);
  }
  // Un sorteo registrado ha de describir exactamente el grupo correspondiente.
  // Los sorteos no necesarios pueden omitirse; nunca se usa el orden del JSON.
  for (const key of Object.keys(tieOrders)) {
    const members = voteGroups.get(key);
    if (!members || members.length < 2 || !equalOrderMembers(tieOrders[key], members)) {
      return failure('INVALID_TIE_ORDER');
    }
  }

  const seatsByParty = Object.fromEntries(ids.map((id) => [id, 0]));
  const conventions = [];
  const seatOrder = [];

  if (method === 'single_member') {
    const maxVotes = eligible.reduce((max, id) => Math.max(max, partyVotes[id]), 0);
    const leaders = eligible.filter((id) => partyVotes[id] === maxVotes);
    let winner = leaders[0];
    if (leaders.length > 1) {
      const order = tieOrders[String(maxVotes)];
      if (order === undefined) return failure('TIE_DRAW_REQUIRED');
      winner = order[0];
      conventions.push('SINGLE_MEMBER_TIE_CONVENTION');
    }
    seatOrder.push(winner);
    seatsByParty[winner] = 1;
  } else {
    const maxVotes = eligible.reduce((max, id) => Math.max(max, partyVotes[id]), 0);
    const useNumbers = !forceBigInt && BigInt(maxVotes) * BigInt(seats) <= MAX_COUNT;
    const quotients = [];
    for (const id of eligible) {
      const votes = useNumbers ? partyVotes[id] : BigInt(partyVotes[id]);
      for (let divisor = 1; divisor <= seats; divisor += 1) {
        quotients.push({ id, votes, divisor: useNumbers ? divisor : BigInt(divisor) });
      }
    }
    quotients.sort((a, b) => {
      const left = a.votes * b.divisor;
      const right = b.votes * a.divisor;
      if (left !== right) return left > right ? -1 : 1;
      if (a.votes !== b.votes) return a.votes > b.votes ? -1 : 1;
      return compareIds(a.id, b.id);
    });

    const blockIndices = new Map();
    let index = 0;
    while (seatOrder.length < seats) {
      const first = quotients[index];
      const block = [first];
      index += 1;
      // Con votos originales iguales, cociente igual implica divisor igual.
      while (index < quotients.length && quotients[index].votes === first.votes
        && quotients[index].divisor === first.divisor) {
        block.push(quotients[index]);
        index += 1;
      }
      let orderedIds = [first.id];
      if (block.length > 1) {
        const key = String(first.votes);
        const initialOrder = tieOrders[key];
        if (initialOrder === undefined) return failure('TIE_DRAW_REQUIRED');
        const blockIndex = blockIndices.get(key) ?? 0;
        const offset = blockIndex % initialOrder.length;
        orderedIds = initialOrder.slice(offset).concat(initialOrder.slice(0, offset));
        // Se consume el bloque completo, aunque el último escaño corte el bloque.
        blockIndices.set(key, blockIndex + 1);
        if (block.length > 2 && !conventions.includes('MULTIWAY_TIE_CONVENTION')) {
          conventions.push('MULTIWAY_TIE_CONVENTION');
        }
      }
      for (const id of orderedIds) {
        if (seatOrder.length === seats) break;
        seatOrder.push(id);
        seatsByParty[id] += 1;
      }
    }
  }

  return {
    ok: true,
    validVotes: Number(valid),
    castVotes: Number(cast),
    eligible,
    seatsByParty,
    seatOrder,
    conventions,
  };
}

/** Investidura simplificada: 350 diputados presentes, dos votaciones distintas. */
export function evaluateInvestiture(input) {
  if (!isRecord(input)) return failure('INVALID_INVESTITURE_INPUT');
  const { round, yes, no, abstain, firstRoundFailed } = input;
  if (round !== 1 && round !== 2) return failure('INVALID_INVESTITURE_ROUND');
  if (![yes, no, abstain].every(isCount)) return failure('INVALID_INVESTITURE_COUNT');
  if (BigInt(yes) + BigInt(no) + BigInt(abstain) !== 350n) {
    return failure('INVALID_INVESTITURE_TOTAL');
  }
  if (typeof firstRoundFailed !== 'boolean'
    || (round === 2 && !firstRoundFailed)
    || (round === 1 && firstRoundFailed)) return failure('INVALID_INVESTITURE_TRANSITION');
  return {
    ok: true,
    invested: round === 1 ? yes >= 176 : yes > no,
    round,
    yes,
    no,
    abstain,
    majority: round === 1 ? 'absolute' : 'simple',
  };
}
