/**
 * Deterministic JSON serialisation (object keys sorted recursively) so the
 * same logical event always produces the same byte string to sign/verify,
 * regardless of the order fields were assembled in. Without this, a NASH
 * signature computed over `JSON.stringify(obj)` would be unverifiable
 * against a structurally-identical object whose keys happen to have been
 * inserted in a different order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      out[k] = sortKeysDeep(v);
    }
    return out;
  }
  return value;
}
