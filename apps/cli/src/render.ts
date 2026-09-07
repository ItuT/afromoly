/** Terminal rendering for the hot-seat runner. */

import { BOARD, GROUP_NAMES, tileAt, type GameState, type Tile } from '@afromoly/engine';

const ESC = String.fromCharCode(27);
const C = {
  reset: `${ESC}[0m`,
  dim: `${ESC}[2m`,
  bold: `${ESC}[1m`,
  ochre: `${ESC}[38;5;172m`,
  teal: `${ESC}[38;5;73m`,
  red: `${ESC}[38;5;167m`,
  green: `${ESC}[38;5;71m`,
  grey: `${ESC}[38;5;245m`,
};

export const rand = (n: number): string => `R${n.toLocaleString('en-ZA')}`;

const SHORT: Record<number, string> = {
  0: 'PAYDAY', 2: 'KOMBI', 4: 'SARSTAX', 7: 'CITYWCH', 10: 'IMPOUND', 12: 'CITYPWR',
  15: 'PARKSTN', 17: 'KOMBI', 20: 'RANKQUE', 22: 'CITYWCH', 25: 'NOORD', 28: 'JHBWATR',
  30: 'GOTOIMP', 33: 'KOMBI', 35: 'GAUTRN', 36: 'CITYWCH', 38: 'E-TOLL',
};

function short(tile: Tile): string {
  const fixed = SHORT[tile.index];
  if (fixed) return fixed;
  return tile.name.replace(/\s*\(.*\)/, '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 7);
}

const pad = (s: string, n: number): string =>
  s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);

/** Board indices in display order: top row, the two sides, then the bottom row. */
function layout(): number[][] {
  const rows: number[][] = [];
  rows.push(Array.from({ length: 11 }, (_, i) => 20 + i));
  for (let r = 1; r <= 9; r++) {
    rows.push([20 - r, ...Array.from({ length: 9 }, () => -1), 30 + r]);
  }
  rows.push(Array.from({ length: 11 }, (_, i) => (10 - i + 40) % 40));
  return rows;
}

export function renderBoard(state: GameState): string {
  const width = 8;
  const lines: string[] = [];
  for (const row of layout()) {
    let top = '';
    let bottom = '';
    for (const index of row) {
      if (index === -1) {
        top += ' '.repeat(width);
        bottom += ' '.repeat(width);
        continue;
      }
      const tile = tileAt(index);
      const ts = state.tiles[index];
      const owner = ts?.ownerId ? state.players.findIndex((p) => p.id === ts.ownerId) + 1 : 0;
      const dev = ts?.depot ? 'D' : ts?.vans ? String(ts.vans) : ts?.mortgaged ? 'm' : ' ';
      const here = state.players
        .map((p, i) => (p.position === index && !p.bankrupt ? String(i + 1) : ''))
        .join('');
      top += (owner ? C.ochre : C.grey) + pad(short(tile), width) + C.reset;
      bottom +=
        C.dim + pad(`${index}${owner ? `.${owner}` : '  '}${dev}`, width - 3) + C.reset +
        C.teal + pad(here, 3) + C.reset;
    }
    lines.push(top.replace(/\s+$/, ''));
    lines.push(bottom.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}

export function renderPlayers(state: GameState): string {
  return state.players
    .map((p, i) => {
      const mark = i === state.currentPlayerIndex ? `${C.ochre}>${C.reset}` : ' ';
      const status = p.bankrupt
        ? `${C.red}OUT${C.reset}`
        : p.inImpound
          ? `${C.red}IMPOUND ${p.impoundAttempts}/3${C.reset}`
          : `at ${tileAt(p.position).name}`;
      const deeds = state.tiles.filter((t) => t.ownerId === p.id).length;
      const cards = p.getOutCards.length
        ? ` ${C.green}+${p.getOutCards.length} exit card${C.reset}`
        : '';
      return `${mark} ${C.bold}${i + 1} ${pad(p.name, 9)}${C.reset}${pad(rand(p.cash), 11)}${deeds} deeds   ${status}${cards}`;
    })
    .join('\n');
}

export function renderHoldings(state: GameState, playerId: string): string {
  const rows = BOARD.filter((t) => state.tiles[t.index]?.ownerId === playerId).map((tile) => {
    const ts = state.tiles[tile.index];
    const group =
      tile.kind === 'street' ? GROUP_NAMES[tile.group]
        : tile.kind === 'hub' ? 'Transit hub'
          : 'Municipal utility';
    const dev = ts?.depot ? 'Terminal Depot' : ts?.vans ? `${ts.vans} Quantum van` : '';
    const flag = ts?.mortgaged ? `${C.red}MORTGAGED${C.reset}` : '';
    return `  ${pad(String(tile.index), 4)}${pad(tile.name, 29)}${pad(group, 20)}${dev}${flag}`;
  });
  return rows.length ? rows.join('\n') : `${C.dim}  No deeds yet.${C.reset}`;
}

export const colour = C;
