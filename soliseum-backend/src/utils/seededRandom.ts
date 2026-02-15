/**
 * Shared seeded pseudo-random number generator.
 * Uses sin-based hash for deterministic output from a numeric seed.
 * NOT cryptographically secure — for game simulation only.
 */

export function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}
