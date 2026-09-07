import { tileAt, type ColorGroup, type ObservableState, type Tile } from '@afromoly/engine';

export const GROUP_COLOUR: Record<ColorGroup, string> = {
  brown: 'var(--brown)',
  lightblue: 'var(--lightblue)',
  pink: 'var(--pink)',
  orange: 'var(--orange)',
  red: 'var(--red)',
  yellow: 'var(--yellow)',
  green: 'var(--green)',
  darkblue: 'var(--darkblue)',
};

export const seatColour = (seat: number): string => `var(--seat-${(seat % 6) + 1})`;

export const rand = (n: number): string => `R${n.toLocaleString('en-ZA')}`;

/** Row and column on the 11 by 11 grid, with Month-End Payday bottom right. */
export function gridPosition(index: number): { row: number; column: number } {
  if (index === 0) return { row: 11, column: 11 };
  if (index < 10) return { row: 11, column: 11 - index };
  if (index === 10) return { row: 11, column: 1 };
  if (index < 20) return { row: 21 - index, column: 1 };
  if (index === 20) return { row: 1, column: 1 };
  if (index < 30) return { row: 1, column: index - 19 };
  if (index === 30) return { row: 1, column: 11 };
  return { row: index - 29, column: 11 };
}

/** Short label for the corners and the utility spaces. */
export function tileLabel(tile: Tile): string {
  switch (tile.kind) {
    case 'go': return 'Month-End Payday';
    case 'impound': return 'JMPD Impound Lot';
    case 'freerest': return 'Taxi Rank Queue';
    case 'gotoimpound': return 'Go to Impound';
    default: return tile.name;
  }
}

export function seatIndexOf(state: ObservableState, playerId: string | null): number {
  if (!playerId) return -1;
  return state.players.findIndex((p) => p.id === playerId);
}

export function tileName(index: number): string {
  return tileAt(index).name;
}
