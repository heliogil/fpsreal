# Rei do FPS — Calibração da estimativa de FPS

**Criado:** 2026-08-13 (mesma sessão do roadmap de compatibilidade, subsistema diferente)

## Como a fórmula funciona

```
fps(gpu, jogo, cpu, resolução) = fps_1080p_agg(gpu) × fator_do_jogo × fator_da_cpu × escala_da_resolução
```

Fonte: `services/ingestion/seed/performance_data.py`. Nenhum número é medido em bancada própria — tudo é rotulado `method="anchor_scale"` com banda de confiança (±18% em 1080p, crescendo em 1440p/4K).

- **`fps_1080p_agg`** — um número por GPU, **CALIBRADO** desde 2026-08-13 (ver abaixo).
- **fator do jogo** (`GAMES` em `performance_data.py`) — heurístico, não calibrado.
- **fator da CPU** (`CPU_TIER_FACTOR`) — heurístico, não calibrado.
- **escala de resolução** (`RES_SCALE`) — heurístico, não calibrado.

## O que foi calibrado em 2026-08-13

**Fonte nova:** [Tom's Hardware GPU Benchmarks Hierarchy 2026](https://www.tomshardware.com/reviews/gpu-hierarchy,4388.html), atualizado 24/06/2026. 48 GPUs, **mesma bancada** (Ryzen 7 9800X3D) pra todas, geometric mean de 11 jogos em 1080p Ultra. Isso elimina o problema que matou a primeira tentativa (pesquisa jogo-a-jogo via TechPowerUp/TechSpot/GameGPU): CPU diferente por fonte inflava ou reduzia o número sem relação nenhuma com a GPU (CS2 no RX 7600: 151 FPS com Ryzen 5 5500, 461 FPS com Ryzen 5 7600 — mais que o dobro só pela CPU).

**Fonte antiga substituída:** thepcbottleneckcalculator.com — metodologia não documentada publicamente.

**Resultado:** 17 das 20 GPUs do catálogo (as que estão no seed `GPUS`) recalibradas. A maioria concordava com a fonte antiga dentro de poucos pontos — exceção real: **RX 9070 XT estava subestimada em ~20 pontos** (quase uma faixa inteira) na fonte antiga, corrigida de 135 → 157.

**Bônus:** duas GPUs que existem no banco de produção mas nunca estiveram no arquivo de seed (`gpu-rtx-5050`, `gpu-rx-9070-gre` — mesma divergência documentada na auditoria de compatibilidade de 2026-08-12) **nunca tinham sequer uma linha de FPS** — zero cobertura, nunca foram integradas ao motor. Geradas do zero com a mesma fórmula/fonte nova. `gpu-rx-9050` (a terceira GPU fora do seed) ficou de fora — o Tom's Hardware ainda não testou esse modelo, não inventei número.

**Como foi aplicado:** não rodei o `seed/run_seed.py` completo — ele reescreveria `products.specs` (incluindo `length_mm`) a partir de `catalog_data.py`, que está desatualizado nesse campo porque outro processo em andamento (`specs/aib_adapter.py`, não commitado) já corrigiu comprimentos reais de GPU direto no banco. Rodar o seed inteiro teria destruído esse trabalho alheio silenciosamente. Em vez disso: backup das 5 tabelas afetadas, `UPDATE` direto em `fps_1080p_agg`, e `performance_index`/`fps_estimates` recalculados chamando `build_performance_index()`/`build_fps_estimates()` sem passar por `seed_products()`.

**Confiança:** `PERF_CONFIDENCE` subiu de 0.70 para 0.85 (metodologia de bancada única documentada, não mais agregador de fonte obscura).

## O que NÃO foi calibrado (pendente)

- **Fator do jogo** (`GAMES`) — os multiplicadores tipo "Valorant ×2,6" continuam palpite. Calibrar isso exigiria FPS real por jogo × GPU, que é exatamente onde a pesquisa esbarrou (bloqueio de fetch nas fontes de metodologia única, fragmentos de busca com CPU misturada). Não resolvido nesta sessão.
- **Fator da CPU** (`CPU_TIER_FACTOR`) — mesma situação, precisaria de reviews comparando CPUs com a MESMA GPU (ex. os "melhor CPU pra jogos" da HUB/GN), não pesquisado ainda.
- **`gpu-rx-9050`** — sem fonte real disponível, mantido como estava.
- **Calibração crowdsourced** (`is_crowdsourced`, campo já existe na tabela `fps_estimates`) — nunca foi ativada. Só faz sentido com tráfego real de usuários, que hoje é ~0 (ver `project_fpsreal_launch.md`). Não é prioridade até isso mudar.

## Caminhos considerados e não escolhidos

- **API paga do HowManyFPS** (US$199,99–399,99/mês) — já cotada antes. Faz sentido só quando receita de afiliados cobrir ~2x o custo (decisão já registrada). Não usada agora.
- **Pesquisa jogo-a-jogo via TechPowerUp/TechSpot/GameGPU** — tentada primeiro, abandonada: os 3 domínios bloqueiam fetch automatizado, e a busca só devolve fragmentos com CPU/config diferentes por fonte, imprestável pra calibrar um multiplicador que deveria ser intrínseco ao jogo.

## Como continuar isso no futuro

Se for retomar a calibração por jogo, o padrão que funcionou aqui é o caminho: achar uma fonte de **metodologia única, mesma bancada para todas as comparações** (não misturar reviews de sites/CPUs diferentes). Tom's Hardware também publica gráficos por jogo individual dentro da mesma hierarquia — vale checar se dá pra extrair o fator por jogo de lá antes de procurar em outro lugar.
