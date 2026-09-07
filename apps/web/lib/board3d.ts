/**
 * The board's geometry in three.js space.
 *
 * These numbers mirror assets/blender/geometry.py exactly. Change one and you
 * must change the other, or tokens will stand beside their tiles rather than
 * on them. The Blender build exports with Y up, so a Blender (x, y) becomes a
 * three.js (x, -y) on the ground plane.
 */

export const HALF = 10;
export const CORNER = 2.6;
export const EDGE_WIDTH = (2 * HALF - 2 * CORNER) / 9;
export const DEPTH = CORNER;
export const TILE_TOP = 0.06;

export interface TileFootprint {
  x: number;
  z: number;
  width: number;
  depth: number;
  /** Y rotation that turns a piece to face the middle of the board. */
  facing: number;
}

const HALF_PI = Math.PI / 2;

/** Where a tile sits, in three.js coordinates with the board flat on XZ. */
export function tileFootprint(index: number): TileFootprint {
  if (index === 0) return corner(HALF - CORNER / 2, -HALF + CORNER / 2, Math.PI * 0.75);
  if (index === 10) return corner(-HALF + CORNER / 2, -HALF + CORNER / 2, Math.PI * 0.25);
  if (index === 20) return corner(-HALF + CORNER / 2, HALF - CORNER / 2, -Math.PI * 0.25);
  if (index === 30) return corner(HALF - CORNER / 2, HALF - CORNER / 2, -Math.PI * 0.75);

  if (index >= 1 && index <= 9) {
    const bx = HALF - CORNER - (index - 0.5) * EDGE_WIDTH;
    return { x: bx, z: HALF - DEPTH / 2, width: EDGE_WIDTH, depth: DEPTH, facing: Math.PI };
  }
  if (index >= 11 && index <= 19) {
    const by = -HALF + CORNER + (index - 10 - 0.5) * EDGE_WIDTH;
    return { x: -HALF + DEPTH / 2, z: -by, width: DEPTH, depth: EDGE_WIDTH, facing: HALF_PI };
  }
  if (index >= 21 && index <= 29) {
    const bx = -HALF + CORNER + (index - 20 - 0.5) * EDGE_WIDTH;
    return { x: bx, z: -HALF + DEPTH / 2, width: EDGE_WIDTH, depth: DEPTH, facing: 0 };
  }
  if (index >= 31 && index <= 39) {
    const by = HALF - CORNER - (index - 30 - 0.5) * EDGE_WIDTH;
    return { x: HALF - DEPTH / 2, z: -by, width: DEPTH, depth: EDGE_WIDTH, facing: -HALF_PI };
  }
  throw new Error(`No tile at index ${index}`);
}

function corner(bx: number, by: number, facing: number): TileFootprint {
  return { x: bx, z: -by, width: CORNER, depth: CORNER, facing };
}

/**
 * Where each token stands on a tile, so six pieces on Month-End Payday do not
 * occupy the same point. Seats are laid out on a small grid inside the tile.
 */
export function tokenSpot(index: number, seat: number, occupants: number): [number, number, number] {
  const tile = tileFootprint(index);
  if (occupants <= 1) return [tile.x, TILE_TOP, tile.z];
  const columns = occupants <= 4 ? 2 : 3;
  const rows = Math.ceil(occupants / columns);
  const column = seat % columns;
  const row = Math.floor(seat / columns);
  const stepX = (tile.width * 0.52) / columns;
  const stepZ = (tile.depth * 0.52) / rows;
  const offsetX = (column - (columns - 1) / 2) * stepX;
  const offsetZ = (row - (rows - 1) / 2) * stepZ;
  return [tile.x + offsetX, TILE_TOP, tile.z + offsetZ];
}

/** Where the vans or the depot stand on a developed street. */
export function buildingSpots(index: number, count: number): [number, number, number][] {
  const tile = tileFootprint(index);
  // Vans line up along the street, which is the tile's short axis: an edge
  // tile is narrow along the run of the board and deep into it.
  const along = tile.width < tile.depth ? 'x' : 'z';
  const span = Math.min(tile.width, tile.depth);
  const step = (span * 0.66) / Math.max(count, 1);
  const inward = 0.62;
  return Array.from({ length: count }, (_, i) => {
    const offset = (i - (count - 1) / 2) * step;
    // Push toward the middle of the board. The top row sits at negative z, the
    // bottom row at positive z, so "inward" flips sign between them.
    const push = tile.facing === 0 ? [0, inward]
      : tile.facing === Math.PI ? [0, -inward]
        : tile.facing > 0 ? [inward, 0] : [-inward, 0];
    return along === 'x'
      ? [tile.x + offset + push[0]!, TILE_TOP, tile.z + push[1]!]
      : [tile.x + push[0]!, TILE_TOP, tile.z + offset + push[1]!];
  });
}

export const MODEL_PATHS = {
  board: '/models/board.glb',
  van: '/models/quantum-van.glb',
  depot: '/models/terminal-depot.glb',
  quantum: '/models/token-quantum.glb',
  coin: '/models/token-coin.glb',
  robot: '/models/token-robot.glb',
  vest: '/models/token-vest.glb',
  megaphone: '/models/token-megaphone.glb',
  sneaker: '/models/token-sneaker.glb',
} as const;
