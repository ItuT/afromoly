/** Every intent a client may send. The engine accepts nothing else. */

import type { PlayerId, TileIndex, TradeOffer } from './types.js';

export type Action =
  | { kind: 'rollDice'; playerId: PlayerId }
  | { kind: 'buyProperty'; playerId: PlayerId }
  | { kind: 'declineAndAuction'; playerId: PlayerId }
  | { kind: 'placeBid'; playerId: PlayerId; amount: number }
  | { kind: 'passBid'; playerId: PlayerId }
  | { kind: 'buyBuilding'; playerId: PlayerId; tileIndex: TileIndex }
  | { kind: 'sellBuilding'; playerId: PlayerId; tileIndex: TileIndex }
  | { kind: 'mortgage'; playerId: PlayerId; tileIndex: TileIndex }
  | { kind: 'unmortgage'; playerId: PlayerId; tileIndex: TileIndex }
  | { kind: 'proposeTrade'; playerId: PlayerId; offer: TradeOffer }
  | { kind: 'acceptTrade'; playerId: PlayerId }
  | { kind: 'declineTrade'; playerId: PlayerId }
  | { kind: 'payImpoundFine'; playerId: PlayerId }
  | { kind: 'useImpoundCard'; playerId: PlayerId }
  | { kind: 'chooseTaxOption'; playerId: PlayerId; option: 'flat' | 'percent' }
  | { kind: 'settleDebt'; playerId: PlayerId }
  | { kind: 'declareBankruptcy'; playerId: PlayerId }
  | { kind: 'endTurn'; playerId: PlayerId };

export type ActionKind = Action['kind'];
