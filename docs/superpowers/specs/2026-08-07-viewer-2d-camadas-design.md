# Revisão do sistema visual (GabineteVivo/PartMockups) — camada por camada

**Data:** 2026-08-07
**Componentes afetados:** `apps/web/src/components/interior/GabineteVivo.tsx`, `apps/web/src/components/interior/PartMockups.tsx`
**Objetivo do founder:** o viewer 2D (corte lateral do gabinete, gerado a partir da ficha técnica em mm) está publicamente reconhecido como "muito feio" — cabos ausentes, formas de peça sem detalhe reconhecível, e fluxo de ar mal comunicado. Esta spec revisa TODO o sistema visual, camada por camada, isolando cada uma pra análise e conserto independentes.

## Contexto — como chegamos aqui

Investigação em `2026-08-07` (via inspeção direta de código no VPS + screenshots do viewer real rodando localmente, tunelado via SSH) encontrou:

1. O sistema já tem arquitetura sólida: descritor de aparência (JSON, schema fechado, `visuals/schema.py`) gerado a partir da ficha técnica, validado contra specs reais, com portão de aprovação humana (`product_visuals.reviewed_at`). 38/38 descritores hoje estão aprovados — não é problema de cobertura de dados.
2. Comparação direta contra foto real (ASUS RTX 3070 KO, Newegg) revelou que o vocabulário de forma de base (retângulo + círculos concêntricos) não tem informação suficiente pra ler como GPU — falta pá de ventoinha (todo fan real tem, o código nunca desenha) e geometria de shroud angular (cortes diagonais, crista no topo). Isso vale pra toda categoria com "shroud" (GPU, cooler, PSU), não só GPU.
3. Cabos (EPS/ATX24/front-panel) e a placa-mãe são desenhados no "plano distante" com opacidade ~0.5 × 0.55 empilhada + blur — o próprio código já tem um comentário reconhecendo o risco ("sem um 'atrás' onde correr, vira rabisco"), mas na prática ficam invisíveis.
4. A zona térmica (`gv-heat`, campo de calor por obstrução) usa blur gaussiano + opacidade por célula capada em 0.4 — mas células sobrepostas somam opacidade além do previsto, e o resultado observado domina ~40% da cena com vermelho, lendo como erro em vez de "essa zona esquenta".
5. Badges técnicos ("front bottom: +85 CFM") aparecem sempre, em todo tamanho de card — vocabulário de debug vazando pro usuário final.
6. Linhas de fluxo (`flowdots`) funcionam bem na vista grande mas viram ruído visual no card mini (comparação lado a lado).

## Princípios que NÃO mudam

- **Integridade dimensional**: a caixa desenhada continua sendo a dimensão real em mm. Nenhuma primitiva nova pode inflar a silhueta pra parecer maior/menor do que a peça é.
- **Integridade de descritor**: nenhuma cor fixa, nenhum logo/marca gráfica, nenhuma feature inventada que a fonte não declarou. Toda cor vem de token da marca (`var(--...)`).
- **Fallback em 3 camadas**: descritor aprovado → variante de tier → silhueta tracejada "em análise". Essa lógica de seleção não muda nesta spec — só o que cada camada DESENHA.
- **Nunca medição, sempre estimativa**: rótulos e aria-labels continuam deixando isso explícito.

## As 5 fases (camadas)

### Fase 1 — Vocabulário de forma
**Problema:** retângulo + círculos concêntricos não lê como peça nenhuma, mesmo em placas flagship com todos os campos do descritor ligados.

**Solução:** duas primitivas paramétricas novas em `PartMockups.tsx`:

- `fanBlades(cx, cy, r, bladeCount, opts)` — path de pá única (curva assimétrica tipo foice, baseada em referência real) repetido N vezes via rotação. Usado por GPU, cooler e case_front (os 3 lugares com ventoinha visível de perfil). `fan_style: 'blower'` continua com o desenho atual (blower real não mostra pá de lado, a abstração já está certa ali).
- `shroudPath(box, opts)` — polígono com corte diagonal nos cantos + crista elevada no topo, substituindo o `<rect>` atual. Intensidade do corte mapeada pro enum existente (`flat`/`dual_tone`/`angular`/`industrial`). Usado por GPU, cooler e PSU. Corte sempre pra dentro da caixa em mm — nunca ultrapassa a dimensão real (mesma regra do `bevel()` já existente).

Motherboard e RAM ficam de fora desta fase — motherboard já tem detalhe adequado (I/O shield, VRM, socket, trilhas) e seu problema é de visibilidade (Fase 2), não de forma; RAM é uma lâmina fina por natureza, sem shroud.

**Ordem de rollout:** GPU → cooler → PSU → case_front (se tiver fan frontal visível), cada uma verificada contra 2-3 fotos reais antes de avançar.

### Fase 2 — Profundidade/z-order
**Problema:** cabos e placa-mãe ficam no "plano distante" com opacidade final ~0.27 (0.5 × 0.55) + blur gaussiano — na prática, invisíveis.

**Solução:** recalibrar a curva de opacidade/blur do grupo `data-depth="tray"` até os cabos e a bandeja da placa lerem como "atrás, mas presentes" em vez de "ausentes". Não é redesenho de forma — é ajuste de parâmetro visual (opacidade, stdDeviation do blur), testado visualmente até o cabo aparecer como chicote reconhecível sem competir com o plano frontal.

### Fase 3 — Visualização térmica
**Problema:** campo de calor (obstrução por peça) domina a cena com vermelho, lendo como erro.

**Solução:** investigar se múltiplas células do campo térmico estão somando opacidade além do cap de 0.4 individual (overlap aditivo do SVG). Se sim, trocar para um único gradiente pré-composto em vez de N retângulos sobrepostos, ou aplicar um teto de opacidade no grupo inteiro (não por célula). Objetivo: zona crítica continua visualmente distinta, mas não domina mais da cena que o elemento que está causando o problema.

### Fase 4 — Copy/conteúdo
**Problema:** badges tipo "front bottom: +85 CFM" e "top bay: + simular ventoinha" são vocabulário de debug, sempre visíveis.

**Solução:** revisar cada badge/label do viewer; os que são úteis pro usuário final ganham copy em português claro; os que são debug/dev (CFM cru, nomes internos de mount) saem da vista padrão — ou ficam atrás de um toggle "modo avançado" se ainda fizerem sentido pra alguém, ou somem.

### Fase 5 — Responsividade
**Problema:** linhas de fluxo (`flowdots`) usam a mesma densidade no card mini (comparação 3-lado-a-lado) e no viewer grande — no mini, viram ruído.

**Solução:** breakpoint de densidade/quantidade de partículas por tamanho de viewport do SVG (`compact` prop já existe no componente — usar pra reduzir densidade de flowdots, não só esconder inset/legenda como faz hoje).

## Verificação

Cada fase segue o mesmo processo: implementar → capturar screenshot real do viewer rodando (via túnel SSH + browser, processo já validado nesta sessão) → comparar contra foto real de referência (quando aplicável, Fases 1) ou contra o objetivo declarado (Fases 2-5) → só então avançar pra próxima fase.

## Fora de escopo

- Modelos 3D/glTF (coluna `component_footprints.model_gltf_path` existe mas está 0% populada — não é retomada aqui, é decisão separada se vale a pena perseguir)
- Novas categorias de peça além das 6 já existentes
- Mudança na lógica de seleção de variante (`pickVariant`) ou no schema do descritor (`visuals/schema.py`)
