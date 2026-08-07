# Fase 1 — Vocabulário de Forma (GPU) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o vocabulário de forma primitivo (retângulo + círculos concêntricos) por duas primitivas paramétricas novas — pá de ventoinha e silhueta de shroud angular — começando pela categoria GPU, verificadas contra foto real antes de expandir pras próximas categorias (cooler, PSU) em planos subsequentes.

**Architecture:** Duas funções puras novas em `PartMockups.tsx` que devolvem JSX de `<path>` SVG a partir de parâmetros geométricos (raio, contagem de pás, caixa em mm→px). Sem estado, sem novas dependências — mesma arquitetura de todas as primitivas existentes (`bevel`, `FanDisc`). GPU (tier `gpuBody` e descritor `D_GPU`) passa a consumir essas primitivas em vez do desenho atual.

**Tech Stack:** TypeScript, React (JSX puro, sem hooks), SVG `<path>`. Next.js 14 já configurado no projeto (`apps/web`), sem framework de teste — verificação é compilação TypeScript + comparação visual contra foto de referência real.

## Global Constraints

- Nenhuma primitiva pode desenhar fora da caixa `Box` (`{x, y, w, h}`) recebida — a caixa é a dimensão real em mm convertida pra px; ultrapassá-la mentiria sobre o tamanho físico da peça (mesma regra do `bevel()` existente, `PartMockups.tsx:95-105`).
- Toda cor vem de token da marca (`var(--...)`) — nunca hex/rgb fixo (`PartMockups.tsx:23`, `visuals/schema.py` docstring).
- Nenhum campo novo no schema do descritor (`visuals/schema.py`) — as primitivas leem só os campos que já existem (`fan_style`, `fans`, `shroud`).
- Fallback em 3 camadas (descritor aprovado → tier → "em análise", `PartMockups.tsx:613-622`) não muda — só o que cada camada desenha.

---

### Task 1: Primitiva `fanBlades` — pá de ventoinha paramétrica

**Files:**
- Modify: `apps/web/src/components/interior/PartMockups.tsx` (adicionar função nova perto de `FanDisc`, linha ~44)

**Interfaces:**
- Produces: `fanBlades(cx: number, cy: number, r: number, bladeCount: number, opts?: { hubR?: number, ring?: boolean }): ReactNode` — usada nas Tasks 3 e (planos futuros) cooler/case_front.

- [ ] **Step 1: Escrever a função `fanBlades`**

Adicionar em `PartMockups.tsx`, logo depois da função `FanDisc` (linha 44):

```tsx
/**
 * fanBlades — pá de ventoinha real, não só o aro+cubo do FanDisc.
 * Uma pá é um path assimétrico (tipo foice) desenhado uma vez e repetido
 * `bladeCount` vezes por rotação ao redor do centro. Referência: fotos reais
 * de ventoinha de GPU/cooler (blade count típico 9-11, mais fino que largo).
 * Fica DENTRO do raio `r` — nunca ultrapassa (mesma regra do bevel: a
 * silhueta nunca infla pra além da dimensão real da peça).
 */
function fanBlades(cx: number, cy: number, r: number, bladeCount: number, opts?: { hubR?: number; ring?: boolean }) {
  const hubR = opts?.hubR ?? r * 0.2
  const bladeOuterR = r * 0.92
  const bladeInnerR = hubR * 1.15
  // uma pá: do cubo até quase a borda, curvada (foice) — ponto de controle
  // deslocado lateralmente pra dar a curva assimétrica de uma pá real
  const bladePath = `M ${bladeInnerR} 0 Q ${bladeOuterR * 0.55} ${-bladeOuterR * 0.38} ${bladeOuterR} ${-bladeOuterR * 0.12} Q ${bladeOuterR * 0.5} ${bladeOuterR * 0.22} ${bladeInnerR} 0 Z`
  const blades = Array.from({ length: bladeCount }, (_, i) => {
    const angle = (360 / bladeCount) * i
    return (
      <path key={i} d={bladePath} fill="var(--line)" opacity=".55"
        transform={`translate(${cx} ${cy}) rotate(${angle})`} />
    )
  })
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--panel)" stroke="var(--line)" strokeWidth="1.2" />
      {opts?.ring && <circle cx={cx} cy={cy} r={r * 0.86} fill="none" stroke="var(--accent-dim)" strokeWidth="1.2" />}
      {blades}
      <circle cx={cx} cy={cy} r={hubR} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1" />
    </g>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erros novos relacionados a `PartMockups.tsx` (erros pré-existentes em outros arquivos, se houver, não são desta task).

- [ ] **Step 3: Commit**

```bash
cd /opt/pc-builder-br
git add apps/web/src/components/interior/PartMockups.tsx
git commit -m "feat(viewer): adiciona primitiva fanBlades com pas reais"
```

---

### Task 2: Primitiva `shroudPath` — silhueta de shroud angular

**Files:**
- Modify: `apps/web/src/components/interior/PartMockups.tsx` (adicionar função nova perto de `bevel`, linha ~105)

**Interfaces:**
- Consumes: `Box` type já existente (`{ x: number; y: number; w: number; h: number }`, linha 27)
- Produces: `shroudPath(b: Box, cut: 'flat' | 'dual_tone' | 'angular' | 'industrial'): string` — devolve o atributo `d` de um `<path>`, usada na Task 3.

- [ ] **Step 1: Escrever a função `shroudPath`**

Adicionar em `PartMockups.tsx`, logo depois da função `bevel` (linha 105):

```tsx
/**
 * shroudPath — contorno do corpo da peça (GPU/cooler/PSU) com corte
 * diagonal nos cantos e crista elevada no topo, em vez do <rect> chapado
 * atual. Intensidade do corte varia por `cut` (mapeia o enum `shroud` do
 * descritor). Referência: foto real de GPU (ASUS RTX 3070 KO, Newegg
 * 14-126-466), que mostra corte diagonal nos 4 cantos + crista central.
 * Corte SEMPRE pra dentro da caixa — nunca ultrapassa b.w/b.h (mesma regra
 * do bevel: a caixa em mm nunca é inflada).
 */
function shroudPath(b: Box, cut: 'flat' | 'dual_tone' | 'angular' | 'industrial'): string {
  const notch = cut === 'industrial' ? b.h * 0.28 : cut === 'angular' ? b.h * 0.2 : b.h * 0.1
  const ridgeH = cut === 'flat' ? 0 : Math.min(3, b.h * 0.06)
  const { x, y, w, h } = b
  // 8 pontos: canto sup-esq cortado, crista, canto sup-dir cortado, desce,
  // canto inf-dir cortado, crista inferior reta, canto inf-esq cortado, fecha
  return [
    `M ${x} ${y + notch}`,
    `L ${x + notch} ${y}`,
    `L ${x + w - notch} ${y}`,
    `L ${x + w} ${y + notch}`,
    ridgeH > 0 ? `L ${x + w} ${y + notch + ridgeH}` : '',
    `L ${x + w} ${y + h - notch}`,
    `L ${x + w - notch} ${y + h}`,
    `L ${x + notch} ${y + h}`,
    `L ${x} ${y + h - notch}`,
    'Z',
  ].filter(Boolean).join(' ')
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erros novos em `PartMockups.tsx`.

- [ ] **Step 3: Commit**

```bash
cd /opt/pc-builder-br
git add apps/web/src/components/interior/PartMockups.tsx
git commit -m "feat(viewer): adiciona primitiva shroudPath com corte angular"
```

---

### Task 3: Ligar as duas primitivas nos renderers de GPU

**Files:**
- Modify: `apps/web/src/components/interior/PartMockups.tsx:112-139` (função `gpuBody`, usada pelo tier)
- Modify: `apps/web/src/components/interior/PartMockups.tsx:358-432` (função `D_GPU`, usada pelo descritor aprovado)

**Interfaces:**
- Consumes: `fanBlades` (Task 1), `shroudPath` (Task 2)

- [ ] **Step 1: Trocar o desenho de ventoinha em `gpuBody` (linha ~135)**

Trocar:
```tsx
{cxs.map((cx, i) => <FanDisc key={i} cx={cx} cy={b.y + b.h / 2} r={r} spin={spin} dur={2 + i * 0.3} />)}
```
por:
```tsx
{cxs.map((cx, i) => <g key={i}>{fanBlades(cx, b.y + b.h / 2, r, 10)}</g>)}
```

- [ ] **Step 2: Trocar o `<rect>` do shroud em `gpuBody` (linha ~130) pelo `shroudPath`**

Trocar:
```tsx
<rect x={b.x} y={b.y} width={b.w} height={b.h} rx={5} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
```
por:
```tsx
<path d={shroudPath(b, 'flat')} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
```

- [ ] **Step 3: Repetir os dois swaps em `D_GPU` (linhas ~384-390 e ~420-429)**

No shroud (linha ~384): trocar o bloco `shroud === 'angular' ? <path .../> : <rect .../>` inteiro por uma única chamada:
```tsx
<path d={shroudPath(b, shroud as 'flat' | 'dual_tone' | 'angular' | 'industrial')} fill="var(--panel2)" stroke="var(--line)" strokeWidth="1.2" />
```

Na ventoinha (linha ~420-429), dentro do `cxs.map`, no branch que NÃO é `blower`, trocar os 3 `<circle>` (aro/anel/cubo) por:
```tsx
fanBlades(cx, b.y + b.h / 2, r, 10, { ring: style === 'ring' })
```
mantendo o branch `blower` como está (blower não tem pá visível de lado).

- [ ] **Step 4: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
cd /opt/pc-builder-br
git add apps/web/src/components/interior/PartMockups.tsx
git commit -m "feat(viewer): GPU usa fanBlades e shroudPath em vez de circulo/rect"
```

---

### Task 4: Verificação visual contra foto real

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Subir o dev server**

Run: `cd /opt/pc-builder-br/apps/web && npm run dev` (porta 3100, já mapeada via túnel SSH `ssh -L 3100:127.0.0.1:3100` nesta sessão)

- [ ] **Step 2: Navegar até uma build com GPU flagship e uma com GPU de entrada**

No wizard (`http://localhost:3100/wizard`), gerar uma build de R$ 12k+ (GPU flagship, descritor com `shroud: dual_tone`/`lighting: full`) e uma de R$ 3k (GPU de entrada, `shroud: flat`).

- [ ] **Step 3: Capturar screenshot e comparar lado a lado com a foto de referência**

Foto de referência já baixada nesta sessão: `gpu_v01.jpg` (ASUS RTX 3070 KO, Newegg). Confirmar visualmente: pás de ventoinha reconhecíveis (não círculo liso), canto do shroud cortado (não retângulo puro).

- [ ] **Step 4: Se não bater, ajustar parâmetros (bladeCount, notch, ridgeH) e repetir Steps 1-3**

Iteração de design visual — não há "valor correto" fixo, o critério é leitura reconhecível como GPU nas duas escalas (card mini e viewer grande).

- [ ] **Step 5: Commit final da fase (se algum ajuste foi feito no Step 4)**

```bash
cd /opt/pc-builder-br
git add apps/web/src/components/interior/PartMockups.tsx
git commit -m "fix(viewer): ajusta parametros de fanBlades/shroudPath apos verificacao visual"
```

---

## Próximas fases (planos separados, após esta ser verificada e commitada)

- Fase 1b: aplicar `fanBlades`/`shroudPath` em cooler e PSU (mesmas primitivas, reaproveitadas)
- Fase 2: profundidade/z-order (cabos, placa-mãe)
- Fase 3: visualização térmica
- Fase 4: copy/conteúdo
- Fase 5: responsividade
