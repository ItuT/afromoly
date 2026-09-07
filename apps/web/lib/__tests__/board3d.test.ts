import { describe, expect, it } from 'vitest';
import {
  CORNER,
  DEPTH,
  EDGE_WIDTH,
  HALF,
  buildingSpots,
  tileFootprint,
  tokenSpot,
} from '../board3d';

const ALL = Array.from({ length: 40 }, (_, i) => i);
const CORNERS = [0, 10, 20, 30];

/** Has the piece been pushed toward the middle of the board? */
function isInward(index: number, x: number, z: number): boolean {
  const t = tileFootprint(index);
  if (t.facing === 0) return z > t.z; // top row sits at negative z
  if (Math.abs(t.facing - Math.PI) < 1e-9) return z < t.z; // bottom row
  if (t.facing > 0) return x > t.x; // left column
  return x < t.x; // right column
}

/** Is (x, z) inside the tile, allowing a small margin for the piece itself? */
function within(index: number, x: number, z: number, margin = 0): boolean {
  const t = tileFootprint(index);
  return (
    Math.abs(x - t.x) <= t.width / 2 + margin &&
    Math.abs(z - t.z) <= t.depth / 2 + margin
  );
}

describe('board geometry', () => {
  it('places forty tiles inside the board', () => {
    for (const index of ALL) {
      const t = tileFootprint(index);
      expect(Math.abs(t.x) + t.width / 2).toBeLessThanOrEqual(HALF + 1e-9);
      expect(Math.abs(t.z) + t.depth / 2).toBeLessThanOrEqual(HALF + 1e-9);
    }
  });

  it('makes the four corners square and larger than an edge tile', () => {
    for (const index of CORNERS) {
      const t = tileFootprint(index);
      expect(t.width).toBeCloseTo(CORNER, 9);
      expect(t.depth).toBeCloseTo(CORNER, 9);
      expect(t.width).toBeGreaterThan(EDGE_WIDTH);
    }
  });

  it('gives every edge tile the same footprint', () => {
    for (const index of ALL) {
      if (CORNERS.includes(index)) continue;
      const t = tileFootprint(index);
      // The short side runs along the edge; the long side reaches into the board.
      expect(Math.min(t.width, t.depth)).toBeCloseTo(EDGE_WIDTH, 9);
      expect(Math.max(t.width, t.depth)).toBeCloseTo(DEPTH, 9);
    }
  });

  it('never overlaps two tiles', () => {
    for (let a = 0; a < 40; a++) {
      for (let b = a + 1; b < 40; b++) {
        const ta = tileFootprint(a);
        const tb = tileFootprint(b);
        const apart =
          Math.abs(ta.x - tb.x) >= (ta.width + tb.width) / 2 - 1e-9 ||
          Math.abs(ta.z - tb.z) >= (ta.depth + tb.depth) / 2 - 1e-9;
        expect(apart, `tiles ${a} and ${b} overlap`).toBe(true);
      }
    }
  });

  it('runs the spaces clockwise from Month-End Payday', () => {
    // Space 0 is bottom right, and the numbers climb along the bottom to the
    // left, exactly as they do on the printed board.
    expect(tileFootprint(0).x).toBeGreaterThan(0);
    expect(tileFootprint(0).z).toBeGreaterThan(0);
    expect(tileFootprint(5).x).toBeLessThan(tileFootprint(1).x);
    expect(tileFootprint(10).x).toBeLessThan(0);
    expect(tileFootprint(15).z).toBeLessThan(tileFootprint(11).z);
    expect(tileFootprint(20).z).toBeLessThan(0);
    expect(tileFootprint(25).x).toBeGreaterThan(tileFootprint(21).x);
    expect(tileFootprint(35).z).toBeGreaterThan(tileFootprint(31).z);
  });
});

describe('where the pieces stand', () => {
  it('keeps every token on its own tile, however many are sharing it', () => {
    for (const index of ALL) {
      for (const occupants of [1, 2, 3, 4, 5, 6]) {
        for (let seat = 0; seat < occupants; seat++) {
          const [x, , z] = tokenSpot(index, seat, occupants);
          expect(within(index, x, z), `token ${seat}/${occupants} left tile ${index}`).toBe(true);
        }
      }
    }
  });

  it('gives six tokens on one tile six distinct spots', () => {
    const spots = Array.from({ length: 6 }, (_, seat) => tokenSpot(0, seat, 6).join(','));
    expect(new Set(spots).size).toBe(6);
  });

  it('lines vans up along the street, on the inner half of the tile', () => {
    for (const index of ALL) {
      if (CORNERS.includes(index)) continue;
      const spots = buildingSpots(index, 4);
      expect(spots).toHaveLength(4);
      expect(new Set(spots.map((s) => s.join(','))).size).toBe(4);
      for (const [x, , z] of spots) {
        expect(within(index, x, z, 0.3), `van left tile ${index}`).toBe(true);
        expect(isInward(index, x, z), `van on tile ${index} sits on the outer edge`).toBe(true);
      }
    }
  });

  it('stands a single depot on the inner half too', () => {
    for (const index of ALL) {
      if (CORNERS.includes(index)) continue;
      const [spot] = buildingSpots(index, 1);
      expect(spot).toBeDefined();
      if (!spot) continue;
      expect(isInward(index, spot[0], spot[2]), `depot on tile ${index}`).toBe(true);
    }
  });
});
