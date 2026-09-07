/**
 * Playing the sounds built by assets/audio/build_sounds.py.
 *
 * One AudioContext for the page, clips fetched and decoded once, then fired
 * from a shared master gain. Cues are scheduled on the audio clock rather than
 * with timers, so a roll and the walk that follows it keep their rhythm even
 * when the main thread is busy drawing the board.
 *
 * Browsers refuse to start audio until the page has been touched, so nothing
 * loads or plays until primeSounds() runs inside a real gesture.
 */

/** Every clip that exists. Keep in step with assets/audio/build_sounds.py. */
export const SOUND_NAMES = [
  'dice',
  'hop',
  'land',
  'cash-in',
  'cash-out',
  'buy',
  'build',
  'card',
  'impound',
  'release',
  'bid',
  'alert',
  'bankrupt',
  'win',
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

export interface PlayOptions {
  /** Seconds from now, on the audio clock. */
  delay?: number;
  gain?: number;
  /** Playback rate, which shifts the pitch with it. */
  rate?: number;
}

const STORAGE_KEY = 'afromoly.sound';
/** Loud enough to hear over a laptop fan, quiet enough not to be a problem. */
const MASTER = 0.85;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let on = true;
let read = false;

const buffers = new Map<SoundName, AudioBuffer>();
const pending = new Map<SoundName, Promise<AudioBuffer | null>>();

/** Whether sound is switched on. Reads the saved preference the first time. */
export function soundsOn(): boolean {
  if (!read && typeof window !== 'undefined') {
    read = true;
    try {
      on = window.localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      // Private browsing, or storage turned off. Sound on is the default.
    }
  }
  return on;
}

export function setSoundsOn(next: boolean): void {
  on = next;
  read = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
  } catch {
    // Not being able to remember the choice is no reason not to honour it.
  }
  // Ride the master down rather than cutting, which also silences anything
  // already scheduled: muting mid-fanfare should be instant but not a click.
  if (context && master) {
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(next ? MASTER : 0, context.currentTime, 0.02);
  }
  if (next) primeSounds();
}

function ensureContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  master = context.createGain();
  master.gain.value = soundsOn() ? MASTER : 0;
  master.connect(context.destination);
  return context;
}

function load(ctx: AudioContext, name: SoundName): Promise<AudioBuffer | null> {
  const ready = buffers.get(name);
  if (ready) return Promise.resolve(ready);
  let job = pending.get(name);
  if (!job) {
    job = fetch(`/audio/${name}.wav`)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} for ${name}.wav`);
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        buffers.set(name, buffer);
        pending.delete(name);
        return buffer;
      })
      .catch(() => {
        // A clip that will not load costs silence, never the game.
        pending.delete(name);
        return null;
      });
    pending.set(name, job);
  }
  return job;
}

/**
 * Start the audio context and pull the clips down. Must be called from a user
 * gesture; calling it again afterwards is free.
 */
export function primeSounds(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  if (!soundsOn()) return;
  for (const name of SOUND_NAMES) void load(ctx, name);
}

export function playSound(name: SoundName, options: PlayOptions = {}): void {
  const { delay = 0, gain = 1, rate = 1 } = options;
  if (!soundsOn()) return;
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();

  // Fix the moment now, before the clip has been decoded, so that a batch of
  // cues holds its shape even if the first of them waits on the network.
  const when = ctx.currentTime + Math.max(0, delay);
  void load(ctx, name).then((buffer) => {
    if (!buffer || !master || !context || !soundsOn()) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const level = context.createGain();
    level.gain.value = gain;
    source.connect(level).connect(master);
    source.start(Math.max(when, context.currentTime));
  });
}
