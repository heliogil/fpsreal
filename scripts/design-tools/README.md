# extract_shroud_silhouette.py

Extrai a silhueta de uma peça texturizada (aletas de dissipador, grelha,
armadura recortada) numa foto real de produto, e devolve pontos
normalizados (0..1) prontos pra virar um path SVG paramétrico em
`apps/web/src/components/interior/PartMockups.tsx` — sem precisar marcar
a foto na mão.

## Por quê

As primitivas de forma do viewer (`shroudPath`, `armorPath`, `fanBlades`)
precisam refletir o que uma peça real mostra num corte específico, não
inventar textura. Comparar contra foto é obrigatório (ver
`docs/superpowers/specs/2026-08-07-viewer-2d-camadas-design.md`), mas
tirar essas coordenadas no olho — ou pedir pro founder marcar de vermelho
toda vez — não escala. Este script automatiza essa etapa.

## Como funciona

1. Converte a foto pra escala de cinza e calcula a energia de textura
   (magnitude do gradiente Sobel, acumulada numa janela vertical).
   Material com aletas/grelha tem picos de borda repetidos → energia
   alta. Plástico liso → energia baixa.
2. Separa "texturizado" de "liso" com limiar automático de Otsu (sem
   número mágico).
3. Limpa ruído com abertura morfológica (tira speckle fino) e fecha
   (une a região texturizada).
4. Por coluna de pixel, acha a PRIMEIRA transição pra "texturizado"
   varrendo de baixo pra cima — essa é a fronteira armadura/aletas.
5. Simplifica a curva resultante com `approxPolyDP` (Douglas-Peucker)
   pra virar poucos pontos (vértices de um path, não uma curva de
   milhares de pixels).
6. Sempre salva `<imagem>_boundary.png` com a curva sobreposta —
   **confira essa imagem antes de usar os pontos**. Se a curva não bater
   com o que se vê na foto, ajuste `--crop` (evita áreas com material
   diferente, tipo bracket metálico, que confunde o classificador) e/ou
   `--epsilon`/`--smooth`.

## Uso

```bash
cd scripts/design-tools
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python extract_shroud_silhouette.py foto.jpg \
  --crop X0 Y0 X1 Y1 \
  --epsilon 9.0 \
  --smooth 25
```

- `--crop`: restringe a análise à região da peça que importa (exclui
  fundo, texto de marca, ou peças de material diferente tipo bracket
  metálico — cada um desses confunde a energia de textura se entrar).
- `--epsilon`: quanto maior, menos pontos na simplificação (mais
  "limpo", menos fiel a ruído de textura). Comece em ~9 pra uma peça do
  tamanho de uma GPU numa foto ~600px de largura.
- `--smooth`: janela de suavização antes de simplificar. Maior = funde
  ondulações pequenas nos picos/vales principais.

## Limitação conhecida

Peças com material MUITO diferente dentro do crop (ex.: bracket de I/O
metálico com fendas, do lado da armadura de plástico) têm energia de
textura própria e confundem o classificador — exclua essas áreas do
`--crop` e desenhe-as separadamente no código (como o bracket já é
desenhado à parte em `PartMockups.tsx`, fora do `armorPath`).
