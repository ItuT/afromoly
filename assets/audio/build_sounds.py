"""
Build every Afromoly sound effect from scratch and write it into the web client.

    python3 build_sounds.py                 # every sound
    python3 build_sounds.py --only dice     # just one
    python3 build_sounds.py --out some/dir

Or just use ./export.sh.

Nothing here is a recording. Every clip is synthesised from oscillators and
noise, the same way the models are built from primitives, so the .wav files in
apps/web/public/audio are outputs rather than sources: re-running this script
reproduces them byte for byte. Edit the script, not the .wav.

Each sound is a moment at the rank, so they share a palette: wood and coins for
anything that goes well, metal and low tones for anything that costs you.
"""

import argparse
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import synth as S  # noqa: E402

DEFAULT_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "web", "public", "audio")


# --------------------------------------------------------------- the sounds #


def dice(rng):
    """Two dice thrown into the well: knocks that crowd together as the bounces
    get shorter, then one last settling tap. About as long as the client's
    dice animation, so the last tap lands as they come to rest."""
    out = S.silence(1.2)
    for die, (pitch, offset) in enumerate(((520, 0.02), (610, 0.07))):
        at = offset
        gap = 0.21
        level = 1.0
        while at < 0.86:
            S.add(
                out,
                S.knock(0.14, pitch * rng.uniform(0.93, 1.08), rng=rng, tau=0.035),
                at=at,
                gain=level * rng.uniform(0.8, 1.0),
            )
            at += gap * rng.uniform(0.85, 1.15)
            gap *= 0.8
            level *= 0.86
        S.add(out, S.knock(0.2, pitch * 0.92, rng=rng, tau=0.05), at=0.88 + die * 0.04, gain=0.5)
    # The board itself, taking the weight.
    S.add(out, S.strike(S.lowpass(S.noise(0.3, rng=rng), 160), attack=0.004, tau=0.09), gain=0.5)
    return out


def hop(rng):
    """One tile of a piece's walk. Played up to a dozen times in a row, so it
    has to be small enough to become a rhythm rather than a nuisance."""
    out = S.strike(S.tone(0.09, S.glide(660, 590), gain=0.5), attack=0.001, tau=0.02)
    S.add(out, S.strike(S.bandpass(S.noise(0.05, rng=rng), 900, 4000), attack=0.0005, tau=0.006), gain=0.2)
    return out


def land(rng):
    """The piece settling onto the tile it was sent to."""
    out = S.strike(S.tone(0.3, S.glide(260, 90), gain=0.9), attack=0.002, tau=0.075)
    S.add(out, S.strike(S.lowpass(S.noise(0.12, rng=rng), 2200), attack=0.001, tau=0.02), gain=0.4)
    return out


def cash_in(rng):
    """Money arriving: three notes up, with coins on top."""
    out = S.silence(0.62)
    for i, freq in enumerate((784, 988, 1319)):
        S.add(out, S.chime(0.42, freq, tau=0.14), at=i * 0.075, gain=0.55)
    for _ in range(7):
        S.add(out, S.knock(0.06, rng.uniform(2400, 4200), rng=rng, tau=0.012), at=rng.uniform(0.02, 0.34), gain=0.22)
    return out


def cash_out(rng):
    """Money leaving: the same shape, downward, and duller."""
    out = S.silence(0.5)
    for i, freq in enumerate((523, 392)):
        S.add(out, S.strike(S.lowpass(S.tone(0.34, freq, shape="triangle"), 2200), attack=0.006, tau=0.11), at=i * 0.11, gain=0.5)
    S.add(out, S.strike(S.bandpass(S.noise(0.22, rng=rng), 600, 3000), attack=0.02, tau=0.07), at=0.06, gain=0.16)
    return out


def buy(rng):
    """A deed stamped: the thump of the stamp, then the clerk's little bell."""
    out = S.knock(0.3, 230, rng=rng, tau=0.06, gain=1.0)
    S.add(out, S.strike(S.lowpass(S.noise(0.1, rng=rng), 900), attack=0.001, tau=0.03), gain=0.5)
    S.add(out, S.chime(0.35, 1046, tau=0.11), at=0.09, gain=0.4)
    return out


def build(rng):
    """A Quantum van or a depot going up: two clunks and the ground taking it."""
    out = S.knock(0.26, 175, rng=rng, tau=0.055, bright=0.6)
    S.add(out, S.knock(0.26, 132, rng=rng, tau=0.07, bright=0.6), at=0.11, gain=0.85)
    S.add(out, S.strike(S.lowpass(S.noise(0.35, rng=rng), 130), attack=0.003, tau=0.1), gain=0.6)
    return out


def card(rng):
    """A card pulled off the top of a deck, and flicked over."""
    out = S.swell(S.bandpass(S.noise(0.24, rng=rng), 900, 7000), attack=0.05, release=0.14)
    out = [value * 0.7 for value in out]
    S.add(out, S.strike(S.bandpass(S.noise(0.1, rng=rng), 1500, 9000), attack=0.001, tau=0.02), at=0.22, gain=0.55)
    return out


def impound(rng):
    """The JMPD gate: struck metal, inharmonic, ringing on longer than you want
    it to."""
    out = S.silence(1.0)
    for freq, level, tau in ((123, 0.5, 0.42), (287, 0.35, 0.34), (461, 0.28, 0.26), (712, 0.18, 0.2), (1103, 0.12, 0.14)):
        S.add(out, S.strike(S.tone(0.95, freq), attack=0.002, tau=tau), gain=level)
    S.add(out, S.strike(S.bandpass(S.noise(0.2, rng=rng), 700, 9000), attack=0.0005, tau=0.03), gain=0.45)
    S.add(out, S.strike(S.tone(0.3, S.glide(90, 55)), attack=0.003, tau=0.1), gain=0.5)
    return out


def release(rng):
    """The gate opening again, in the same metal but rising."""
    out = S.silence(0.62)
    for i, freq in enumerate((587, 880)):
        S.add(out, S.chime(0.5, freq, tau=0.2), at=i * 0.12, gain=0.5)
    S.add(out, S.swell(S.bandpass(S.noise(0.4, rng=rng), 2500, 8000), attack=0.12, release=0.25), gain=0.07)
    return out


def bid(rng):
    """A bid on the block. Dry, quick, and easy to hear four of in a row."""
    return S.knock(0.14, 780, rng=rng, tau=0.022, gain=0.9)


def alert(rng):
    """Something has gone against you but has not finished you: the substation
    out, or a debt you have to raise."""
    out = S.silence(0.52)
    for i in range(2):
        pulse = S.lowpass(S.tone(0.2, 172 - i * 8, shape="square"), 1300)
        S.add(out, S.strike(pulse, attack=0.006, tau=0.07), at=i * 0.19, gain=0.42)
    return out


def bankrupt(rng):
    """Out of the game: a long fall, wobbling, and then the floor."""
    out = S.tone(0.85, S.glide(415, 98), shape="triangle", gain=0.6)
    S.add(out, S.tone(0.85, S.glide(208, 49), gain=0.35))
    S.tremolo(out, 7.5, depth=0.35)
    S.swell(out, attack=0.01, release=0.3)
    S.add(out, S.strike(S.lowpass(S.noise(0.3, rng=rng), 140), attack=0.003, tau=0.09), at=0.8, gain=0.7)
    return out


def win(rng):
    """The Undisputed Transit Tycoon of Gauteng, announced by the rank's own
    instrument: three hooter stabs up to the last, held one, over coins."""
    out = S.silence(1.5)
    for at, freq, seconds in ((0.0, 392, 0.2), (0.2, 523, 0.2), (0.42, 659, 0.75)):
        S.add(out, S.horn(seconds, freq), at=at, gain=0.55)
        S.add(out, S.horn(seconds, freq * 1.5), at=at, gain=0.22)
    for _ in range(14):
        S.add(out, S.knock(0.06, rng.uniform(2200, 4400), rng=rng, tau=0.012), at=rng.uniform(0.45, 1.15), gain=0.18)
    return out


# Names are the filenames the client asks for; keep them in step with
# apps/web/lib/sound.ts.
SOUNDS = {
    "dice": dice,
    "hop": hop,
    "land": land,
    "cash-in": cash_in,
    "cash-out": cash_out,
    "buy": buy,
    "build": build,
    "card": card,
    "impound": impound,
    "release": release,
    "bid": bid,
    "alert": alert,
    "bankrupt": bankrupt,
    "win": win,
}


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=DEFAULT_OUT, help="directory to write .wav files into")
    parser.add_argument("--only", help="build a single sound by name")
    args = parser.parse_args(argv)

    names = [args.only] if args.only else list(SOUNDS)
    unknown = [name for name in names if name not in SOUNDS]
    if unknown:
        parser.error(f"no such sound: {', '.join(unknown)}. Try one of {', '.join(SOUNDS)}")

    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)
    for name in names:
        # Seeded by name, so building one sound gives the same file as building
        # all of them.
        clip = SOUNDS[name](random.Random(f"afromoly:{name}"))
        path = os.path.join(out_dir, f"{name}.wav")
        written = S.write_wav(path, clip)
        print(f"{name:10s} {written / S.SAMPLE_RATE:5.2f}s  {os.path.getsize(path) / 1024:6.1f} KB  {path}")


if __name__ == "__main__":
    main(sys.argv[1:])
