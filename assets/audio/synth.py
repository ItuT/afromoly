"""
A small synthesis kit: enough oscillators, noise, envelopes and filters to
build a board game's worth of sound effects out of nothing.

Signals are plain lists of floats nominally in [-1, 1], mono, at SAMPLE_RATE.
Nothing here needs a library beyond the standard one, so the sounds rebuild on
any machine with Python on it.
"""

import array
import math
import random
import wave

# 32 kHz keeps a die's clatter and a card's rustle bright while costing a third
# less than CD rate. The clips are one-shots, so the whole set is small.
SAMPLE_RATE = 32_000


def frames(seconds):
    return max(1, int(round(seconds * SAMPLE_RATE)))


def silence(seconds):
    return [0.0] * frames(seconds)


def add(base, clip, at=0.0, gain=1.0):
    """Mix `clip` into `base` at a time in seconds, lengthening base if needed."""
    start = int(round(at * SAMPLE_RATE))
    end = start + len(clip)
    if end > len(base):
        base.extend([0.0] * (end - len(base)))
    for i, value in enumerate(clip):
        base[start + i] += value * gain
    return base


# ------------------------------------------------------------------ sources #


def _hz(freq, u):
    """A frequency argument is either a constant or a curve over the clip."""
    return freq(u) if callable(freq) else freq


def tone(seconds, freq, *, shape="sine", gain=1.0):
    """One oscillator. `freq` may be a callable taking 0..1 for a glide."""
    n = frames(seconds)
    out = [0.0] * n
    phase = 0.0
    step = 2 * math.pi / SAMPLE_RATE
    for i in range(n):
        phase += step * _hz(freq, i / n)
        if shape == "sine":
            value = math.sin(phase)
        elif shape == "triangle":
            value = 2 / math.pi * math.asin(math.sin(phase))
        elif shape == "square":
            value = 1.0 if math.sin(phase) >= 0 else -1.0
        elif shape == "saw":
            value = (phase / math.pi) % 2 - 1
        else:
            raise ValueError(f"unknown shape {shape!r}")
        out[i] = value * gain
    return out


def noise(seconds, *, gain=1.0, rng=random):
    return [rng.uniform(-1.0, 1.0) * gain for _ in range(frames(seconds))]


def glide(start, end, *, curve="exp"):
    """A frequency curve from start to end, exponential by default so that a
    fall sounds even to the ear rather than dawdling at the bottom."""
    if curve == "linear":
        return lambda u: start + (end - start) * u
    ratio = end / start
    return lambda u: start * (ratio ** u)


# ---------------------------------------------------------------- envelopes #


def strike(clip, *, attack=0.002, tau=0.1, hold=0.0):
    """A percussive envelope: a fast ramp in, an optional flat top, then an
    exponential tail. Applied in place, and returned for chaining."""
    n = len(clip)
    rise = max(1, frames(attack))
    flat = frames(hold) if hold else 0
    for i in range(n):
        if i < rise:
            gain = i / rise
        elif i < rise + flat:
            gain = 1.0
        else:
            gain = math.exp(-(i - rise - flat) / SAMPLE_RATE / max(tau, 1e-4))
        clip[i] *= gain
    return clip


def swell(clip, *, attack=0.05, release=0.15):
    """A softer envelope for anything that should arrive rather than hit."""
    n = len(clip)
    rise = max(1, frames(attack))
    fall = max(1, frames(release))
    for i in range(n):
        gain = min(1.0, i / rise)
        left = n - i
        if left < fall:
            gain *= left / fall
        clip[i] *= gain
    return clip


def tremolo(clip, rate, depth=0.5):
    for i in range(len(clip)):
        clip[i] *= 1 - depth + depth * (0.5 + 0.5 * math.sin(2 * math.pi * rate * i / SAMPLE_RATE))
    return clip


# ------------------------------------------------------------------ filters #


def lowpass(clip, cutoff):
    """One pole, which is gentle enough to take the glare off noise without
    making it sound like it is behind a door."""
    a = math.exp(-2 * math.pi * cutoff / SAMPLE_RATE)
    out = []
    last = 0.0
    for value in clip:
        last = value * (1 - a) + last * a
        out.append(last)
    return out


def highpass(clip, cutoff):
    low = lowpass(clip, cutoff)
    return [value - low[i] for i, value in enumerate(clip)]


def bandpass(clip, low, high):
    return highpass(lowpass(clip, high), low)


# ------------------------------------------------------------------- voices #


def knock(seconds, freq, *, rng, bright=1.0, tau=0.045, gain=1.0):
    """Something hard hitting something wooden: a short noise transient with two
    decaying partials under it. The die, the gavel, the stamp.

    The transient is deliberately the quieter half. Louder, and every knock in
    the set turns into the same white click; the pitch is what tells a die from
    a gavel from a van door."""
    out = strike(bandpass(noise(seconds, rng=rng), 250 * bright, 3800 * bright), attack=0.0005, tau=tau * 0.35)
    out = [value * 0.4 for value in out]
    add(out, strike(tone(seconds, freq, gain=0.9), attack=0.001, tau=tau))
    add(out, strike(tone(seconds, freq * 1.94, gain=0.3), attack=0.001, tau=tau * 0.6))
    return [value * gain for value in out]


def chime(seconds, freq, *, gain=1.0, tau=None):
    """A struck bell, near enough: a couple of stretched partials."""
    tau = tau if tau is not None else seconds * 0.4
    out = strike(tone(seconds, freq, gain=0.6), attack=0.004, tau=tau)
    add(out, strike(tone(seconds, freq * 2.01, gain=0.22), attack=0.004, tau=tau * 0.6))
    add(out, strike(tone(seconds, freq * 3.02, gain=0.10), attack=0.004, tau=tau * 0.35))
    return [value * gain for value in out]


def horn(seconds, freq, *, gain=1.0):
    """A minibus hooter: a saw with a little grit, opening and closing."""
    out = tone(seconds, freq, shape="saw", gain=0.5)
    add(out, tone(seconds, freq * 1.005, shape="saw", gain=0.35))
    add(out, tone(seconds, freq * 2, shape="square", gain=0.12))
    return [value * gain for value in swell(lowpass(out, 2600), attack=0.02, release=0.08)]


# ------------------------------------------------------------------- output #


def _limit(clip, ceiling=0.92):
    """Tame peaks with a soft knee rather than clipping them square."""
    return [ceiling * math.tanh(value / ceiling) for value in clip]


def write_wav(path, clip, *, peak=0.85, tail=0.006):
    """Normalise, fade the last few milliseconds so nothing ends on a click,
    and write 16-bit mono."""
    clip = _limit(list(clip))
    loudest = max((abs(value) for value in clip), default=0.0)
    if loudest > 0:
        scale = peak / loudest
        clip = [value * scale for value in clip]
    fade = min(len(clip), frames(tail))
    for i in range(fade):
        clip[len(clip) - fade + i] *= 1 - i / fade

    samples = array.array("h", (int(max(-1.0, min(1.0, value)) * 32767) for value in clip))
    with wave.open(path, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(samples.tobytes())
    return len(samples)
