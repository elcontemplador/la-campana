import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allocateSeats, evaluateInvestiture, electoralTestHooks } from '../app/js/core/electoral.mjs';

const fixtures = JSON.parse(readFileSync(new URL('../data/electoral_fixtures.json', import.meta.url), 'utf8'));

function assertFixture(result, expected) {
  assert.equal(result.ok, expected.error === undefined);
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(result[key], value, key);
  }
}

for (const fixture of fixtures.allocationCases) {
  test(`reparto: ${fixture.name}`, () => {
    assertFixture(allocateSeats(fixture.input), fixture.expected);
  });
}

for (const fixture of fixtures.investitureCases) {
  test(`investidura: ${fixture.name}`, () => {
    assertFixture(evaluateInvestiture(fixture.input), fixture.expected);
  });
}

test('permutar candidaturas y claves de sorteos conserva todos los resultados', () => {
  for (const fixture of fixtures.allocationCases) {
    const reversed = {
      ...fixture.input,
      partyVotes: Object.fromEntries(Object.entries(fixture.input.partyVotes).reverse()),
      tieOrders: Object.fromEntries(Object.entries(fixture.input.tieOrders).reverse()),
    };
    assert.deepEqual(allocateSeats(reversed), allocateSeats(fixture.input), fixture.name);
  }
});

test('reparto e investidura no modifican entradas congeladas', () => {
  for (const fixture of fixtures.allocationCases) {
    const input = structuredClone(fixture.input);
    Object.freeze(input.partyVotes);
    for (const order of Object.values(input.tieOrders)) Object.freeze(order);
    Object.freeze(input.tieOrders);
    Object.freeze(input);
    assertFixture(allocateSeats(input), fixture.expected);
  }
  for (const fixture of fixtures.investitureCases) {
    assertFixture(evaluateInvestiture(Object.freeze(structuredClone(fixture.input))), fixture.expected);
  }
});

test('D’Hondt conserva escaños incluso cuando dos fracciones se redondearían igual', () => {
  const unit = (BigInt(Number.MAX_SAFE_INTEGER) - 2n) / 349n;
  const result = allocateSeats({
    method: 'dhondt', seats: 348,
    partyVotes: { A: Number(174n * unit + 1n), B: Number(175n * unit + 1n) },
    blankVotes: 0, invalidVotes: 0, tieOrders: {},
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.seatsByParty, { A: 174, B: 174 });
  assert.equal(result.seatOrder.at(-1), 'A');
  assert.equal(result.seatOrder.length, 348);
});

test('las listas excluidas permanecen en el denominador del umbral', () => {
  const result = allocateSeats({
    method: 'dhondt', seats: 37,
    partyVotes: { A: 96999, B: 3000, C: 2 }, blankVotes: 0, invalidVotes: 0,
  });
  assert.equal(result.ok, true);
  assert.equal(result.validVotes, 100001);
  assert.deepEqual(result.eligible, ['A']);
  assert.deepEqual(result.seatsByParty, { A: 37, B: 0, C: 0 });
});

test('los índices de alternancia son independientes para cada grupo de votos', () => {
  const result = allocateSeats({
    method: 'dhondt', seats: 12,
    partyVotes: { D: 50, B: 100, C: 50, A: 100 }, blankVotes: 0, invalidVotes: 0,
    tieOrders: { 50: ['C', 'D'], 100: ['A', 'B'] },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.seatOrder, ['A', 'B', 'B', 'A', 'C', 'D', 'A', 'B', 'B', 'A', 'D', 'C']);
  assert.deepEqual(result.seatsByParty, { A: 4, B: 4, C: 2, D: 2 });
});

test('un sorteo de un empate por debajo del corte de escaños puede omitirse', () => {
  const result = allocateSeats({
    method: 'dhondt', seats: 1, partyVotes: { A: 1000, B: 100, C: 100 },
    blankVotes: 0, invalidVotes: 0,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.seatOrder, ['A']);
});

test('un sorteo válido para listas bajo el umbral puede registrarse sin alterar el reparto', () => {
  const result = allocateSeats({
    method: 'dhondt', seats: 2, partyVotes: { A: 1000, B: 1, C: 1 },
    blankVotes: 0, invalidVotes: 0, tieOrders: { 1: ['C', 'B'] },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.eligible, ['A']);
  assert.deepEqual(result.seatOrder, ['A', 'A']);
  assert.deepEqual(result.conventions, []);
});

const baseAllocation = () => ({
  method: 'dhondt', seats: 3, partyVotes: { A: 100, B: 50 },
  blankVotes: 0, invalidVotes: 0, tieOrders: {},
});

test('entradas defectuosas devuelven errores de reparto sin lanzar excepciones', () => {
  const cases = [
    [null, 'INVALID_ALLOCATION_INPUT'],
    [[], 'INVALID_ALLOCATION_INPUT'],
    [{ ...baseAllocation(), method: 'other' }, 'INVALID_ELECTORAL_METHOD'],
    [{ ...baseAllocation(), seats: 0 }, 'INVALID_SEAT_COUNT'],
    [{ ...baseAllocation(), seats: 351 }, 'INVALID_SEAT_COUNT'],
    [{ ...baseAllocation(), seats: 1.5 }, 'INVALID_SEAT_COUNT'],
    [{ ...baseAllocation(), method: 'single_member', seats: 3 }, 'INVALID_SEAT_COUNT'],
    [{ ...baseAllocation(), partyVotes: [] }, 'INVALID_PARTY_VOTES'],
    [{ ...baseAllocation(), partyVotes: { '': 100 } }, 'INVALID_PARTY_ID'],
    [{ ...baseAllocation(), partyVotes: { constructor: 100 } }, 'INVALID_PARTY_ID'],
    [{ ...baseAllocation(), partyVotes: { 'A B': 100 } }, 'INVALID_PARTY_ID'],
    [{ ...baseAllocation(), partyVotes: { A: 2.5 } }, 'INVALID_VOTE_COUNT'],
    [{ ...baseAllocation(), partyVotes: { A: NaN } }, 'INVALID_VOTE_COUNT'],
    [{ ...baseAllocation(), blankVotes: -1 }, 'INVALID_VOTE_COUNT'],
    [{ ...baseAllocation(), invalidVotes: '10' }, 'INVALID_VOTE_COUNT'],
    [{ ...baseAllocation(), partyVotes: { A: Number.MAX_SAFE_INTEGER, B: 1 } }, 'INVALID_VOTE_COUNT'],
    [{ ...baseAllocation(), partyVotes: { A: Number.MAX_SAFE_INTEGER }, invalidVotes: 1 }, 'INVALID_VOTE_COUNT'],
    [{ ...baseAllocation(), tieOrders: null }, 'INVALID_TIE_ORDER'],
    [{ ...baseAllocation(), tieOrders: { 100: ['A', 'B'] } }, 'INVALID_TIE_ORDER'],
    [{ ...baseAllocation(), partyVotes: { A: 100, B: 100 }, tieOrders: { 100: ['A', 'B', 'C'] } }, 'INVALID_TIE_ORDER'],
    [{ ...baseAllocation(), partyVotes: { A: 100, B: 100 }, tieOrders: { '100.0': ['A', 'B'] } }, 'INVALID_TIE_ORDER'],
    [{ ...baseAllocation(), method: 'single_member', seats: 1, partyVotes: { A: 0 }, blankVotes: 100 }, 'NO_CANDIDATE_VOTES'],
  ];
  for (const [input, code] of cases) assert.deepEqual(allocateSeats(input), { ok: false, error: code });
});

test('la cifra máxima segura es aceptable cuando el total es exacto', () => {
  const result = allocateSeats({
    method: 'dhondt', seats: 2, partyVotes: { A: Number.MAX_SAFE_INTEGER },
    blankVotes: 0, invalidVotes: 0,
  });
  assert.equal(result.ok, true);
  assert.equal(result.castVotes, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(result.seatsByParty, { A: 2 });
});

test('la investidura rechaza recuentos o transiciones imposibles', () => {
  const base = { round: 1, yes: 176, no: 174, abstain: 0, firstRoundFailed: false };
  const cases = [
    [null, 'INVALID_INVESTITURE_INPUT'],
    [{ ...base, round: 0 }, 'INVALID_INVESTITURE_ROUND'],
    [{ ...base, round: '1' }, 'INVALID_INVESTITURE_ROUND'],
    [{ ...base, yes: 176.5 }, 'INVALID_INVESTITURE_COUNT'],
    [{ ...base, abstain: -1 }, 'INVALID_INVESTITURE_COUNT'],
    [{ ...base, no: Infinity }, 'INVALID_INVESTITURE_COUNT'],
    [{ ...base, yes: 175 }, 'INVALID_INVESTITURE_TOTAL'],
    [{ ...base, firstRoundFailed: true }, 'INVALID_INVESTITURE_TRANSITION'],
    [{ ...base, firstRoundFailed: undefined }, 'INVALID_INVESTITURE_TRANSITION'],
  ];
  for (const [input, code] of cases) assert.deepEqual(evaluateInvestiture(input), { ok: false, error: code });
});

test('1000 repartos sintéticos reproducibles coinciden con BigInt forzado', () => {
  let seed = 0x14D835A9;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  for (let index = 0; index < 1000; index += 1) {
    const count = 1 + random() % 8;
    const method = index % 17 === 0 ? 'single_member' : 'dhondt';
    const partyVotes = {};
    const duplicateCount = 1 + random() % 1000000;
    for (let party = 0; party < count; party += 1) {
      const votes = index % 13 === 0 ? duplicateCount : random() % 1000000;
      // Una muestra de casos altos fuerza el camino BigInt real.
      partyVotes[`P${party}`] = index % 29 === 0 ? votes * 1000000000 : votes;
    }
    const groups = new Map();
    for (const [id, votes] of Object.entries(partyVotes)) {
      if (votes === 0) continue;
      if (!groups.has(votes)) groups.set(votes, []);
      groups.get(votes).push(id);
    }
    const tieOrders = {};
    for (const [votes, ids] of groups) {
      if (ids.length > 1) tieOrders[String(votes)] = random() % 2 ? ids : ids.toReversed();
    }
    const input = {
      method,
      seats: method === 'single_member' ? 1 : 1 + random() % 37,
      partyVotes,
      blankVotes: random() % 5000,
      invalidVotes: random() % 5000,
      tieOrders,
    };
    assert.deepEqual(allocateSeats(input), electoralTestHooks.allocateSeatsBigInt(input), `caso ${index}`);
  }
});
