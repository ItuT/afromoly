# Afromoly sounds

Every clip here is synthesised from oscillators and noise by a script, so the
`.wav` files are **outputs, not sources**. Edit `build_sounds.py` and re-run the
export; do not hand-edit a `.wav`, because the next build will overwrite it.

Nothing was recorded and nothing was sampled, which is also why there is no
licence to keep track of.

## Building

```bash
./export.sh            # every sound
./export.sh dice       # just one
PYTHON=python3.13 ./export.sh
```

That writes `.wav` files into `apps/web/public/audio`, which is where the web
client loads them from. Unlike the models, this needs no Blender and no
packages: `synth.py` is standard library only, and each sound is seeded by its
own name, so building one reproduces exactly the file a full build would.

## What gets built

| File | What it is |
| --- | --- |
| `dice.wav` | Two dice thrown into the well: knocks that crowd together as the bounces shorten, then a settling tap. As long as the client's dice animation |
| `hop.wav` | One tile of a piece's walk. Played up to a dozen times in a row, so it is small enough to become a rhythm |
| `land.wav` | The piece settling onto the tile it was sent to |
| `cash-in.wav` | Money arriving: three notes up, coins on top |
| `cash-out.wav` | Money leaving: the same shape downward, and duller |
| `buy.wav` | A deed stamped, then the clerk's bell |
| `build.wav` | A Quantum van or a Terminal Depot going up |
| `card.wav` | A card pulled off a deck and flicked over |
| `impound.wav` | The JMPD gate: struck metal, inharmonic, ringing on |
| `release.wav` | The same metal, opening, rising |
| `bid.wav` | A bid on the block. Dry and quick, so four in a row still read as four |
| `alert.wav` | Something against you that has not finished you: the substation out, a debt to raise |
| `bankrupt.wav` | A long fall, wobbling, and then the floor |
| `win.wav` | Three hooter stabs up to a held one, over coins |

## How they are put together

`synth.py` is the kit: oscillators, noise, envelopes, one-pole filters, and
three voices built from them — `knock` for anything wooden being hit, `chime`
for anything struck and ringing, `horn` for the rank's own instrument. The
sounds share a palette on purpose: wood and coins for whatever goes your way,
metal and low tones for whatever costs you.

Clips are written mono at 32 kHz, normalised to the same peak. That means the
files say nothing about how loud each one should be in the game; balance lives
in `LEVEL` in
[`apps/web/lib/useSounds.ts`](../../apps/web/lib/useSounds.ts), next to the
scoring.

## Keeping the client in step

`SOUND_NAMES` in [`apps/web/lib/sound.ts`](../../apps/web/lib/sound.ts) lists
the same names as `SOUNDS` here. Adding a sound means adding it in both places,
and the web test suite fails if the client names a clip that no build produces.
