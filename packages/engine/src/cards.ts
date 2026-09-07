/**
 * The Kombi Hustle and City Watch decks, transcribed from Readme.md.
 *
 * Forward movement always pays the Month-End Payday salary when the token
 * passes or lands on space 0, per rulebook section 4A. That is why no card
 * carries its own "collect payday" flag.
 *
 * Card penalties feed the jackpot pot when that rule is on (PLAN.md conflict 8).
 */

import type { DeckId } from './types.js';

export type CardEffect =
  | { type: 'collect'; amount: number }
  | { type: 'pay'; amount: number }
  | { type: 'collectFromEach'; amount: number }
  | { type: 'advance'; to: number; doubleRent?: boolean }
  | { type: 'moveBack'; spaces: number }
  | { type: 'goToImpound' }
  | { type: 'getOutCard' }
  | { type: 'perBuilding'; perVan: number; perDepot: number }
  | { type: 'skipTurn' }
  | { type: 'suspendUtilities' };

export interface Card {
  id: number;
  deck: DeckId;
  title: string;
  text: string;
  effect: CardEffect;
  /** Get Out of Impound cards are kept by the player, not returned to the deck. */
  retained: boolean;
}

const card = (
  id: number,
  deck: DeckId,
  title: string,
  text: string,
  effect: CardEffect,
  retained = false,
): Card => ({ id, deck, title, text, effect, retained });

export const KOMBI_DECK: readonly Card[] = [
  card(1, 'kombi', 'Pass the Change', 'You balance the coins and calculate everyone’s change accurately. Collect R1,500.', { type: 'collect', amount: 1_500 }),
  card(2, 'kombi', 'Yellow-Lane Express', 'Your driver mounts the emergency shoulder to beat the gridlock. Advance to Noord Taxi Rank.', { type: 'advance', to: 25 }),
  card(3, 'kombi', 'Spanner in the Works', 'Radiator cap blows climbing into Yeoville. Pay R3,000 for roadside repairs.', { type: 'pay', amount: 3_000 }),
  card(4, 'kombi', 'Stokvel Payout', 'Your turn in the monthly commuter savings club. Collect R2,000 from every player.', { type: 'collectFromEach', amount: 2_000 }),
  card(5, 'kombi', '"Short Left, After Robot!"', 'The music was at concert volume and you missed your stop. Move back 3 spaces.', { type: 'moveBack', spaces: 3 }),
  card(6, 'kombi', 'JMPD Impound Warning', 'No operating permit displayed at Gillooly’s. Go directly to the JMPD Impound Lot.', { type: 'goToImpound' }),
  card(7, 'kombi', 'Ranking Dispute', 'A rival association blocks your loading bay at Bree. Pay R1,500 per Quantum van and R6,000 per depot.', { type: 'perBuilding', perVan: 1_500, perDepot: 6_000 }),
  card(8, 'kombi', 'VIP Siyaya Upgrade', 'Sound system, leatherette seats and chrome rims fitted. Collect R5,000.', { type: 'collect', amount: 5_000 }),
  card(9, 'kombi', 'Loadshedding Traffic Light', 'The robot at Grayston is out and pointsmen are running the intersection. Pay R1,000 to the rank pot.', { type: 'pay', amount: 1_000 }),
  card(10, 'kombi', 'Express Lane to Sandton', 'A fast Gautrain connection bypasses the M1 South. Advance to Sandton Gautrain Station.', { type: 'advance', to: 35 }),
  card(11, 'kombi', 'Full Capacity Loading', '"Four in a row, squeeze together!" Every seat filled on a Friday. Collect R4,000.', { type: 'collect', amount: 4_000 }),
  card(12, 'kombi', 'Marshal Clears the Bay', 'The rank marshal is your cousin. Get Out of JMPD Impound Free.', { type: 'getOutCard' }, true),
  card(13, 'kombi', 'Petrol Price Hike', 'A midnight fuel levy hits inland Gauteng. Pay R500 per Quantum van.', { type: 'perBuilding', perVan: 500, perDepot: 0 }),
  card(14, 'kombi', 'Detour via Soweto', 'Roadworks divert you through the cultural heartland. Advance to Vilakazi Street.', { type: 'advance', to: 9 }),
  card(15, 'kombi', 'Fare Discrepancy', 'A passenger jumped out at a red robot without settling. Pay R1,000.', { type: 'pay', amount: 1_000 }),
  card(16, 'kombi', 'High-Roller Charter', 'Booked for a wedding convoy from Diepkloof to Fourways. Collect R10,000.', { type: 'collect', amount: 10_000 }),
];

export const CITYWATCH_DECK: readonly Card[] = [
  card(1, 'citywatch', 'Joburg Water Pipe Burst', 'A reservoir pipe bursts in Linden. Pay R2,500 per Quantum van and R8,000 per depot for water bowsers.', { type: 'perBuilding', perVan: 2_500, perDepot: 8_000 }),
  card(2, 'citywatch', 'Rates Rebate Audit', 'A municipal billing audit finally credits your account. Collect R15,000.', { type: 'collect', amount: 15_000 }),
  card(3, 'citywatch', 'Pothole Insurance Claim', 'A cracked rim on William Nicol is compensated. Collect R2,500.', { type: 'collect', amount: 2_500 }),
  card(4, 'citywatch', 'Substation Explosion', 'A City Power transformer fails after a cold-snap demand spike. Utilities collect no rent for a full round.', { type: 'suspendUtilities' }),
  card(5, 'citywatch', 'Advance to Sandton CBD', 'An executive summit at Alice Lane requires you immediately. Advance to Sandton CBD and pay double rent if it is owned.', { type: 'advance', to: 39, doubleRent: true }),
  card(6, 'citywatch', 'JMPD Impound Clearance', 'An urgent interdict clears vehicles held unlawfully. Get Out of JMPD Impound Free.', { type: 'getOutCard' }, true),
  card(7, 'citywatch', 'Solar & Inverter Rebate', 'You fitted off-grid solar across your properties. Collect R1,000 from each player.', { type: 'collectFromEach', amount: 1_000 }),
  card(8, 'citywatch', 'Building Plan Approval Delayed', 'Red tape at the Braamfontein Civic Centre stalls your depot project. Skip your next turn.', { type: 'skipTurn' }),
  card(9, 'citywatch', 'Urban Regeneration Grant', 'A heritage foundation rewards your inner-city preservation. Collect R8,000.', { type: 'collect', amount: 8_000 }),
  card(10, 'citywatch', 'Unlicensed Street Vendor Fine', 'Metro police enforce pavement trading bylaws outside your shop front. Pay R3,000.', { type: 'pay', amount: 3_000 }),
  card(11, 'citywatch', 'Bree Rank Bridge Maintenance', 'A structural inspection reroutes all commuter flow. Advance to Bree Taxi Rank.', { type: 'advance', to: 5 }),
  card(12, 'citywatch', 'SARS Audit Assessment', 'An IT14 penalty assessment lands on unreported cash. Pay R15,000.', { type: 'pay', amount: 15_000 }),
  card(13, 'citywatch', 'Parkhurst Cafe Culture Boom', 'Weekend dining sets a footfall record on 4th Avenue. Advance to Parkhurst.', { type: 'advance', to: 23 }),
  card(14, 'citywatch', 'Private Security Levy', 'The suburb encloses with boom gates and plate recognition. Pay R2,000.', { type: 'pay', amount: 2_000 }),
  card(15, 'citywatch', 'Payday Bonus', 'A corporate dividend clears into your account. Advance to Month-End Payday.', { type: 'advance', to: 0 }),
  card(16, 'citywatch', 'Reckless Driving Arrest', 'Caught making a U-turn over a solid island in front of a Metro patrol. Go to the JMPD Impound Lot.', { type: 'goToImpound' }),
];

export const DECKS: Record<DeckId, readonly Card[]> = {
  kombi: KOMBI_DECK,
  citywatch: CITYWATCH_DECK,
};

export function cardById(deck: DeckId, id: number): Card {
  const found = DECKS[deck].find((c) => c.id === id);
  if (!found) throw new Error(`No ${deck} card with id ${id}`);
  return found;
}
