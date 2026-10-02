"""BPM das faixas da biblioteca: fluxo espectral + autocorrelação (60–180). Uso: python bpm.py selftest | python bpm.py <pasta com mp3>"""
import subprocess, sys, json, os
import numpy as np

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
SR = 22050
HOP = 256


def decode(path: str) -> np.ndarray:
    raw = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def onset_env(x: np.ndarray) -> np.ndarray:
    n_fft = 1024
    frames = 1 + (len(x) - n_fft) // HOP
    idx = np.arange(n_fft)[None, :] + HOP * np.arange(frames)[:, None]
    spec = np.abs(np.fft.rfft(x[idx] * np.hanning(n_fft), axis=1))
    logs = np.log1p(100 * spec)
    flux = np.maximum(0, np.diff(logs, axis=0)).sum(axis=1)
    flux -= np.convolve(flux, np.ones(16) / 16, mode="same")  # local mean removal
    return np.maximum(flux, 0)


def tempo(x: np.ndarray) -> tuple[float, float]:
    env = onset_env(x)
    env = env - env.mean()
    ac = np.correlate(env, env, mode="full")[len(env) - 1:]
    fps = SR / HOP
    lags = np.arange(len(ac))
    bpm = np.where(lags > 0, 60 * fps / np.maximum(lags, 1), 0)
    ok = (bpm >= 60) & (bpm <= 180)
    # mild prior around 110 BPM to resolve half/double ambiguity
    prior = np.exp(-0.5 * (np.log2(np.maximum(bpm, 1) / 110) / 0.9) ** 2)
    score = np.where(ok, ac * prior, -np.inf)
    lag = int(np.argmax(score))
    # parabolic refinement
    a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
    shift = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0
    best = 60 * fps / (lag + shift)
    conf = float(ac[lag] / ac[0]) if ac[0] > 0 else 0.0
    return best, conf


def clicks(bpm: float, seconds: float = 30) -> np.ndarray:
    x = np.random.default_rng(0).normal(0, 0.02, int(SR * seconds)).astype(np.float32)
    period = 60 / bpm
    t = 0.0
    while t < seconds - 0.05:
        i = int(t * SR)
        x[i:i + 400] += np.sin(2 * np.pi * 1000 * np.arange(400) / SR) * np.exp(-np.arange(400) / 80)
        t += period
    return x


if __name__ == "__main__":
    if sys.argv[1] == "selftest":
        for b in (72, 90, 100, 120, 128, 140):
            est, conf = tempo(clicks(b))
            print(f"synthetic {b}: {est:.1f} (conf {conf:.2f})")
    else:
        out = {}
        for f in sorted(os.listdir(sys.argv[1])):
            if f.endswith(".mp3"):
                est, conf = tempo(decode(os.path.join(sys.argv[1], f)))
                out[f[:-4]] = {"bpm": round(est), "conf": round(conf, 2)}
        print(json.dumps(out, indent=1))
