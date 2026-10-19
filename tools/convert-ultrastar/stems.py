#!/usr/bin/env python3
"""Split one song into the six stems the EverythingStar converter names.

Run inside WSL with the StemForge virtualenv (it owns the Demucs install):

    /home/happy/StemForge/.venv/bin/python stems.py \
        --audio /mnt/c/.../audio.mp3 --out /mnt/c/.../song-folder \
        --preview-ms 56800 --cover /mnt/c/.../cover.jpg \
        --license /mnt/c/.../license.txt

Writes, in the output folder:

    song.ogg      the "other" / backing stem (Guitar Hero convention)
    vocals.ogg
    guitar.ogg
    bass.ogg
    drums.ogg
    keys.ogg      Demucs' piano stem
    preview.ogg   30 s of the full mix from --preview-ms
    album.png     512x512 from the cover
    stems.json    what each file is, plus measured stats

The six stems sum back to the source mix (up to Demucs' own error), so a game
that plays all of them hears the song. A common gain is applied to every stem
when the peak would otherwise clip, which keeps the sum intact.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

sys.path.insert(0, "/home/happy/StemForge")

from pipelines.demucs_pipeline import DemucsConfig, DemucsPipeline  # noqa: E402
from utils.audio_io import read_audio  # noqa: E402

SR = 44_100
PREVIEW_SECONDS = 30
MODEL = "htdemucs_6s"
# Demucs name -> the file the games expect.
FILES = {
    "vocals": "vocals.ogg",
    "guitar": "guitar.ogg",
    "bass": "bass.ogg",
    "drums": "drums.ogg",
    "piano": "keys.ogg",
    "other": "song.ogg",
}


def decode(path: pathlib.Path) -> np.ndarray:
    audio, _ = read_audio(path, target_rate=SR, mono=False)
    return audio


def rms_db(audio: np.ndarray) -> float:
    return float(20 * np.log10(max(float(np.sqrt(np.mean(audio**2))), 1e-9)))


def encode(wav: pathlib.Path, dest: pathlib.Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
            "-c:a", "libvorbis", "-q:a", "6", str(dest),
        ],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview-ms", type=int, default=-1)
    parser.add_argument("--cover")
    parser.add_argument("--copy-cover", action="store_true")
    parser.add_argument("--license")
    args = parser.parse_args()

    audio_path = pathlib.Path(args.audio)
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    pipe = DemucsPipeline()
    pipe.configure(
        DemucsConfig(
            model_name=MODEL,
            stems=list(FILES),
            output_dir=out,
            sample_rate=SR,
            bit_depth=24,
        )
    )
    pipe.load_model()
    print(f"model {MODEL} loaded", flush=True)
    mix = pipe._preprocess(audio_path)
    raw = pipe._run_inference(mix)
    print("inference done", flush=True)

    source = decode(audio_path)
    n = source.shape[1]
    for name, stem in list(raw.items()):
        if stem.shape[1] < n:
            stem = np.pad(stem, ((0, 0), (0, n - stem.shape[1])))
        raw[name] = stem[:, :n]

    peak = max(
        max(float(np.max(np.abs(stem))) for stem in raw.values()),
        float(np.max(np.abs(sum(raw.values())))),
    )
    gain = (0.98 / peak) if peak > 0.98 else 1.0
    for name in raw:
        raw[name] = raw[name] * gain

    duration_ms = round(n / SR * 1000)
    preview_ms = args.preview_ms
    if preview_ms < 0:
        preview_ms = round(duration_ms * 0.3)
    preview_ms = int(max(20_000, min(preview_ms, max(20_000, duration_ms - PREVIEW_SECONDS * 1000))))

    stats = {}
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = pathlib.Path(tmp)
        for name, filename in FILES.items():
            stem = raw[name]
            stats[name] = {
                "file": filename,
                "rmsDb": round(rms_db(stem), 2),
                "peak": round(float(np.max(np.abs(stem))), 4),
            }
            wav = tmpdir / f"{name}.wav"
            sf.write(wav, stem.T.astype(np.float32), SR, subtype="FLOAT")
            encode(wav, out / filename)

        total = np.zeros_like(source)
        for stem in raw.values():
            total += stem
        corr = float(np.corrcoef(total[0], source[0])[0, 1])

        start = int(round(preview_ms / 1000 * SR))
        preview = np.clip(source[:, start:start + PREVIEW_SECONDS * SR] * gain, -1.0, 1.0)
        wav = tmpdir / "preview.wav"
        sf.write(wav, preview.T.astype(np.float32), SR, subtype="FLOAT")
        encode(wav, out / "preview.ogg")

    album = None
    if args.cover:
        if args.copy_cover:
            source_cover = pathlib.Path(args.cover)
            album = f"album{source_cover.suffix.lower()}"
            shutil.copy2(source_cover, out / album)
        else:
            album = "album.png"
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error", "-i", args.cover,
                    "-vf", "scale=512:512:force_original_aspect_ratio=increase,crop=512:512",
                    "-frames:v", "1", str(out / album),
                ],
                check=True,
            )
    if args.license and pathlib.Path(args.license).exists():
        shutil.copy2(args.license, out / "license.txt")

    document = {
        "model": MODEL,
        "sampleRate": SR,
        "durationMs": duration_ms,
        "previewStartMs": preview_ms,
        "commonGain": round(gain, 6),
        "album": album,
        "files": dict(FILES),
        "stats": stats,
        "sumVsSourceCorrelation": round(corr, 5),
    }
    (out / "stems.json").write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "durationMs": duration_ms,
        "previewStartMs": preview_ms,
        "commonGain": round(gain, 4),
        "correlation": round(corr, 5),
    }))


if __name__ == "__main__":
    main()
