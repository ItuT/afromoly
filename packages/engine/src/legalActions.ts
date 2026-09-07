/**
 * What a given operator may legally do right now.
 *
 * The interface uses this to enable controls. The reducer re-checks everything
 * regardless, so this is a convenience rather than a security boundary.
 */

import { tileAt } from './board.js';
import type { Action } from './actions.js';
import {
  buildLevel,
  currentPlayer,
  depotsOwned,
  groupStreets,
  maxRaisable,
  ownedTiles,
  ownsWholeGroup,
  playerById,
  tileState,
  vansOwned,
} from './selectors.js';
import type { GameState, PlayerId } from './types.js';

export function legalActions(state: GameState, playerId: PlayerId): Action[] {
  const player = playerById(state, playerId);
  if (!player || player.bankrupt || state.phase === 'gameOver') return [];
  const out: Action[] = [];
  const isCurrent = currentPlayer(state).id === playerId;

  if (state.phase === 'auction' && state.auction) {
    const a = state.auction;
    if (a.activeIds[a.turnIndex] === playerId) {
      const floor = Math.max(state.options.auctionFloor, a.currentBid + 1);
      if (player.cash >= floor) out.push({ kind: 'placeBid', playerId, amount: floor });
      out.push({ kind: 'passBid', playerId });
    }
    return out;
  }

  if (state.phase === 'tradeReview' && state.trade) {
    if (state.trade.toId === playerId) {
      out.push({ kind: 'acceptTrade', playerId });
      out.push({ kind: 'declineTrade', playerId });
    } else if (state.trade.fromId === playerId) {
      out.push({ kind: 'declineTrade', playerId });
    }
    return out;
  }

  if (state.phase === 'debtSettlement') {
    const debt = state.debts[0];
    if (debt && debt.debtorId === playerId) {
      if (player.cash >= debt.amount) out.push({ kind: 'settleDebt', playerId });
      out.push(...liquidationActions(state, playerId));
      // Bankruptcy is only on the table once selling and mortgaging cannot cover it.
      if (maxRaisable(state, playerId) < debt.amount) {
        out.push({ kind: 'declareBankruptcy', playerId });
      }
    }
    return out;
  }

  if (!isCurrent) return out;

  switch (state.phase) {
    case 'awaitingRoll':
      if (player.inImpound) {
        if (player.cash >= state.options.impoundFine) out.push({ kind: 'payImpoundFine', playerId });
        if (player.getOutCards.length > 0) out.push({ kind: 'useImpoundCard', playerId });
      }
      out.push({ kind: 'rollDice', playerId });
      out.push(...managementActions(state, playerId));
      break;
    case 'awaitingBuyDecision':
      if (state.pendingBuy !== null) {
        const tile = tileAt(state.pendingBuy);
        if ('price' in tile && player.cash >= tile.price) out.push({ kind: 'buyProperty', playerId });
        out.push({ kind: 'declineAndAuction', playerId });
      }
      break;
    case 'awaitingTaxChoice':
      out.push({ kind: 'chooseTaxOption', playerId, option: 'flat' });
      out.push({ kind: 'chooseTaxOption', playerId, option: 'percent' });
      break;
    case 'awaitingEndTurn':
      out.push(...managementActions(state, playerId));
      out.push({ kind: 'endTurn', playerId });
      break;
    default:
      break;
  }
  return out;
}

function liquidationActions(state: GameState, playerId: PlayerId): Action[] {
  const out: Action[] = [];
  for (const index of ownedTiles(state, playerId)) {
    const tile = tileAt(index);
    const ts = tileState(state, index);
    if (tile.kind === 'street' && buildLevel(ts) > 0) {
      const levels = groupStreets(tile.group).map((s) => buildLevel(tileState(state, s.index)));
      if (buildLevel(ts) === Math.max(...levels)) out.push({ kind: 'sellBuilding', playerId, tileIndex: index });
    }
    if (!ts.mortgaged && buildLevel(ts) === 0) out.push({ kind: 'mortgage', playerId, tileIndex: index });
  }
  return out;
}

function managementActions(state: GameState, playerId: PlayerId): Action[] {
  const player = playerById(state, playerId);
  if (!player) return [];
  const out: Action[] = [...liquidationActions(state, playerId)];
  for (const index of ownedTiles(state, playerId)) {
    const tile = tileAt(index);
    const ts = tileState(state, index);
    if (ts.mortgaged && 'mortgage' in tile) {
      const cost = tile.mortgage + Math.ceil(tile.mortgage * 0.1);
      if (player.cash >= cost) out.push({ kind: 'unmortgage', playerId, tileIndex: index });
    }
    if (tile.kind !== 'street' || ts.mortgaged) continue;
    if (!ownsWholeGroup(state, playerId, tile.group)) continue;
    const streets = groupStreets(tile.group);
    if (streets.some((s) => tileState(state, s.index).mortgaged)) continue;
    const level = buildLevel(ts);
    const min = Math.min(...streets.map((s) => buildLevel(tileState(state, s.index))));
    if (level >= 5 || level !== min || player.cash < tile.buildCost) continue;
    const roomForVan = level < 4 && vansOwned(state) < state.options.maxVans;
    const roomForDepot = level === 4 && depotsOwned(state) < state.options.maxDepots;
    if (roomForVan || roomForDepot) out.push({ kind: 'buyBuilding', playerId, tileIndex: index });
  }
  return out;
}
