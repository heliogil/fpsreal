# Vistas do viewer — glossário, escopo, e o eixo da espessura da GPU

**Data:** 2026-08-08 (v3)
**Componentes:** `apps/web/src/components/interior/{GabineteVivo,TopDownInset}.tsx` · `services/ingestion/routers/interior.py`

---

## 0. GLOSSÁRIO — leia antes de tudo

Esta confusão de nomes custou trabalho jogado fora **três vezes** numa sessão só. Fica fixada aqui:

| Termo do founder | O que é | Componente | Nome no código |
|---|---|---|---|
| **"vista frontal"** | a face onde fica o **VIDRO** do gabinete (painel lateral) — vê-se a placa-mãe de chapa, a GPU deitada, o cooler, a fonte | **`GabineteVivo.tsx`** | "lateral" (profundidade × altura) |
| "vista de cima" / aérea | olhando o gabinete de cima | `TopDownInset.tsx` | superior (profundidade × largura) |

**Quando o founder diz "frontal", é a vista do VIDRO.** Não é olhar o gabinete de frente.

**Escopo:**
- `GabineteVivo` (vista do vidro) — **principal, e o único requisito para lançar.** É onde o esforço vai.
- `TopDownInset` (superior) — em escopo. Renderiza também nos cards compactos.
- ~~`FrontalInset`~~ (largura × altura, olhando o gabinete de frente) — **fora do escopo, removida em 2026-08-08.** Não recriar.

---

## 1. Correção de premissa (histórico das versões anteriores)

- A **v1** deste spec propunha *construir* uma vista superior e hover sincronizado. Ambos **já existiam** (`TopDownInset.tsx`, montada em `GabineteVivo`, com `hovered` partilhado). Mesmo erro do spec anterior, que propunha um pipeline OpenCV com o `LLMVisionAdapter` já existindo: **verificar o código antes de especificar.**
- A **v2** achou o problema real (secção 2), mas ainda tratava a vista largura × altura como valiosa. Ela está fora do escopo.

A vista superior não aparecia pro founder porque as insets eram gated por `!compact`, e a página de resultados usa `compact`.

---

## 2. O achado técnico: a espessura da GPU estava em dois eixos ao mesmo tempo

Uma grandeza física ocupa **um** eixo. `thickness_mm` (= `slots × 20.32`) era desenhada em dois:

| Onde | Eixo | Correto? |
|---|---|---|
| `GabineteVivo` (vista do vidro) | **Z** — altura da barra | ✅ sim |
| `TopDownInset` (superior) | **Y** — bandeja→tampa | ❌ não |

Slots são contados no *bracket* traseiro e **empilham na vertical**. Uma placa 3.5-slot é grossa **para baixo** a partir do slot PCIe. Logo `thickness_mm` é **Z**, e o seu lugar é a vista do vidro.

O que realmente se estende da bandeja até a tampa (**Y**) é a **altura do cartão** (~125–140mm), que **não existe no catálogo** (`specs` de gpu: `bus, fps_1080p_agg, length_mm, slots, tdp_w, thickness_mm, vram_gb`).

### Consequência medida (não hipótese)

`clearances.gpu_side = case_width − gpu_thick`, limiar `is_tight: rem < 12.0` (`interior.py:151`).

Valores reais: largura útil dos 4 gabinetes **165 / 170 / 175 / 180mm**; espessura das GPUs **51–71mm**:

```
folga = 165…180 − 51…71  =  94…129 mm      (limiar de "apertado": 12 mm)
```

**Nunca dispara.** Estava no ar como se fosse informação. No backend o mesmo valor alimenta `side_pen`, que só pesa abaixo de 35mm — logo **também sempre 0**, e remover a exibição não altera nenhum número.

A docstring do próprio `TopDownInset` já dizia que a espessura não devia ser estimada e que a GPU devia aparecer "faixa fina, sem número" — mas o código desenhava com número, deixando o ramo honesto inalcançável. **A intenção documentada estava certa; a implementação tinha derivado dela.**

---

## 3. O que foi feito (opção A — aprovada)

1. **`TopDownInset`**: para de desenhar a espessura como extensão bandeja→tampa com cota; deixa de consumir `gpu_side`. Usa sempre o ramo honesto (faixa fina, sem número), como a docstring já mandava.
2. **`GabineteVivo`**: sai o chip "folga até a tampa". A linha "espessura · 3.5-slot · ~71mm típico" **fica** — ali é a vista do vidro, onde a espessura está no plano e é correta.
3. **Vista superior nos cards**: deixa de ser gated por `!compact`. A altura do cooler contra a largura útil é restrição de **compatibilidade** (o cooler pode não caber), e é na comparação lado a lado que decide. Wrapper leva `gv-compact` pro detalhe fino sumir no tamanho pequeno.
4. **`FrontalInset` removida** — fora do escopo.

**Opção B (adiada):** adicionar `card_height_mm` ao catálogo (ou default por form factor) e recalcular `gpu_side` com ela, tornando a folga real. Exige mudança no `interior.py` + seed e **rebuild/redeploy do container `pcb_api`** — a mesma pendência que o commit `65bbacf` já tem aberta.

---

## 4. A folga que vale de verdade

A do **cooler**, e é o argumento inteiro pra vista superior existir: ali a medida está no plano e o número **dispara**.

```
DeepCool AK400 (155mm)  em  NZXT H5 Flow (165mm)  →  10mm    ← apertado (limiar 15mm)
Peerless Assassin (157mm) em NZXT H5 Flow (165mm) →   8mm    ← apertado
```

---

## 5. Princípios que NÃO mudam

- **Integridade dimensional:** toda extensão desenhada é dimensão real em mm, no eixo em que ela fisicamente está. Uma grandeza não aparece em dois eixos.
- **Não desenhar o que não se sabe:** sem dado de altura de cartão, não se inventa a extensão nem a cota.
- **Genérico por tamanho:** um desenho por categoria, só o tamanho muda — sem estética por modelo.
- **Estimativa, nunca medição:** rótulos e `aria-label` explícitos, incluindo o selo "derivado" da largura útil.

## 6. Verificação

- `npx tsc --noEmit` limpo. ✅
- Nenhuma vista desenha `thickness_mm` fora do eixo Z. ✅ (verificado por grep: só sobra na vista do vidro)
- Folgas exibidas podem de fato disparar (cooler dispara; `gpu_side` saiu). ✅
- HTML servido: 3 insets superiores na página de resultados, 0 da vista removida. ✅

## 7. Fora de escopo

- A vista largura × altura (olhar o gabinete de frente). Removida.
- Construir vistas novas — as que ficam já existem.
- Reabrir a forma da GPU por ajuste manual de coordenadas (postmortem em `2026-08-07-viewer-2d-camadas-design.md`).
- Alterar o schema do descritor de aparência.
