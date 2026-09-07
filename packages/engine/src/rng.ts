/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * The generator state lives inside GameState, so a game replays exactly from
 * its seed plus its action log. Nothing in the engine calls Math.random.
 */

export interface RngState {
  /** 32-bit internal state. */
  s: number;
}

/** Derive an initial generator state from an arbitrary string seed (FNV-1a). */
export function seedRng(seed: string): RngState {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return { s: h >>> 0 };
}

/** Advance the generator, returning the next state and a float in [0, 1). */
export function nextFloat(state: RngState): { state: RngState; value: number } {
  let t = (state.s + 0x6d2b79f5) >>> 0;
  const next: RngState = { s: t };
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: next, value };
}

/** Integer in [min, max] inclusive. */
export function nextInt(state: RngState, min: number, max: number): { state: RngState; value: number } {
  const r = nextFloat(state);
  return { state: r.state, value: min + Math.floor(r.value * (max - min + 1)) };
}

/** Fisher-Yates shuffle driven by the same generator. */
export function shuffle<T>(state: RngState, items: readonly T[]): { state: RngState; value: T[] } {
  const out = [...items];
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextInt(s, 0, i);
    s = r.state;
    const a = out[i] as T;
    const b = out[r.value] as T;
    out[i] = b;
    out[r.value] = a;
  }
  return { state: s, value: out };
}
