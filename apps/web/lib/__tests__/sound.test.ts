import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@afromoly/engine';
import { DICE_LEAD, HOP_SECONDS, IMPOUND_SECONDS, movePath } from '../board3d';
import { SOUND_NAMES } from '../sound';
import { cuesFor } from '../useSounds';

const AUDIO = join(__dirname, '..', '..', 'public', 'audio');

describe('the clips', () => {
  it('exist for every name the client can ask for', () => {
    // Built by assets/audio/build_sounds.py. A name with no file behind it is
    // silence at the table, and nothing else would notice.
    for (const name of SOUND_NAMES) {
      const path = join(AUDIO, `${name}.wav`);
      expect(statSync(path).size, name).toBeGreaterThan(1000);
      expect(readFileSync(path).subarray(0, 4).toString('ascii'), name).toBe('RIFF');
    }
  });
});

const roll = (dice: [number, number]): GameEvent =>
  ({ kind: 'diceRolled', playerId: 'a', dice, isDoubles: dice[0] === dice[1] });
const move = (from: number, to: number): GameEvent =>
  ({ kind: 'moved', playerId: 'a', from, to, passedGo: to < from });

describe('cuesFor', () => {
  it('says nothing about a batch it has no sound for', () => {
    expect(cuesFor([{ kind: 'turnStarted', playerId: 'a', turnNumber: 2 }])).toEqual([]);
  });

  it('holds the walk until the dice have settled', () => {
    const cues = cuesFor([roll([3, 4]), move(0, 7)]);
    const dice = cues.find((cue) => cue.name === 'dice');
    expect(dice?.at).toBe(0);
    for (const hop of cues.filter((cue) => cue.name === 'hop')) {
      expect(hop.at).toBeGreaterThanOrEqual(DICE_LEAD);
    }
  });

  it('ticks once per tile crossed, then lands', () => {
    const cues = cuesFor([move(0, 7)]);
    const hops = cues.filter((cue) => cue.name === 'hop');
    expect(hops).toHaveLength(movePath(0, 7).length);
    // Evenly spaced, at the same rate the piece hops.
    expect(hops[1]!.at - hops[0]!.at).toBeCloseTo(HOP_SECONDS);
    const land = cues.find((cue) => cue.name === 'land');
    expect(land!.at).toBeCloseTo(hops.at(-1)!.at + HOP_SECONDS);
  });

  it('counts a move that passes Payday by the tiles walked, not the difference', () => {
    const cues = cuesFor([move(38, 3)]);
    expect(cues.filter((cue) => cue.name === 'hop')).toHaveLength(5);
  });

  it('sounds what a tile costs only once the piece is standing on it', () => {
    const cues = cuesFor([roll([1, 2]), move(0, 3), { kind: 'rentPaid', fromId: 'a', toId: 'b', tileIndex: 3, amount: 50, doubled: false }]);
    const land = cues.find((cue) => cue.name === 'land')!;
    expect(cues.find((cue) => cue.name === 'cash-out')!.at).toBeGreaterThan(land.at);
  });

  it('closes the gate as the piece arrives at the impound lot', () => {
    const cues = cuesFor([{ kind: 'sentToImpound', playerId: 'a', reason: 'tile' }]);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.at).toBeCloseTo(IMPOUND_SECONDS);
  });

  it('never schedules anything in the past, or louder than the mix allows', () => {
    const cues = cuesFor([roll([2, 2]), move(0, 4), { kind: 'cardDrawn', playerId: 'a', deck: 'kombi', cardId: 1, title: 't', text: 'x' }, { kind: 'bankrupt', playerId: 'a', creditorId: null }]);
    for (const cue of cues) {
      expect(cue.at).toBeGreaterThanOrEqual(0);
      expect(cue.gain).toBeGreaterThan(0);
      expect(cue.gain).toBeLessThanOrEqual(1);
      expect(SOUND_NAMES).toContain(cue.name);
    }
  });

  it('stops piling up cues once a batch runs long', () => {
    const cascade: GameEvent[] = Array.from({ length: 200 }, () => ({ kind: 'bidPlaced', playerId: 'a', amount: 500 }));
    expect(cuesFor(cascade).length).toBeLessThanOrEqual(32);
  });
});
