# Especificação gráfica por componente + extração automática do visual-base

**Data:** 2026-08-07 (v2 — corrige a v1 do mesmo dia)
**Componentes:** `apps/web/src/components/interior/{GabineteVivo,PartMockups}.tsx` · `services/ingestion/visuals/*` · `services/ingestion/seed/ingest_visuals.py`

---

## 0. Correção de premissa (leia isto primeiro)

A v1 deste documento propunha **construir um pipeline de visão computacional (OpenCV) pra extrair o visual de cada peça**. Essa premissa estava errada, e teria produzido um segundo caminho redundante e pior.

**O pipeline de extração automática já existe, está bem desenhado, e está dormente por falta de INPUT.**

`services/ingestion/visuals/vision_adapter.py` (`LLMVisionAdapter`) já faz exatamente o que foi pedido: lê a foto do produto e devolve um descritor de aparência no schema fechado. E foi construído com as defesas certas — as mesmas que faltaram a mim durante esta sessão:

- prompt gerado do próprio schema, com cada valor explicado em linguagem visual (`prompt_spec`);
- enums fechados + **validação cruzada com a ficha técnica** dentro do adapter — contradição física é rejeitada, nunca corrigida em silêncio;
- uma tentativa de reparação com o erro exato devolvido ao modelo;
- confiança abaixo de `VISUALS_MIN_CONFIDENCE` (0.5) ⇒ cai no tier em vez de chutar;
- cache por `photo_hash` (sha256) — foto igual, zero chamadas, custo previsível;
- **nunca cor, nunca logótipo, nunca dimensão** — proibidos no prompt e ausentes do schema.

O driver existe: `python ingest_visuals.py --visao`. O portão humano existe: `product_visuals.reviewed_at`, revisado em folha de contato via `/modelos`.

**Portanto este documento deixa de ser "como construir a extração" e passa a ser "por que a extração que existe nunca rodou, e o que falta pra ela produzir um desenho bom".**

---

## 1. Diagnóstico medido (banco de produção, 2026-08-07)

| Medida | Valor | Consequência |
|---|---|---|
| Produtos ativos no catálogo | 51 | — |
| Produtos com URL de foto (`specs.image_url`/`photo_url`/`image`) | **0** | `LLMVisionAdapter` **nunca executou** |
| Descritores existentes | 38 | todos `source='ficha'` |
| Descritores `source='visao'` | **0** | nenhum visual foi lido de foto |
| Confiança média (GPU, via ficha) | 0.70 | inferência, não observação |
| Aprovados (`reviewed_at`) | 38/38 | o portão não é o gargalo |
| Colunas de imagem no banco inteiro | só `product_visuals.photo_hash` | não há onde guardar/achar foto |

**Leitura:** todos os 38 descritores são derivados da **ficha técnica** pelo `SpecsAdapter` — que só consegue inferir coisas do tipo "nº de ventoinhas a partir do comprimento" e "conector a partir do TDP". Nenhum descreve o que a peça **realmente parece**, porque nenhuma peça tem foto.

Isto explica a crítica do founder ("genérico demais", "está um lixo") de forma estrutural, e não como falha de renderização: **o viewer está desenhando fielmente descritores que são palpites**. Nenhum ajuste de path no `.tsx` poderia ter consertado isso — foi por isso que 4+ rodadas de ajuste manual não convergiram.

**Origem do gargalo:** o catálogo é semeado sem foto porque as fotos chegam junto com os feeds oficiais de afiliado (KaBuM/Mercado Livre), que é o mesmo passo humano que bloqueia o lado de preços do projeto (ver README). As 48 ofertas atuais apontam para URLs de amostra (`reidofps.com.br/amostra/...`), não para páginas reais de loja — não há nem imagem para raspar hoje.

---

## 2. O segundo gargalo: descasamento de projeção

Mesmo com 100% de cobertura de foto, o desenho **ainda** não ficaria certo, por uma razão independente que só apareceu ao ler o schema com atenção:

> `FIELD_HELP["gpu"]["fans"]` = *"nº de ventoinhas visíveis **na face da placa**"*

O descritor descreve a **face** do produto (a foto de marketing). O viewer desenha o **corte lateral** — o perfil. São projeções diferentes, e o vocabulário atual quase não descreve o perfil:

- `fans` (0–4) → a face que o corte lateral **não mostra** (foi exatamente o erro que cometi ao desenhar pá de ventoinha na GPU, e que você corrigiu);
- `vent_cut` (`none`/`diagonal`/`hex`/`slot`) → não consegue expressar a anatomia que você apontou: **carcaça sólida fechando as pontas + janelas recortadas + radiador de aletas exposto**. Não existe valor no enum que signifique isso;
- `shroud` (`flat`/`dual_tone`/`angular`/`industrial`) → descreve acabamento, não a silhueta de perfil.

**Por isso inventei o `armorPath`:** o schema não tinha como dizer aquilo, então eu codifiquei um padrão fixo. A correção certa não era ajustar o path — era **estender o vocabulário** para que a foto pudesse informar o perfil.

---

## 3. Contrato de projeção (a especificação gráfica, por componente)

Regra estrutural, para nunca mais desenhar a face errada. O corte é **lateral**: `x` → profundidade (traseira à direita), `y` → altura. Cada categoria declara qual face aparece e quais campos essa vista consegue usar.

| Peça | Caixa real (mm, do backend) | Face no corte lateral | Campos que ESTA vista usa | Campos que esta vista NÃO mostra |
|---|---|---|---|---|
| **GPU** | `length_mm` × `gpu_thick` (41–81) | perfil do cartão | `shroud`, `vent_cut`, `accent`, `power`, `backplate` | `fans`, `fan_style` (face do rotor), `lighting: fans` |
| **Cooler torre** | `body_w` × `max(110, min(body_w·1.15, 150))` | perfil da torre | `fin_style`, `top_plate`, `towers`, `side_fan` | — (torre é ~simétrica) |
| **Cooler low-profile** | `body_w` × 55 | perfil baixo | `fin_style`, `top_plate` | — |
| **AIO bomba** | 60 × 60 | topo do water-block | `kind`, `lighting` | — |
| **AIO radiador** | `rad_len` × `rad_th` | perfil fino | `fin_style` | — |
| **PSU** | 150 × 86 | lateral da caixa | `cabling`, `shroud_window` | `grill`, `fan_pos` (ventoinha aponta pro basement) |
| **Placa-mãe** | 244 × 305 (ATX) / 244 × 244 | a PCB inteira (backdrop) | `vrm_heatsink`, `io_cover`, `m2_shields` | — |
| **RAM** | 8 × 45 por pente | lâmina de perfil | `spreader`, `sticks` | `lighting: diffuser` (difusor é no topo) |
| **SSD M.2** | 80 × 9 | palito deitado | — | — |
| **Painel frontal** | ~14 × `H` | faixa vertical fina | `surface`, `cut`, `dust_filter` | — |
| **Cabos** | sem caixa (path) | feixe cilíndrico | — (largura por tipo, tabela abaixo) | vias individuais |

**Larguras de cabo** (calibradas contra a escala real `s ≈ 1,38 px/mm`, commit `c158b34`): 24-pin ATX 13–16mm · EPS 9–10mm · PCIe 8–9mm · front-panel 6–8mm. Cabo é **tubo limpo** — a tentativa de "listrado do trançado" foi revertida (`2357e3a`): textura inventada repete o erro do `armorPath`.

**Como usar esta tabela:** ao desenhar qualquer categoria, só é legítimo consumir campos da coluna "usa". Consumir um campo da coluna "não mostra" é, por construção, desenhar uma face que o corte não tem.

---

## 4. Delta de schema v3 — vocabulário para o perfil

O que falta para a foto poder informar o desenho lateral. Campos novos, todos enums fechados, todos preenchíveis por observação direta da foto (é isso que os torna extraíveis):

```python
# gpu — descreve o PERFIL, não a face
"shroud_profile": ("flat", "stepped", "armored", "finned_open"),
#   flat         carcaça lisa e contínua de ponta a ponta
#   stepped      carcaça com degraus/níveis, sem expor o dissipador
#   armored      pontas sólidas reforçadas + janelas recortadas no meio
#   finned_open  dissipador amplamente exposto, carcaça só como moldura
"fin_exposure": ("none", "partial", "wide"),
#   quanto do radiador (pilha de aletas) aparece pela lateral
"bracket_slots": (1, 4),   # INT_RANGES — nº de fendas no bracket de I/O
```

Notas de desenho deste delta:
1. `shroud_profile` é a resposta certa para o que o `armorPath` tentava resolver à força — mas **por produto**, vindo da foto, em vez de um padrão de um fabricante aplicado a todo o catálogo.
2. `fin_exposure` separa "vejo o radiador" de "vejo carcaça" — a distinção que o `extract_shroud_silhouette.py` já sabe medir (energia de textura: aletas ≠ plástico liso).
3. Continua sem cor, sem logo, sem dimensão. `bracket_slots` é contagem, não medida.
4. `FIELD_HELP` tem de descrever cada valor em linguagem visual — é o que sustenta a qualidade com modelo mais barato (o próprio módulo documenta isso).

**Regra de compatibilidade:** `SCHEMA_VERSION` 2 → 3, campos novos **opcionais**. Descritor v2 continua válido e cai no comportamento atual; só descritor v3 desbloqueia o desenho de perfil rico. Sem migração destrutiva.

---

## 5. Onde o OpenCV entra de verdade: harness de aceitação

O `scripts/design-tools/extract_shroud_silhouette.py` (commit `44de0e4`) **não deve ser o extrator primário** — o `LLMVisionAdapter` é. Mas ele resolve o problema que esta sessão inteira expôs:

> *"eu não posso ficar aqui marcando dezenas de vezes para você"*

Não havia **critério objetivo** para "está bom". Toda avaliação era você olhando e dizendo. O uso certo da ferramenta de CV é fechar esse loop:

**Teste de aceitação automático** — para um produto com foto:
1. renderiza o SVG do descritor proposto, na caixa em mm real;
2. extrai a silhueta da foto (Sobel+Otsu+morfologia, que já funciona);
3. compara silhueta renderizada × silhueta da foto por **IoU** (intersection-over-union), mais a fração de área classificada como "texturizada" (proxy do radiador exposto);
4. **reprova** abaixo do limiar → descritor volta para revisão em vez de ir pro ar.

Isso transforma "acho que ficou feio" em um número, e é o que permite rodar em lote sem você no meio de cada peça.

**Limitações medidas desta sessão, a corrigir antes de confiar no número:**
- fundo branco de estúdio é classificado como "liso" igual ao plástico da carcaça → **segmentar peça do fundo antes** de medir textura (prototipado nesta sessão, falta portar pro script versionado);
- materiais distintos no mesmo recorte (bracket metálico ao lado de plástico) confundem o Otsu binário → multi-classe (k-means em 3 níveis) ou `--crop` por região;
- foto em ângulo/perspectiva distorce a silhueta → rejeitar quando a razão de aspecto extraída divergir da razão em mm do catálogo além de uma tolerância. **A geometria em mm é a verdade; a foto é que é conferida contra ela**, nunca o contrário.

**Não usar geração por IA como referência:** o MiniMax `image_generation` foi testado nesta sessão — `subject_reference` só aceita retrato humano (confirmado na doc oficial), e a geração livre produz um design plausível mas sem relação com o produto real. Descartado.

---

## 6. Plano, em ordem de dependência

Cada fase é bloqueada pela anterior. A ordem importa: as fases 2 e 3 sem a 1 não têm efeito nenhum (é o estado de hoje).

**Fase 1 — INPUT: dar foto ao catálogo** *(desbloqueia tudo; sem isto o resto é inerte)*
- Adicionar `image_url` ao `specs` dos produtos. Duas fontes possíveis, decisão sua:
  - **(a) esperar os feeds de afiliado** — feeds oficiais (KaBuM, Mercado Livre) trazem `image_url` por produto; é o caminho limpo e alinhado com a política de "zero scraping" do projeto, mas fica bloqueado no mesmo passo humano que já bloqueia os preços;
  - **(b) semear manualmente os ~51 SKUs** — uma URL de foto por produto no seed. É finito (uma tarde), destrava a visão hoje, e é substituído automaticamente quando o feed chegar.
- Verificação: `SELECT count(*) FILTER (WHERE specs ? 'image_url') FROM products` > 0.

**Fase 2 — SCHEMA: v3 com vocabulário de perfil**
- Implementar o delta da secção 4 (`shroud_profile`, `fin_exposure`, `bracket_slots`) + `FIELD_HELP` de cada valor + validação cruzada (ex.: `fin_exposure: wide` contradiz `shroud: industrial`? decidir e codificar).
- O prompt de visão é **gerado do schema**, então esta fase sozinha já ensina o modelo a olhar para o perfil.

**Fase 3 — RODAR a extração que já existe**
- `python ingest_visuals.py --visao` em lote. Custo previsível: cache por `photo_hash`, 1 reparo por peça, ~51 peças.
- Saída: descritores `source='visao'` com confiança real, aguardando `reviewed_at`.

**Fase 4 — PORTÃO: revisar a folha de contato**
- `/modelos` já existe. Você aprova a folha **inteira de uma vez**, não peça por peça — este era o pedido explícito de não ficar no meio de cada iteração.

**Fase 5 — RENDERERS consomem o vocabulário novo**
- `D_GPU` passa a desenhar a partir de `shroud_profile`/`fin_exposure` em vez de não desenhar nada (estado atual pós-`fb7e20d`).
- **Só aqui** a forma da GPU é reaberta — com dado por produto, nunca com coordenada chutada. O postmortem da v1 continua valendo: não reabrir por ajuste manual de path.

**Fase 6 — HARNESS de aceitação (secção 5)**
- Portar segmentação de fundo + multi-classe; implementar IoU render×foto; ligar como reprovação automática antes da revisão humana.

---

## 7. Pendências herdadas

- **`gpu_thick` real, pendente de deploy** (commit `65bbacf`): a altura de desenho da GPU usa a espessura real dos slots em vez de 55mm fixo. Testado sem colisão em cases H=350/395/450 numa instância isolada (porta 8101). O container `pcb_api` roda de imagem Docker sem bind-mount — **exige rebuild+redeploy deliberado**, decisão não tomada nesta sessão.
- **`apps/web/.env.local` do worktree** aponta para o backend de teste (`127.0.0.1:8101`). Resetar para `8100` ao voltar a testar contra produção.

## 8. Fora de escopo

- Modelos 3D/glTF (`component_footprints.model_gltf_path`, 0% populada) — decisão separada.
- Campo de cor ou de marca gráfica no descritor — proibido por desenho, não é omissão.
- Reabrir a forma da GPU por ajuste manual de coordenadas — ver postmortem em `2026-08-07-viewer-2d-camadas-design.md`.
