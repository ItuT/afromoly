'use client';

import { useEffect, useRef } from 'react';
import type { GameEvent } from '@afromoly/engine';
import { DICE_LEAD, HOP_SECONDS, IMPOUND_SECONDS, movePath } from './board3d';
import { playSound, primeSounds, type SoundName } from './sound';

/** One clip, and when in the batch it should sound. */
export interface Cue {
  name: SoundName;
  /** Seconds after the batch arrives. */
  at: number;
  gain: number;
  rate: number;
}

/**
 * How loud each clip sits in the mix. The files are all normalised to the same
 * peak, so this is where a tick becomes a tick and a fanfare a fanfare.
 */
const LEVEL: Record<SoundName, number> = {
  dice: 0.75,
  hop: 0.3,
  land: 0.45,
  'cash-in': 0.6,
  'cash-out': 0.55,
  buy: 0.6,
  build: 0.55,
  card: 0.5,
  impound: 0.7,
  release: 0.55,
  bid: 0.45,
  alert: 0.4,
  bankrupt: 0.7,
  win: 0.8,
};

/** Nothing plays on top of itself: cues that follow one another are spaced. */
const BEAT = 0.18;
/**
 * A bankruptcy can cascade into a long batch. Past this many cues the ear has
 * stopped counting anyway, and the rest would only be noise.
 */
const MAX_CUES = 32;

/**
 * Score a batch of engine events.
 *
 * The timings follow the 3D scene: the dice clatter first, the piece ticks once
 * per tile it crosses, and whatever the tile costs is heard once it has landed.
 * The flat board does not animate, but keeping one schedule means the sounds
 * still arrive in the order the story happens rather than all at once.
 */
export function cuesFor(events: GameEvent[]): Cue[] {
  const cues: Cue[] = [];
  // Where the scene has got to, in seconds from the start of the batch.
  let now = 0;
  const play = (name: SoundName, { at = now, gain = 1, rate = 1 } = {}) => {
    cues.push({ name, at, gain: LEVEL[name] * gain, rate });
  };
  /** A consequence of whatever just happened: heard after it, not over it. */
  const beat = (name: SoundName, gain = 1) => {
    play(name, { gain });
    now += BEAT;
  };

  for (const event of events) {
    switch (event.kind) {
      case 'diceRolled':
        play('dice');
        // The pieces wait for the dice to settle, and so does everything after.
        now = Math.max(now, DICE_LEAD);
        break;

      case 'moved': {
        const hops = movePath(event.from, event.to).length;
        for (let i = 0; i < hops; i++) {
          // The tick rises a little as the piece counts its way round, which
          // makes a long move sound like a long move.
          play('hop', { at: now + i * HOP_SECONDS, rate: 1 + Math.min(i, 12) * 0.012 });
        }
        now += hops * HOP_SECONDS;
        beat('land');
        break;
      }

      case 'sentToImpound':
        // The clang is the gate closing, so it lands with the piece.
        play('impound', { at: now + IMPOUND_SECONDS });
        now += IMPOUND_SECONDS + BEAT;
        break;

      case 'salaryPaid':
      case 'potCollected':
      case 'buildingSold':
      case 'mortgaged':
        beat('cash-in');
        break;

      case 'rentPaid':
      case 'taxPaid':
      case 'unmortgaged':
        beat('cash-out');
        break;

      case 'propertyBought':
      case 'auctionWon':
      case 'tradeAccepted':
        beat('buy');
        break;

      case 'buildingBought': beat('build'); break;
      case 'cardDrawn': beat('card'); break;
      case 'impoundExit': beat('release'); break;

      case 'auctionStarted':
      case 'bidPlaced':
      case 'tradeProposed':
        beat('bid');
        break;

      case 'utilitiesSuspended':
      case 'debtRaised':
      case 'turnSkipped':
      case 'illegalAction':
        beat('alert');
        break;

      case 'impoundAttemptFailed': beat('alert', 0.7); break;
      case 'bankrupt': beat('bankrupt'); break;
      case 'gameOver': beat('win'); break;

      // Everything else is bookkeeping the log tells better than a noise can:
      // the cash and pot totals behind a payment, an offer being made, a turn
      // beginning.
      default: break;
    }
    if (cues.length >= MAX_CUES) break;
  }

  return cues.slice(0, MAX_CUES);
}

/**
 * Sound the last batch of events.
 *
 * Batches are counted rather than compared, so two identical batches are still
 * two, and a batch already sounded is never sounded twice: React runs effects
 * twice on mount in development, and one roll should still be one roll.
 */
export function useSounds(events: GameEvent[], batch: number): void {
  const sounded = useRef(-1);

  useEffect(() => {
    const wake = () => primeSounds();
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  useEffect(() => {
    if (batch === 0 || sounded.current === batch) return;
    sounded.current = batch;
    for (const cue of cuesFor(events)) {
      playSound(cue.name, { delay: cue.at, gain: cue.gain, rate: cue.rate });
    }
  }, [batch, events]);
}
