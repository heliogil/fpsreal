# Especificação gráfica por componente + pipeline de extração automática

**Data:** 2026-08-07
**Motivação:** esta sessão gastou 4+ rodadas adivinhando a forma da GPU e mais 3 nos cabos, cada correção quebrando outra coisa. A causa não era ajuste fino — era **desenhar de cabeça, sem base real, e forçar um padrão decorativo específico como se fosse universal**. Este documento troca "adivinha e mostra pro founder" por: (1) uma spec do que cada peça REALMENTE mostra no corte, ancorada em foto e em número; (2) um pipeline que extrai esse visual-base de uma foto de produto automaticamente, sem marcação manual.

## Princípios (herdados do projeto, não negociáveis)

1. **Nada de feature inventada.** Se a ficha técnica (descritor) não declara, não desenha. O que se desenha "sempre" tem que ser universal de verdade (existe em 100% das peças daquela categoria), não um estilo de um fabricante.
2. **Dimensão é sagrada.** A caixa em mm vem da geometria do backend. O visual preenche a caixa, nunca a infla. (Regra do `bevel`/`shroudPath`.)
3. **Foto real antes de path.** Nenhuma coordenada de forma entra no código sem ter sido conferida contra ≥2 fotos reais do tipo de peça — de preferência extraída automaticamente, não estimada no olho.
4. **Corte é vista lateral (perfil).** O viewer é um corte do gabinete visto de lado: x→profundidade (traseira à direita), y→altura. Toda spec abaixo é "o que essa peça mostra DESSE ângulo" — não a cara frontal de marketing.

---

## Vocabulário de vista

Cada componente tem **uma face dominante** nesse corte. Errar isso foi metade do problema da GPU (desenhei a face do rotor, que nessa vista não aparece).

| Peça | Face que o corte lateral mostra | O que NÃO aparece |
|---|---|---|
| GPU | Perfil do cartão (comprimento × espessura) — lateral do shroud + backplate | A face das ventoinhas (aponta pra baixo/pro lado) |
| Cooler torre | Perfil da torre de aletas (largura × altura) | — (torre é ~simétrica) |
| Cooler low-profile | Perfil baixo e largo | — |
| AIO (bomba) | Topo do water-block sobre a CPU | — |
| AIO (radiador) | Perfil fino no teto/frente | — |
| PSU | Lateral da caixa (a face com o adesivo fica pro lado) | Ventoinha (aponta pra baixo, pro basement) |
| Placa-mãe | A PCB de chapa (backdrop de tudo) | — |
| RAM | Lâmina fina de perfil | — |
| SSD M.2 | Palito fino deitado na placa | — |
| Painel frontal | Faixa vertical fina na frente | — |
| Cabo | Feixe cilíndrico correndo entre pontos | Vias individuais (só sugestão, ver abaixo) |

---

## Especificação por componente

Formato de cada uma: **caixa real** (mm, do backend) · **anatomia visível** (o que o olho reconhece) · **universal vs. data-driven** (o que desenha sempre × o que só com descritor) · **estado atual** · **referência a extrair**.

### 1. GPU  `[caixa: comprimento_real × gpu_thick_real mm]`
- **Caixa:** `w = length_mm` (240–360), `h = gpu_thick` (2-slot ≈41mm até 4-slot ≈81mm). **Já corrigido no backend** (`65bbacf`, pendente deploy) — antes era 55mm fixo, achatava tudo.
- **Anatomia visível (perfil):** backplate (chapa fina no topo, atrás da PCB) · PCB fina · conector de força no topo perto da traseira · shroud (carcaça) com corte de canto · **radiador de aletas exposto** por janelas recortadas na carcaça · bracket de I/O com fendas na ponta traseira (encosta no painel do gabinete).
- **Universal (desenha sempre):** silhueta da caixa · backplate · bracket traseiro com fendas (toda GPU add-in tem) · corte de canto sutil do shroud.
- **Data-driven (só com descritor):** nº de janelas/recortes e o padrão delas (`vent_cut`: none/diagonal/slot/hex) · conector (`power`: 8pin/8x2/12vhpwr) · faixa de acento (`accent`) · iluminação (`lighting`). **Sem descritor: shroud liso, sem inventar recorte** (estado atual pós-`fb7e20d`).
- **Estado:** simplificado, honesto, mas "genérico demais" na opinião do founder quando não há descritor. **Não reabrir com ajuste de path** (ver postmortem).
- **Extrair:** silhueta da carcaça + posição/formato das janelas do radiador, de fotos de perfil (base do shroud) de 3–4 modelos de fabricantes diferentes. A janela do radiador é o dado que falta — hoje é chutado.

### 2. Cooler torre  `[caixa: body_w × body_h, ~90 × 110–150 mm]`
- **Caixa:** `w = body_w_mm ou 90`, `h = max(110, min(body_w*1.15, 150))`. Deliberadamente quase-quadrada (comentário no backend: "torre ≈ tão alta quanto profunda").
- **Anatomia:** pilha de aletas horizontais densas · top-plate (tampa no topo) · heatpipes saindo por cima · ventoinha frontal (essa SIM aparece de perfil, é a face lateral do fan).
- **Universal:** silhueta · aletas (toda torre tem pilha de aletas — `mat-fins-*`).
- **Data-driven:** `fin_style` (densidade) · `top_plate` · `side_fan` (ventoinha extra) · `lighting`.
- **Estado:** já usa `fanBlades`/`shroudPath`/`mat-fins-v` (fases 1b). Não teve crítica do founder — provavelmente o mais próximo de aceitável.
- **Extrair:** densidade e direção das aletas + contorno do top-plate, de foto de perfil de torre.

### 3. Cooler low-profile  `[caixa: body_w × 55 mm]`
- Igual à torre mas achatado (h fixo 55 quando `cooler_h < 100`). Aletas horizontais, sem torre alta.

### 4. AIO — bomba  `[caixa: 60 × 60 mm]` + radiador `[rad_len × rad_th]`
- **Bomba:** bloco quadrado sobre o socket, topo com logo/círculo. **Radiador:** barra fina no teto ou frente, com fila de aletas verticais + ventoinhas anexas. Tubos saem por UMA porta numa ponta (já modelado corretamente).
- **Universal:** bloco da bomba · barra do radiador · 2 tubos.
- **Extrair:** proporção do water-block e padrão de aleta do radiador.

### 5. PSU  `[caixa: 150 × 86 mm]`
- **Anatomia (lateral):** caixa retangular sólida · grade/honeycomb numa face · o adesivo de specs (fica pro lado, some no corte) · cabos saindo de uma ponta (modular) ou fixos (não-modular).
- **Universal:** caixa · uma aresta chanfrada.
- **Data-driven:** `cabling` (modular = conectores visíveis numa ponta) · `grill` (honeycomb/slot) · `fan_pos`.
- **Extrair:** o padrão da grade e a posição dos conectores modulares.

### 6. Placa-mãe  `[caixa: 244 × 305 (ATX) / 244 × 244 (mATX)]`
- Backdrop de tudo. Já tem detalhe adequado (I/O shield, VRM, socket, slot PCIe, chipset, trilhas de PCB via `mat-pcb`). **Não precisa de extração** — é esquemático por natureza e já funciona. Problema dela era visibilidade (resolvido na fase 2), não forma.

### 7. RAM  `[caixa: 8 × 45 mm por pente, 2 pentes]`
- Lâmina fina vertical. `ram-bare` (PCB nua) vs `ram-heatspreader` (dissipador). Fina demais pra ter shroud. Baixa prioridade.

### 8. SSD M.2  `[caixa: 80 × 9 mm]`
- Palito fino deitado. Já OK como está.

### 9. Painel frontal  `[caixa: ~14 × H mm]`
- Faixa fina. `front-mesh` (textura de malha) vs `front-solid`. Já OK.

### 10. Cabos  `[não têm caixa — path entre 2 pontos]`
- **Anatomia real (conferido nesta sessão contra foto Corsair sleeved):** feixe cilíndrico de vias individualmente encapadas · conector retangular com grade de guia de pino nas pontas.
- **Universal:** o feixe (tubo com espessura calibrada por tipo) · conector discreto na ponta livre.
- **Larguras reais (px em s≈1,38px/mm):** 24-pin ~13–16mm (mais grosso) · EPS ~9–10mm · PCIe ~8–9mm · front-panel ~6–8mm. **Já calibrado** (`c158b34`).
- **LIÇÃO desta sessão:** a tentativa de "listrado do trançado" (traço tracejado por cima) foi rejeitada — inventar textura fake repete o erro da GPU. Cabo fica **tubo limpo com espessura real** (`2357e3a`). Se um dia quiser sugerir as vias, tem que vir de textura real conferida em foto, não de um dasharray chutado.
- **Extrair:** N/A pra forma (é um path), mas o conector pode ser extraído de foto de plugue.

---

## Pipeline de extração automática — generalização do que já existe

Já existe `scripts/design-tools/extract_shroud_silhouette.py` (Sobel + Otsu + morfologia + approxPolyDP), que funciona pra separar "material texturizado" (aletas) de "material liso" (carcaça) numa foto e devolver pontos normalizados. O plano é **generalizar isso num pipeline de 4 estágios reutilizável por qualquer componente**, resolvendo as limitações que apareceram nesta sessão.

### Estágio 0 — aquisição de referência (resolvido)
- Fotos de produto vêm da galeria da Newegg via httpx (padrão de URL `neweggimages.com/productimage/nb640/<sku>-NN.jpg`), 3–4 modelos de fabricantes diferentes por categoria pra não fixar num estilo só.
- **MiniMax `image_generation` NÃO serve** (só aceita `subject_reference` de retrato humano, confirmado na doc). Geração por IA está descartada pra referência de produto.

### Estágio 1 — segmentar peça do fundo (limitação encontrada, precisa entrar no script)
- **Problema achado nesta sessão:** o extrator confundia fundo branco de estúdio com plástico liso da carcaça (ambos sem textura). 
- **Solução:** threshold de luminância pra isolar a silhueta da peça ANTES de medir textura, e mascarar tudo fora dela. (Já prototipado em `extract_v2` no scratchpad; falta portar pro script versionado.)

### Estágio 2 — classificar sub-materiais dentro da peça
- Energia de textura (gradiente Sobel acumulado) + Otsu separa: **aletas/grade** (alta energia, bordas repetidas) de **carcaça/plástico** (baixa energia). 
- **Limitação conhecida:** materiais muito diferentes dentro do recorte (bracket metálico ao lado de plástico) confundem o classificador — resolver com `--crop` por região OU classificação multi-classe (k-means em 3 níveis de energia em vez de Otsu binário).

### Estágio 3 — vetorizar cada região
- Contorno da peça → silhueta externa (a caixa é validada contra a geometria mm; se divergir muito, a foto está enviesada por perspectiva e é descartada).
- Regiões de textura → posição/tamanho das janelas do radiador (GPU), direção/densidade das aletas (cooler), padrão da grade (PSU).
- `approxPolyDP` simplifica cada contorno pra poucos vértices → vira o array de pontos do path SVG.
- **Sempre gera uma imagem de conferência** (contorno sobreposto na foto) antes de qualquer ponto virar código. Isso já existe e é o que substitui pedir marcação manual ao founder.

### Estágio 4 — emitir descritor, não geometria hard-coded
- **Mudança de arquitetura importante:** a saída do pipeline NÃO deve ser um path fixo colado no `.tsx` (foi isso que travou a GPU — um padrão fixo aplicado a todos). Deve ser **um descritor por produto** no mesmo schema que já existe (`visuals/schema.py`): a extração preenche `vent_cut`, `fin_style`, `grill`, etc. pra AQUELE SKU, e o renderer (`D_GPU`/`D_COOLER`/`D_PSU`) desenha a partir do descritor.
- Assim: peça com foto extraída → descritor rico → desenho fiel. Peça sem foto → cai na variante de tier genérica (shroud liso honesto). Nunca um estilo de um fabricante forçado em todos.
- O portão de aprovação humana (`product_visuals.reviewed_at`) continua: a extração propõe, o humano aprova a folha de contato em `/modelos`.

## Ordem de execução proposta (plano)

1. **Portar as correções de pipeline pro script versionado** (estágio 1 segmentação de fundo + estágio 2 multi-classe). Hoje só existe a versão binária + protótipos no scratchpad.
2. **Rodar o pipeline em lote** nas categorias com descritor pobre, gerando descritores propostos + folha de contato de conferência.
3. **Founder aprova a folha** (não peça por peça — a folha inteira de uma vez, como o fluxo `/modelos` já faz).
4. **Renderers passam a consumir os campos novos** do descritor (a maioria já consome; ver o que falta por categoria acima).
5. **Só então** revisitar a forma da GPU — com descritor real extraído, não com path chutado.

## Fora de escopo
- Modelos 3D/glTF (decisão separada, coluna existe mas está vazia).
- Trocar o schema do descritor (só preencher os campos que já existem).
- A forma da GPU por ajuste manual de coordenadas (postmortem explícito: não reabrir assim).