// Deterministic PRNG (mulberry32) + string hashing. The core NEVER uses Math.random/Date.now:
// seeded randomness keeps the demo world, the simulator, and the bandit reproducible + auditable.

export type Rng = () => number; // uniform [0,1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit — stable string -> seed (for per-entity deterministic streams). */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Standard normal via Box-Muller. */
export function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Deterministic Beta(alpha, beta) sample via Jöhnk/gamma-free approximation for small params.
 *  Good enough for Thompson sampling in the demo; the Python service uses numpy's generator. */
export function betaSample(rng: Rng, alpha: number, beta: number): number {
  // Use the fact that Beta(a,b) = Ga/(Ga+Gb); approximate Gamma via Marsaglia-Tsang.
  const ga = gammaSample(rng, alpha);
  const gb = gammaSample(rng, beta);
  if (ga + gb === 0) return 0.5;
  return ga / (ga + gb);
}

function gammaSample(rng: Rng, shape: number): number {
  if (shape < 1) {
    const u = Math.max(rng(), 1e-12);
    return gammaSample(rng, shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 64; i++) {
    const x = gaussian(rng);
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = Math.max(rng(), 1e-12);
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
  return d; // deterministic fallback after bounded attempts
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
