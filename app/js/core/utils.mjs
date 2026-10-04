// Pure, versioned arithmetic shared by the simulation and its tests.
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const clone = value => structuredClone(value);
export const compareId = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function hashKey(namespace, seed, ...parts) {
  const bytes = new TextEncoder().encode(JSON.stringify([namespace, String(seed).normalize('NFC'),
    ...parts.map(p => String(p).normalize('NFC'))]));
  let h = 2166136261;
  for (const byte of bytes) h = Math.imul(h ^ byte, 16777619) >>> 0;
  return h;
}

export function randomInt(namespace, seed, parts, a, b) {
  return a + Math.floor(hashKey(namespace, seed, ...parts) / 4294967296 * (b - a + 1));
}

export function distribute(total, weights) {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Total no válido');
  const entries = Object.entries(weights).sort(([a], [b]) => compareId(a, b));
  if (!entries.length || entries.some(([, v]) => !Number.isSafeInteger(v) || v < 0)) {
    throw new Error('Pesos no válidos');
  }
  const sum = entries.reduce((s, [, v]) => s + BigInt(v), 0n);
  if (sum === 0n) throw new Error('No hay pesos positivos');
  const rows = entries.map(([id, value]) => {
    const product = BigInt(total) * BigInt(value);
    return {id, count: Number(product / sum), remainder: product % sum};
  });
  let remaining = total - rows.reduce((s, x) => s + x.count, 0);
  rows.sort((a, b) => a.remainder === b.remainder ? compareId(a.id, b.id)
    : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < remaining; i++) rows[i].count++;
  return Object.fromEntries(rows.sort((a, b) => compareId(a.id, b.id)).map(x => [x.id, x.count]));
}

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort(compareId).map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function checksum(value) {
  const text = canonical(value);
  let h = 2166136261;
  for (const byte of new TextEncoder().encode(text)) h = Math.imul(h ^ byte, 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function assertSafeTree(value, depth = 0) {
  if (depth > 40) throw new Error('El archivo tiene una estructura demasiado profunda');
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('El archivo contiene una clave no permitida');
      assertSafeTree(child, depth + 1);
    }
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Número no válido');
}

export function present(party, provinceId) {
  return party.eligibility === 'all' || party.eligibility.includes(provinceId);
}

export const distance = (a, b) => a.reduce((sum, n, i) => sum + Math.abs(n - b[i]), 0);

export function fail(code, message) {
  return {ok: false, error: {code, message}};
}
