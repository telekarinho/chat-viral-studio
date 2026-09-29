"""Transcreve a fala de um trecho com tempo por PALAVRA (faster-whisper, CPU). Saída: JSON [{text,start,end}] em segundos.

Uso: python transcribe.py <audio.wav> <prompt-com-o-roteiro>
O roteiro vai como initial_prompt: melhora a grafia (nomes, marca), mas a legenda segue o que foi DITO.
"""
import json
import os
import sys

from faster_whisper import WhisperModel


def main() -> None:
    audio, prompt = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "")
    model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device="cpu", compute_type="int8")
    segments, _ = model.transcribe(
        audio, language="pt", word_timestamps=True, vad_filter=True, beam_size=5, initial_prompt=prompt[:600] or None,
    )
    words = [{"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)} for s in segments for w in (s.words or []) if w.word.strip()]
    json.dump(words, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
