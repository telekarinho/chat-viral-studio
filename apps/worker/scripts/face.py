"""Onde termina o rosto (queixo/barba) num trecho do vídeo, para a legenda nunca ficar em cima do rosto.

Uso: python face.py <video> <inicio_s> <fim_s>   (modelo em FACE_MODEL: YuNet .onnx do OpenCV Zoo, licença MIT)
Saída JSON: {"width": W, "height": H, "faceBottom"/"faceTop": fração 0–1 da altura (null = rosto não encontrado), "samples": n}
A caixa do YuNet vai da testa ao queixo; a barba passa do queixo (+18% da altura do rosto) e o alto da cabeça
fica acima da testa (+35%).
"""
import json
import os
import sys

import cv2

SAMPLES = 7
BEARD_EXTRA = 0.18
HEAD_EXTRA = 0.35
MIN_SCORE = 0.6
MIN_HITS = 2


def main() -> None:
    path, start, end = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    cap = cv2.VideoCapture(path)
    detector = None
    w, h = 0, 0  # tamanho do quadro JÁ girado (vídeo de celular vem com rotação nos metadados)
    bottoms: list[float] = []
    tops: list[float] = []
    for i in range(SAMPLES):
        t = start + (end - start) * (i + 0.5) / SAMPLES
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if not ok:
            continue
        h, w = frame.shape[:2]
        if detector is None:
            detector = cv2.FaceDetectorYN.create(os.environ["FACE_MODEL"], "", (w, h), MIN_SCORE)
        # vídeo noturno: realça o brilho antes de procurar o rosto
        boosted = cv2.convertScaleAbs(frame, alpha=1.6, beta=25)
        _, faces = detector.detect(boosted)
        if faces is not None and len(faces):
            x, y, bw, bh = max(faces, key=lambda f: f[2] * f[3])[:4]  # o maior rosto (quem fala)
            bottoms.append(min(1.0, float(y + bh * (1 + BEARD_EXTRA)) / h))
            tops.append(max(0.0, float(y - bh * HEAD_EXTRA) / h))
    cap.release()
    # o queixo mais baixo e a cabeça mais alta entre as amostras: texto em cima, legenda embaixo, o trecho todo
    # rosto achado em menos de 2 quadros = pode ser engano (escuro, borrado): melhor não confiar
    found = len(bottoms) >= MIN_HITS
    json.dump({"width": w, "height": h, "faceBottom": round(max(bottoms), 4) if found else None,
               "faceTop": round(min(tops), 4) if found else None, "samples": len(bottoms)}, sys.stdout)


if __name__ == "__main__":
    main()
