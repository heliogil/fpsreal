# Vistas ortográficas do viewer — corrigir o eixo da espessura da GPU

**Data:** 2026-08-08 (v2 — corrige a v1 do mesmo dia)
**Componentes:** `apps/web/src/components/interior/{GabineteVivo,TopDownInset,FrontalInset}.tsx` · `services/ingestion/routers/interior.py`
**Status:** v1 propunha construir uma vista superior. **Ela já existe.** Este documento substitui aquela premissa.

---

## 0. Correção de premissa (leia primeiro)

A v1 deste spec propunha criar `GabineteTopo.tsx` e implementar "hover sincronizado entre as vistas". Verificação no código:

**As três vistas ortográficas já existem, e o hover já é compartilhado entre elas.**

| Vista | Componente | Plano | Estado |
|---|---|---|---|
| Lateral ("vista do vidro") | `GabineteVivo.tsx` | profundidade × altura | principal, sempre visível |
| **Superior (aérea)** | **`TopDownInset.tsx`** | profundidade × largura | **já existe**, montada em `GabineteVivo:1106`, oculta em `compact` |
| **Frontal** | **`FrontalInset.tsx`** | largura × altura | **já existe**, montada em `GabineteVivo:1115` |

O hover/foco já é partilhado pelas três (`hovered={focused ?? hovered}` nas duas insets). O comentário no próprio código diz: *"o `hovered` é partilhado pelas três vistas"*.

Ou seja: **o que o founder pediu ("adiciona a vista de cima") já está implementado.** Provavelmente não aparecia porque as insets só renderizam quando `!compact` — e a página de resultados usa `compact`.

Isto é o mesmo padrão do erro anterior (propor um pipeline OpenCV quando o `LLMVisionAdapter` já existia): **verificar o código antes de especificar.**

---

## 1. O que a verificação encontrou de fato: a espessura da GPU está em três eixos ao mesmo tempo

Uma grandeza física ocupa **um** eixo. `thickness_mm` (= `slots × 20.32`) é usada como três:

| Onde | Eixo em que é desenhada | Código |
|---|---|---|
| `GabineteVivo` (lateral) | **Z** (altura da barra) | `gpu_draw_h = gpu_thick` (commit `65bbacf`) |
| `TopDownInset` (superior) | **Y** (bandeja→tampa) | `height={gThick * s}` a partir de `trayY` (linha 87) |
| `FrontalInset` (frontal) | **Y** (disputa o vão) | docstring: *"a espessura da GPU (nº de slots)"* come a largura |

**Qual é o certo:** slots são contados no *bracket* traseiro, empilhados na **vertical**. Uma placa 3.5-slot é grossa **para baixo** a partir do slot PCIe. Logo `thickness_mm` é **Z** — a vista lateral está correta.

A dimensão que realmente se estende da bandeja até a tampa (**Y**) é a **altura da placa** (do conector PCIe à borda superior do cartão, ~125–140mm). **Essa não existe no catálogo** (chaves de `specs` em gpu: `bus, fps_1080p_agg, length_mm, slots, tdp_w, thickness_mm, vram_gb`).

### Consequência medida (não hipótese)

`clearances.gpu_side = case_width − gpu_thick`, com limiar `is_tight: rem < 12.0` (`interior.py:151`).

Valores reais do catálogo — largura útil dos 4 gabinetes: **165 / 170 / 175 / 180mm**; espessura das GPUs: **51–71mm**:

```
folga = 165…180 − 51…71  =  94…129 mm      (limiar de "apertado": 12 mm)
```

**A folga `gpu_side` nunca pode disparar.** Está no ar como se fosse informação, e é inerte.

Se usasse a altura real do cartão (~140mm numa flagship): `165 − 140 = 25mm` → folga significativa, capaz de ficar apertada. É exatamente a pergunta real *"minha placa alta deixa fechar a tampa lateral?"*.

### O código já sabia disso, e derivou

`TopDownInset.tsx`, docstring (linhas 13–15):

> *"A espessura da GPU **não é estimada** (não há dado no catálogo): a GPU aparece como faixa fina, **sem número**."*

Mas o código na linha 82 faz `if (gThick > 0)` e desenha **com** número (`~71mm típico`). O ramo honesto (linha 106, "espessura não estimada") é **inalcançável** para toda GPU do catálogo, porque todas têm `thickness_mm`. **A intenção documentada está certa; a implementação divergiu dela.**

---

## 2. Decisão: o que fazer

**Recomendação — opção A (honesta, sem backend):**

1. **Lateral:** mantém `thickness_mm` como Z. Está correto, nada muda.
2. **Superior e frontal:** param de desenhar a espessura como extensão Y com número. A GPU volta ao ramo honesto que a docstring descreve — faixa fina, sem cota — até existir dado de altura de cartão.
3. **`gpu_side`:** removida ou marcada como não-computável. Não mostrar folga que não pode disparar. (Consumida hoje em `GabineteVivo:232` e `TopDownInset:80`.)
4. O **cooler** continua sendo a peça-estrela das vistas nova/frontal — ali a medida está genuinamente no plano e a folga **dispara de verdade**: AK400 (155mm) num NZXT H5 (165mm) → **10mm**, abaixo do limiar de 15mm. Esse é o valor real destas vistas.

**Opção B (mais fiel, custa dado):** adicionar `card_height_mm` ao catálogo (ou default por form factor: ~125mm 2-slot, ~140mm 3-slot+), usar como extensão Y, e recalcular `gpu_side` com ela. Torna a folga real. Exige mudança no `interior.py` + seed, e **rebuild/redeploy do container `pcb_api`** — a mesma pendência já aberta pelo commit `65bbacf`.

**Opção C (não fazer nada):** rejeitada. Deixa no ar um número dimensionalmente errado e uma folga inerte.

**Sequência sugerida:** A agora (frontend, sem risco), B depois, junto do redeploy que o `gpu_thick` já exige.

---

## 3. Por que as insets não apareciam

`GabineteVivo:1104` e `:1113` envolvem as duas insets em `{!compact && (...)}`. A página de resultados renderiza `<GabineteVivo ... compact />`, então **só a lateral aparece ali**. Isso é deliberado (a spec anterior decidiu não poluir o card mini) e é provavelmente por isso que o founder não via a vista de cima.

**Decisão pendente do founder:** manter as insets só no detalhe, ou mostrá-las também em algum outro ponto? (Não é bug, é escolha de UX.)

---

## 4. Princípios que NÃO mudam

- **Integridade dimensional:** toda extensão desenhada é dimensão real em mm, no eixo em que ela fisicamente está. Uma grandeza não aparece em dois eixos.
- **Não desenhar o que não se sabe:** sem dado de altura de cartão, não se inventa a extensão nem a cota. (Lição desta sessão inteira.)
- **Genérico por tamanho:** um desenho por categoria, só o tamanho muda — sem estética por modelo.
- **Estimativa, nunca medição:** rótulos e `aria-label` seguem explícitos, incluindo o selo "derivado" da largura útil.

## 5. Verificação

- `npx tsc --noEmit` limpo.
- Conferir que nenhuma vista desenha `thickness_mm` fora do eixo Z.
- Conferir que folgas exibidas podem de fato disparar (a de cooler dispara; a de `gpu_side`, hoje, não).
- Extrair o SVG servido e mandar preview ao founder, como nas peças anteriores.

## 6. Fora de escopo

- Construir vistas novas — as três ortográficas já existem.
- Reabrir a forma da GPU da vista lateral por ajuste manual (ver postmortem em `2026-08-07-viewer-2d-camadas-design.md`).
- Alterar o schema do descritor de aparência.
