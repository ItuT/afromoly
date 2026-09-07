/** Narratable facts the interface animates. One reduce call may emit several. */

import type { DeckId, PlayerId, TileIndex, TradeOffer } from './types.js';

export type GameEvent =
  | { kind: 'gameStarted'; playerIds: PlayerId[] }
  | { kind: 'turnStarted'; playerId: PlayerId; turnNumber: number }
  | { kind: 'turnSkipped'; playerId: PlayerId; reason: 'municipalQueue' }
  | { kind: 'diceRolled'; playerId: PlayerId; dice: [number, number]; isDoubles: boolean }
  | { kind: 'moved'; playerId: PlayerId; from: TileIndex; to: TileIndex; passedGo: boolean }
  | { kind: 'salaryPaid'; playerId: PlayerId; amount: number }
  | { kind: 'propertyOffered'; playerId: PlayerId; tileIndex: TileIndex; price: number }
  | { kind: 'propertyBought'; playerId: PlayerId; tileIndex: TileIndex; price: number }
  | { kind: 'rentPaid'; fromId: PlayerId; toId: PlayerId; tileIndex: TileIndex; amount: number; doubled: boolean }
  | { kind: 'rentWaived'; tileIndex: TileIndex; reason: 'mortgaged' | 'utilitiesSuspended' | 'ownProperty' }
  | { kind: 'taxPaid'; playerId: PlayerId; amount: number; option: 'flat' | 'percent'; toPot: boolean }
  | { kind: 'cardDrawn'; playerId: PlayerId; deck: DeckId; cardId: number; title: string; text: string }
  | { kind: 'cashChanged'; playerId: PlayerId; delta: number; reason: string }
  | { kind: 'potChanged'; delta: number; total: number }
  | { kind: 'potCollected'; playerId: PlayerId; amount: number; seeded: boolean }
  | { kind: 'sentToImpound'; playerId: PlayerId; reason: 'tile' | 'card' | 'threeDoubles' }
  | { kind: 'impoundExit'; playerId: PlayerId; via: 'fine' | 'card' | 'doubles' | 'forcedFine' }
  | { kind: 'impoundAttemptFailed'; playerId: PlayerId; attempts: number }
  | { kind: 'buildingBought'; playerId: PlayerId; tileIndex: TileIndex; building: 'van' | 'depot'; cost: number }
  | { kind: 'buildingSold'; playerId: PlayerId; tileIndex: TileIndex; building: 'van' | 'depot'; refund: number }
  | { kind: 'mortgaged'; playerId: PlayerId; tileIndex: TileIndex; amount: number }
  | { kind: 'unmortgaged'; playerId: PlayerId; tileIndex: TileIndex; cost: number }
  | { kind: 'auctionStarted'; tileIndex: TileIndex; reason: 'declined' | 'bankruptcy' }
  | { kind: 'bidPlaced'; playerId: PlayerId; amount: number }
  | { kind: 'bidPassed'; playerId: PlayerId }
  | { kind: 'auctionWon'; playerId: PlayerId; tileIndex: TileIndex; amount: number }
  | { kind: 'auctionUnsold'; tileIndex: TileIndex }
  | { kind: 'tradeProposed'; offer: TradeOffer }
  | { kind: 'tradeAccepted'; offer: TradeOffer }
  | { kind: 'tradeDeclined'; offer: TradeOffer }
  | { kind: 'utilitiesSuspended'; untilTurn: number }
  | { kind: 'debtRaised'; debtorId: PlayerId; creditorId: PlayerId | null; amount: number }
  | { kind: 'debtSettled'; debtorId: PlayerId; creditorId: PlayerId | null; amount: number }
  | { kind: 'bankrupt'; playerId: PlayerId; creditorId: PlayerId | null }
  | { kind: 'gameOver'; winnerId: PlayerId }
  | { kind: 'illegalAction'; playerId: PlayerId; reason: string };
