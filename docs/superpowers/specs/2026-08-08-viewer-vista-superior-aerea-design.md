# Vista superior (aérea) do viewer — segunda projeção do gabinete

**Data:** 2026-08-08
**Componentes:** `apps/web/src/components/interior/` (nova `GabineteTopo.tsx` + refactor leve de `GabineteVivo.tsx`) · consome `services/ingestion` (`/interior/estimate`) **sem alterá-lo**
**Founder:** aprovado 2026-08-08

---

## 0. Correção de terminologia (leia primeiro)

Durante a sessão houve um descasamento de nomes que atrasou tudo. A conclusão, confirmada pelo founder:

- O que o código e as specs anteriores chamavam de **"corte lateral"** é, pra o founder, a **vista frontal** — a **vista do vidro** do gabinete (onde se vê a placa-mãe de chapa, a GPU deitada, o cooler, a fonte no basement). **Essa é a vista principal e JÁ EXISTE** (`GabineteVivo.tsx`).
- O que falta é **ADICIONAR uma vista superior (aérea)** — olhando o gabinete de cima.

Portanto isto **não é rearquitetura**: a vista principal fica, e a de cima é **aditiva**.

Contexto que continua valendo (specs anteriores):
- `2026-08-07-viewer-2d-camadas-design.md` — postmortem da forma da GPU (não reabrir por ajuste manual de coordenadas).
- `2026-08-07-spec-grafica-componentes-e-extracao.md` — o extrator de visão já existe e está dormente (0/51 produtos com foto).
- **Decisão do founder (2026-08-07):** viewer **genérico por categoria, customizado só no tamanho** — sem estética por modelo. Vale para as duas vistas. Ver memória `project_viewer_generico_por_tamanho`.

---

## 1. Objetivo da vista superior

Tornar **legível a compatibilidade** das 3 peças que o founder apontou como as mais difíceis: **air cooler, liquid cooler (AIO/radiador) e GPU**. Cada uma tem uma folga crítica que a vista do vidro sozinha não mostra bem, e a vista de cima mostra:

| Peça | Folga crítica que a vista de cima revela |
|---|---|
| **GPU** | comprimento vs profundidade do gabinete (a ponta da placa vs ventoinha/radiador frontal) — a estrela |
| **AIO/radiador** | onde cabe (frente ou topo) e com o que conflita: radiador frontal disputa espaço com a GPU; radiador no topo disputa com a RAM |
| **Air cooler** | footprint e *overhang* sobre a RAM; e a altura do cooler vs painel lateral (que, na geometria real, é a extensão perpendicular à placa — o próprio backend já anota que "a medida de spec vive na vista superior") |

As duas vistas **dividem a história**, e é por isso que ter as duas vale a pena: **vidro = altura/silhueta de perfil; cima = footprint/profundidade/fluxo.**

---

## 2. Sistema de eixos e contrato de projeção

Referencial 3D do gabinete (torre padrão):
- **X = profundidade** (frente→trás). Frente em X=0.
- **Y = largura** (bandeja da placa em Y=W; vidro em Y=0 — as peças "sobem" da bandeja em direção ao vidro, em −Y).
- **Z = altura** (piso em Z=0).

- **Vista do vidro (existente)** = projeção no plano **X-Z** (olhando por −Y). Mostra profundidade × altura.
- **Vista superior (nova)** = projeção no plano **X-Y** (olhando por −Z, de cima). Mostra profundidade × largura.

**O eixo X (profundidade) é COMPARTILHADO entre as duas vistas.** Toda posição e extensão em profundidade é reaproveitada direto das placements que o backend já entrega. Só o eixo perpendicular muda (Z na do vidro, Y na de cima).

Contrato por peça (o que cada vista mostra — impede desenhar a face errada, o erro recorrente da sessão):

| Peça | Extensão em X (profund., compartilhada) | Extensão em Y (largura, nova) | Folga que ESTA vista possui |
|---|---|---|---|
| placa-mãe | comprimento do board | laje fina junto à bandeja (Y≈W) | — (backdrop) |
| GPU | `length_mm` (barra longa) | altura do cartão (~125mm, ~padrão) | **GPU: comprimento vs frente (X)** |
| air cooler | footprint ~120mm | **altura do cooler** (`height_mm`, tray→vidro) | **cooler: altura vs painel lateral (Y) + overhang RAM** |
| AIO radiador | `rad_len` (240/280/360) | espessura do stack (rad+fans) | **radiador: cabe na frente/topo? conflita c/ GPU/RAM?** |
| AIO bomba | ~60mm | ~60mm | — |
| RAM | slots | **altura da RAM** (~44mm, tray→vidro) | **RAM: altura vs overhang do cooler (Y)** |
| fonte (PSU) | ~150mm | largura (~150mm) | — (sob o shroud; footprint esmaecido) |
| ventoinha frontal | tira fina em X=0 | span na largura | ancora o fluxo de entrada |
| ventoinha traseira | tira fina em X=D | parcial | ancora a saída |

Extensões em Y derivam de escalares que o backend **já entrega**: `case.width_mm`/`max_cooler_height_mm` (largura total), `parts.cooler.height_mm`, `parts.gpu` (comprimento + slots), largura da fonte, e padrões de form factor pra RAM/board. **Nenhum campo novo no backend.**

---

## 3. Sobreposições (o ponto central levantado pelo founder)

De cima, peças em alturas (Z) diferentes se sobrepõem na projeção X-Y. Regras:

1. **Z-order pela altura real:** bandeja/placa ao fundo → fonte sob o shroud → GPU → cooler/radiador por cima. Desenha de baixo pra cima.
2. **Transparência pra legibilidade:** camadas mais baixas com opacidade reduzida; a de cima opaca. Tudo continua reconhecível.
3. **Distinguir projeção de CONFLITO — a regra de ouro:**
   - Sobreposição que é **só projeção** (GPU embaixo da placa, peças em Z distintos que nunca se tocam) → **esmaecida**, sem alarme.
   - Sobreposição que é **conflito real de folga** (ponta da GPU dentro da zona da ventoinha/radiador frontal; radiador no topo sobre a RAM; overhang do cooler sobre a RAM) → **destacada em cor de aviso** (`--warn`), com o número de folga que o backend **já calcula** (`clearances.gpu.remaining_mm`, `clearances.cooler.remaining_mm`, `is_tight`).
   - A distinção projeção-vs-conflito vem dos `clearances` e das `obstructions` do fluxo — dados que já existem, não heurística nova.

Isto transforma a sobreposição de um bug visual num **recurso**: a vista de cima passa a apontar exatamente onde a build aperta.

---

## 4. Dados: derivado no frontend, zero backend

Novo módulo `apps/web/src/components/interior/GabineteTopo.tsx`, irmão de `GabineteVivo.tsx`:
- Recebe o mesmo `LiveInterior` que a vista do vidro já recebe (mesma chamada `/interior/estimate`, nenhuma chamada nova).
- Reusa X (profundidade) das `placements`.
- Deriva Y (largura) dos escalares da secção 2.
- Reusa `clearances`, `mounts` (intake/exhaust, posição), e o diagnóstico de fluxo pra marcar conflitos e desenhar as setas de fluxo frente→trás.
- Desenho genérico por categoria, paramétrico no tamanho (decisão do founder) — sem descritor de aparência por modelo.

O container `pcb_api` (Docker, produção) **não é tocado**.

---

## 5. Onde aparece (UX)

- **Página de detalhe da build:** as duas vistas juntas — vidro em cima, aérea logo abaixo (ou lado a lado se couber) — com **hover/foco sincronizado**: passar o mouse na GPU numa vista destaca a GPU nas duas. Estado de hover/foco compartilhado (subir `focused`/`hovered` pro componente pai ou um contexto leve).
- **Cards compactos (comparação 3-up):** **só a vista do vidro.** A aérea viraria ruído no tamanho mini. (Ajustável depois se o founder quiser um mini-aéreo.)

---

## 6. Princípios que NÃO mudam

- **Integridade dimensional:** toda extensão desenhada é a dimensão real em mm. Nada infla a silhueta.
- **Genérico por tamanho:** um desenho por categoria, só o tamanho muda. Sem estética por modelo, sem cor/logo inventados.
- **Aterrar em referência real antes de desenhar** cada peça de perfil-superior (a lição que custou a sessão): a disposição espacial de um PC é um fato conhecido, mas confiro contra uma vista de cima real antes de fechar cada peça.
- **Estimativa, nunca medição:** rótulos e aria-labels seguem explícitos.

---

## 7. Verificação

- `npx tsc --noEmit` limpo a cada mudança.
- Extração do SVG servido (via túnel SSH) + preview renderizado pro founder a cada peça, como na vista do vidro.
- Conferência dos números de folga contra os `clearances` do `/interior/estimate` (o desenho não pode contradizer o que o motor calcula).

## 8. Fora de escopo

- Terceira vista (frontal-de-verdade, olhando a frente do gabinete) — não pedida.
- Mudança na geometria do backend / no schema de descritor.
- Reabrir a forma da GPU da vista do vidro por ajuste manual (ver postmortem).
- Vista aérea nos cards compactos (por ora).
