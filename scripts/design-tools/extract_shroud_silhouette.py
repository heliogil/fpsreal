#!/usr/bin/env python3
"""
extract_shroud_silhouette.py — extrai a silhueta (pontos normalizados 0..1)
de uma peça texturizada (aletas de dissipador, grelha, etc.) numa foto real,
pra virar path SVG em PartMockups.tsx sem depender de marcação manual.

IDEIA: material liso (plástico da armadura) tem baixa energia de textura;
material com aletas/grelha tem alta energia (bordas repetidas, alto
contraste). Separa os dois com Sobel + limiar automático de Otsu (sem
número mágico chutado), limpa ruído com morfologia, simplifica a curva
resultante com approxPolyDP (Douglas-Peucker) pra virar poucos pontos
utilizáveis num path SVG.

Uso:
    python3 extract_shroud_silhouette.py <imagem> [--crop x0 y0 x1 y1]
                                          [--epsilon 9.0] [--smooth 25]

Saída:
    - imprime os pontos normalizados (x_frac, y_frac) prontos pra colar
      num array de pontos tipo o `armorPath` de PartMockups.tsx
    - salva <imagem>_boundary.png com a curva detectada sobreposta, pra
      conferir visualmente ANTES de confiar no resultado — sempre olhar
      essa imagem antes de usar os pontos.

Requer: opencv-python, numpy (ver requirements.txt ao lado deste script).
"""
import argparse
import sys

import cv2
import numpy as np


def extract_silhouette(
    image_path: str,
    crop: tuple[int, int, int, int] | None = None,
    epsilon: float = 9.0,
    smooth_win: int = 25,
) -> list[tuple[float, float]]:
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    H, W = gray.shape

    x0, y0, x1, y1 = crop if crop else (0, 0, W, H)
    sub = gray[y0:y1, x0:x1]
    h, w = sub.shape

    # energia de textura = magnitude do gradiente, acumulada numa janela
    # vertical — material com aletas tem picos de borda repetidos; plástico
    # liso não.
    gx = cv2.Sobel(sub, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(sub, cv2.CV_32F, 0, 1, ksize=3)
    gmag = cv2.magnitude(gx, gy)
    energy = cv2.boxFilter(gmag, -1, (5, 15))
    energy_u8 = cv2.normalize(energy, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    # limiar automático (Otsu) — nada de threshold chutado na mão
    _, textured_mask = cv2.threshold(
        energy_u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )

    # abre pra tirar ruído fino, fecha pra unir a regiao texturizada
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    clean = cv2.morphologyEx(textured_mask, cv2.MORPH_OPEN, kernel)
    clean = cv2.morphologyEx(
        clean, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    )

    # fronteira: por coluna, varre de baixo pra cima e pega a PRIMEIRA
    # transição pra "com textura" (não o topo global — isso ignora blocos
    # sólidos que tapam a peça texturizada por trás)
    boundary = np.full(w, h - 1, dtype=np.float32)
    for x in range(w):
        col = clean[:, x]
        y = h - 1
        while y >= 0 and col[y] == 0:
            y -= 1
        boundary[x] = y if y >= 0 else h - 1

    boundary_smooth = cv2.blur(boundary.reshape(1, -1), (smooth_win, 1)).flatten()
    curve = np.array([[x, boundary_smooth[x]] for x in range(w)], dtype=np.float32)
    approx = cv2.approxPolyDP(curve.reshape(-1, 1, 2), epsilon=epsilon, closed=False)
    simple_pts = approx.reshape(-1, 2)

    # visualização — SEMPRE conferir antes de confiar no resultado
    vis = cv2.imread(image_path)
    abs_pts = np.array(
        [[int(px) + x0, int(py) + y0] for px, py in simple_pts], dtype=np.int32
    )
    cv2.polylines(vis, [abs_pts], False, (0, 0, 255), 2)
    for pt in abs_pts:
        cv2.circle(vis, tuple(pt), 4, (0, 255, 255), -1)
    out_path = image_path.rsplit(".", 1)[0] + "_boundary.png"
    cv2.imwrite(out_path, vis)
    print(f"conferência visual salva em: {out_path}", file=sys.stderr)

    return [(float(px / w), float(py / h)) for px, py in simple_pts]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("image")
    ap.add_argument("--crop", nargs=4, type=int, metavar=("X0", "Y0", "X1", "Y1"))
    ap.add_argument("--epsilon", type=float, default=9.0)
    ap.add_argument("--smooth", type=int, default=25)
    args = ap.parse_args()

    crop = tuple(args.crop) if args.crop else None
    pts = extract_silhouette(args.image, crop, args.epsilon, args.smooth)
    print(f"{len(pts)} pontos:")
    for fx, fy in pts:
        print(f"  [{fx:.3f}, {fy:.3f}],")


if __name__ == "__main__":
    main()
