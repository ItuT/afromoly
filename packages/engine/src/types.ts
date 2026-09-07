/** Core domain types for Afromoly: Johannesburg Edition. */

import type { RngState } from './rng.js';

export type PlayerId = string;
export type TileIndex = number;

export type ColorGroup =
  | 'brown'
  | 'lightblue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'darkblue';

export type DeckId = 'kombi' | 'citywatch';

export type TokenId =
  | 'quantum'
  | 'coin'
  | 'robot'
  | 'vest'
  | 'megaphone'
  | 'sneaker';

export const TOKENS: readonly TokenId[] = [
  'quantum',
  'coin',
  'robot',
  'vest',
  'megaphone',
  'sneaker',
] as const;

export const TOKEN_NAMES: Record<TokenId, string> = {
  quantum: 'Toyota Quantum Minibus',
  coin: 'R5 Bi-Metallic Coin',
  robot: 'The Robot (Traffic Light)',
  vest: "Car Guard's Hi-Vis Vest",
  megaphone: 'Street Corner Megaphone',
  sneaker: 'All-Star Chuck Sneaker',
};

/**
 * Rent ladder for a street: index 0 is the base site rent, 1 to 4 are the
 * rents with that many Quantum vans, and 5 is the rent with a Terminal Depot.
 */
export type RentLadder = readonly [number, number, number, number, number, number];

export interface StreetTile {
  index: TileIndex;
  kind: 'street';
  name: string;
  group: ColorGroup;
  price: number;
  rent: RentLadder;
  /** Cost of one Quantum van. A Terminal Depot costs the same (see PLAN.md conflict 3). */
  buildCost: number;
  mortgage: number;
}

export interface HubTile {
  index: TileIndex;
  kind: 'hub';
  name: string;
  price: number;
  mortgage: number;
}

export interface UtilityTile {
  index: TileIndex;
  kind: 'utility';
  name: string;
  price: number;
  mortgage: number;
}

export interface TaxTile {
  index: TileIndex;
  kind: 'tax';
  name: string;
  amount: number;
  /** SARS Road Tax allows 10% of net worth instead of the flat amount. */
  allowPercent: boolean;
  /** Whether the payment feeds the jackpot pot when that rule is on. */
  toPot: boolean;
}

export interface CardTile {
  index: TileIndex;
  kind: 'card';
  name: string;
  deck: DeckId;
}

export interface CornerTile {
  index: TileIndex;
  kind: 'go' | 'impound' | 'freerest' | 'gotoimpound';
  name: string;
}

export type Tile = StreetTile | HubTile | UtilityTile | TaxTile | CardTile | CornerTile;

/** A tile that can be owned. */
export type OwnableTile = StreetTile | HubTile | UtilityTile;

export interface TileState {
  ownerId: PlayerId | null;
  /** Quantum vans, 0 to 4. Always 0 once a depot is built. */
  vans: number;
  depot: boolean;
  mortgaged: boolean;
}

export interface HeldCard {
  deck: DeckId;
  cardId: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  token: TokenId;
  cash: number;
  position: TileIndex;
  /** True only when detained, not when merely visiting space 10. */
  inImpound: boolean;
  /** Failed doubles attempts while detained, 0 to 3. */
  impoundAttempts: number;
  /** Held Get Out of JMPD Impound Free cards, tracked per deck so they return correctly. */
  getOutCards: HeldCard[];
  skipNextTurn: boolean;
  bankrupt: boolean;
}

export interface GameOptions {
  /** Jackpot house rule: card penalties and the e-toll feed a centre pot. */
  jackpot: boolean;
  /** Rush-Hour timed variant. The engine only records it; the clock lives server side. */
  timedMinutes: number | null;
  startingCash: number;
  paydaySalary: number;
  impoundFine: number;
  auctionFloor: number;
  maxVans: number;
  maxDepots: number;
}

export interface AuctionState {
  tileIndex: TileIndex;
  reason: 'declined' | 'bankruptcy';
  currentBid: number;
  highBidderId: PlayerId | null;
  /** Seat-ordered ids of players who have not yet passed. */
  activeIds: PlayerId[];
  /** Index into activeIds whose turn it is to bid. */
  turnIndex: number;
  /** Tiles still to be auctioned after this one (bankruptcy to the bank). */
  queue: TileIndex[];
}

export interface TradeOffer {
  fromId: PlayerId;
  toId: PlayerId;
  fromCash: number;
  toCash: number;
  fromTiles: TileIndex[];
  toTiles: TileIndex[];
  fromGetOutCards: number;
  toGetOutCards: number;
}

export interface DebtState {
  debtorId: PlayerId;
  /** null means the debt is owed to the bank. */
  creditorId: PlayerId | null;
  amount: number;
  /** What the debt came from, for narration and for bankruptcy routing. */
  source: 'rent' | 'tax' | 'card' | 'fee';
  /** When the jackpot rule is on and this debt should feed the pot instead of the bank. */
  toPot: boolean;
}

export type Phase =
  | 'awaitingRoll'
  | 'awaitingBuyDecision'
  | 'awaitingTaxChoice'
  | 'auction'
  | 'awaitingEndTurn'
  | 'tradeReview'
  | 'debtSettlement'
  | 'gameOver';

export interface DeckState {
  /**
   * Card ids in draw order. Drawing takes from the front; the card returns to
   * the back unless it is a retained Get Out of Impound card, which leaves
   * circulation until its holder uses or trades it away.
   */
  order: number[];
}

export interface GameState {
  /** Bumped on every applied action. Distinct from the DynamoDB item version. */
  revision: number;
  options: GameOptions;
  rng: RngState;
  players: Player[];
  currentPlayerIndex: number;
  phase: Phase;
  tiles: TileState[];
  decks: Record<DeckId, DeckState>;
  pot: number;
  turnNumber: number;
  doublesCount: number;
  lastRoll: [number, number] | null;
  /**
   * Turn number at which suspended utility rent resumes (City Watch 4).
   * null when utilities are collecting normally.
   */
  utilitiesSuspendedUntilTurn: number | null;
  pendingBuy: TileIndex | null;
  pendingTax: TileIndex | null;
  auction: AuctionState | null;
  trade: TradeOffer | null;
  /** Debts awaiting settlement, oldest first. Only the head is actionable. */
  debts: DebtState[];
  /** Where play returns once every debt clears, and any movement still owed. */
  resumeAfterDebt: { phase: Phase; move: number | null } | null;
  /** Where play returns once the auction queue empties. */
  resumeAfterAuction: Phase | null;
  /** Where play returns once a trade is accepted or declined. */
  resumeAfterTrade: Phase | null;
  /**
   * Where the current turn resumes once an interruption clears: awaitingRoll
   * when the player rolled doubles and is owed another roll, otherwise
   * awaitingEndTurn.
   */
  turnResumePhase: Phase;
  /** Set when the player whose turn it is went bankrupt and play must move on. */
  pendingTurnAdvance: boolean;
  winnerId: PlayerId | null;
}

export interface PlayerSetup {
  id: PlayerId;
  name: string;
  token: TokenId;
}

/**
 * The game as an observer may see it: everything except the shuffled deck
 * order and the generator state, which would give away the next card and every
 * future roll.
 *
 * Every read-only selector takes this rather than GameState, so it is a type
 * error for a display path to reach for hidden information.
 */
export type ObservableState = Omit<GameState, 'rng' | 'decks'>;
