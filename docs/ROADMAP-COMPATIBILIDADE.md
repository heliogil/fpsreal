# Rei do FPS — Roadmap de compatibilidade até o lançamento

**Criado:** 2026-08-08
**Para quem:** qualquer executor (humano ou LLM) que pegue uma tarefa daqui **sem ter participado da conversa que gerou este documento**. Por isso ele repete contexto que parece óbvio. Se algo aqui contradisser o código, **o código vence** — e corrija este documento.

---

## PARTE 0 — Contexto mínimo para operar

### O que é o produto
Site brasileiro que ranqueia builds de PC gamer por **custo por FPS**. Dois motores próprios são o diferencial: estimativa de FPS e **compatibilidade/airflow**. Este documento trata do segundo.

### Regra de integridade (INEGOCIÁVEL — vale para toda tarefa)
1. **Estimativa nunca vira medição.** Todo número exibido diz de onde veio. Só "preço" pode ser chamado de medido.
2. **Não desenhar/afirmar o que não se sabe.** Campo ausente ⇒ diga "desconhecido", nunca "ok".
3. **Nada de cor, logotipo ou marca gráfica inventados** no viewer.
4. **Dimensão vem do motor de geometria em mm.** Nenhum gerador paralelo pode produzir dimensão.
5. **Uma grandeza física ocupa UM eixo.** (Erro real já cometido: espessura da GPU desenhada em dois eixos.)

### Onde tudo está

| Coisa | Onde |
|---|---|
| VPS | `root@37.60.236.227`, chave `~/.ssh/id_vps` |
| Repo principal | `/opt/pc-builder-br` (branch `master`) |
| Worktree de trabalho | `/opt/pc-builder-br/.worktrees/viewer-fase1-forma` (branch `viewer-fase1-forma`) |
| Banco | PostgreSQL em `127.0.0.1:5434`, base `pcb_db`, user `pcb_user` — **senha em `/opt/pc-builder-br/.env`** (nunca escrever a senha em arquivo versionado) |
| API de produção | container Docker `pcb_api`, porta 8100. **Roda de imagem buildada: mudança em `.py` NÃO tem efeito sem rebuild.** |
| API de teste | `127.0.0.1:8101`, venv `services/ingestion/.venv-test` — roda direto do disco, **reflete mudança na hora**. Use esta para testar. |
| Frontend dev | porta 3101, dentro do worktree (`apps/web`) |

### Comandos que você vai repetir

```bash
# subir a API de teste (reflete o código do worktree na hora)
cd /opt/pc-builder-br/.worktrees/viewer-fase1-forma/services/ingestion
DATABASE_URL="postgresql://pcb_user:<SENHA_DO_ENV>@127.0.0.1:5434/pcb_db" \
  nohup .venv-test/bin/uvicorn main:app --host 127.0.0.1 --port 8101 > /tmp/test_backend.log 2>&1 &

# checar compatibilidade de uma build
curl -s -X POST http://127.0.0.1:8101/compatibility/check \
  -H 'Content-Type: application/json' \
  -d '{"components":{"cpu":66,"gpu":49,"ram":73,"motherboard":77,"storage":82,"psu":87,"case":88,"cooler":93}}' \
  | python3 -m json.tool

# verificar TypeScript (SEMPRE antes de commitar frontend)
cd /opt/pc-builder-br/.worktrees/viewer-fase1-forma/apps/web && npx tsc --noEmit

# verificar sintaxe Python
cd .../services/ingestion && python3 -m py_compile <arquivo>.py
```

### Glossário (erro já cometido 3×)
- **"vista frontal"** = a face onde fica o **VIDRO** do gabinete (painel lateral). É o componente `GabineteVivo.tsx`. O código chama de "lateral". **É a vista principal e a única obrigatória para lançar.**
- **"vista superior"** = de cima = `TopDownInset.tsx`.
- A vista largura×altura (olhar o gabinete de frente) foi **removida — fora do escopo. Não recriar.**

### Como a engine de compatibilidade funciona
`services/ingestion/routers/compatibility.py` (163 linhas) faz duas coisas:
1. **Regras em tabela** (`compatibility_rules` no banco, semeadas de `seed/compatibility_data.py`). Formato: `categoria_a.atributo_a  OPERADOR  categoria_b.atributo_b`. Operadores: `equals`, `in`, `not_in`, `gte`, `lte`.
   **Regras vivem no BANCO e são lidas a cada request ⇒ adicionar regra NÃO precisa de rebuild do container.**
2. **Checagens calculadas em código** (folgas físicas, potência da fonte). Essas **precisam de rebuild**.

**Armadilha conhecida** (`compatibility.py`, função `_passes`): quando um dos valores está ausente, a regra **retorna `True`** — vira ✅ verde. A engine hoje **não distingue "compatível" de "não sei"**. Corrigir isso é a tarefa T-10, e é pré-requisito de qualquer tarefa que adicione regra dependente de campo novo.

---

## PARTE 1 — Estado atual (verificado em 2026-08-08)

### Regras ativas: 7

| # | Regra | Severidade |
|---|---|---|
| 1 | `cpu.socket` = `motherboard.socket` | erro |
| 2 | `ram.type` = `motherboard.ram_type` | erro |
| 3 | `gpu.length_mm` ≤ `case.max_gpu_length_mm` | erro |
| 4 | `cooler.height_mm` ≤ `case.max_cooler_height_mm` | erro |
| 5 | `cooler.tdp_rating_w` ≥ `cpu.tdp_w` | aviso |
| 6 | **`cpu.socket` ∈ `cooler.sockets`** ← nova | erro |
| 7 | **`motherboard.form_factor` ∈ `case.supported_form_factors`** ← nova | erro |

Mais, em código: folga GPU/cooler vs gabinete, e potência da fonte (recomenda ≥ 1,25 × consumo).

### Catálogo: 51 peças ativas
gpu 20 · cpu 7 · cooler 5 · motherboard 4 · psu 5 · case 4 · ram 3 · storage 3

---

## PARTE 2 — Tarefas

**Como usar:** cada tarefa é autônoma. Leia a Parte 0 antes. Toda tarefa termina com verificação — **não marque como pronta sem rodar a verificação e colar a saída.**

Legenda de perfil: 🟢 modelo simples/barato · 🟡 exige cuidado · 🔴 exige modelo forte

---

### GRUPO A — Curadoria de dados (🟢, delegável, sem código)

Padrão de todas: adicionar campo ao `specs` JSONB da peça. Editar **`services/ingestion/seed/catalog_data.py`** (fonte reprodutível) **e** aplicar no banco por `UPDATE`. As duas coisas, sempre — senão o próximo reseed apaga.

Modelo de UPDATE:
```sql
UPDATE products SET specs = specs || '{"campo": valor}'::jsonb WHERE sku='<sku>';
```

---

**T-01 · Altura da memória RAM** ✅ CONCLUÍDO 2026-08-12
- **Resultado:** Corsair Vengeance LPX DDR4-3600 (linha *low-profile*, LPX = Low Profile eXtreme) = **34mm**; Kingston Fury Beast DDR5-6000 = **35mm** (34,9mm arredondado); Corsair Vengeance DDR5-6000 não-RGB = **35mm**. Todos confirmados contra ficha oficial do fabricante.
- **Verificado:** `SELECT sku, specs->>'height_mm' FROM products WHERE category='ram';` — os 3 preenchidos. Commit `d5597a3`.

**T-02 · Conferir soquetes dos coolers** ✅ CONCLUÍDO 2026-08-12
- **Por quê:** o campo `cooler.sockets` foi populado em 2026-08-08 a partir de conhecimento geral, **não conferido peça a peça**. A regra 6 depende dele. Errado aqui = falso erro, que é pior que não checar.
- **Resultado:** os 5 coolers foram conferidos contra a página oficial do fabricante (busca web, não memória). Os sockets que **realmente aparecem no catálogo hoje** (`AM4`, `AM5`, `LGA1700` — confirmado via `SELECT DISTINCT specs->>'socket' FROM products WHERE category='cpu'`) batem em todos os 5:
  - AMD Wraith Stealth → AM4/AM5 confirmado (mount idêntico entre os dois soquetes, documentado pela própria AMD).
  - DeepCool AK400 e LT520 → página oficial (URL do produto já cita "1851-1700-AM5"); linha DeepCool desses coolers cobre também LGA1200/1151, como já estava no banco.
  - Thermalright Peerless Assassin 120 → confirmado LGA1150/1151/1155/1200/1700/1851 + AM4/AM5.
  - Arctic Liquid Freezer III 360 → confirmado nativo AM5/AM4/LGA1700/LGA1851. **Correção:** LGA1200 exige kit de montagem separado ("Compatibility Upgrade" da própria Arctic) — como não temos certeza se o kit vem no pacote vendido, o banco **não afirma** LGA1200 pra esse cooler. Fica assim mesmo (regra de integridade: não afirmar o que não foi confirmado), e é inofensivo porque o catálogo não tem nenhum CPU LGA1200 hoje.
- **Verificado:** curl de compatibilidade com build válida (R7 9800X3D + Tomahawk B650 + AK400) não gerou nenhum erro novo — ver commit `ab02c54`.

**T-03 · Folga de RAM dos coolers** ✅ CONCLUÍDO 2026-08-12 (depende de T-01)
- **Resultado:** DeepCool AK400 = **43mm**, Thermalright Peerless Assassin 120 = **42mm** (config dual-fan de fábrica, fonte ficha do fabricante). Os outros 3 coolers (2 AIO + 1 stock top-down) **não têm o campo** — de propósito, não é "0mm", é "o problema não existe pra esse cooler" (AIO não tem torre sobre a RAM; o stock AMD Wraith Stealth é baixo e centrado no socket, não avança sobre o slot vizinho).
- **Verificado:** `SELECT sku, specs->>'ram_clearance_mm' FROM products WHERE category='cooler';` — 2 preenchidos, 3 ausentes com justificativa acima. Commit `d5597a3`.

**T-04 · Comprimento da fonte e da baia** ✅ CONCLUÍDO 2026-08-12
- **Resultado — `psu.length_mm`:** CX550 = 140mm, RM650 = 160mm, RM750e = 140mm, RM850 = 160mm, A1000G = 150mm (CX/RMe usam o chassi compacto Corsair de 140mm; a série RM 2021 não-e usa o chassi de 160mm — não confundir as duas linhas).
- **Resultado — `case.max_psu_length_mm`:** Lancool 216 = 220mm, H5 Flow = 200mm, 4000D Airflow = 220mm, Air 903 MAX = 240mm. Todos ficha oficial do fabricante.
- **Verificado:** os 4 `max_psu_length_mm` (200–240) são sempre ≥ a maior fonte do catálogo (160mm) — nenhuma build fica sem opção de fonte. Commit `d5597a3`.

**T-05 · Conectores de força** 🟡
- **Por quê:** GPU que pede 3×8-pin numa fonte com 2 conectores nativos = não liga. E 12VHPWR exige fonte ATX 3.0 ou adaptador.
- **Fazer:**
  - `gpu.power_connector` ∈ {`none`,`6pin`,`8pin`,`8x2`,`8x3`,`12vhpwr`} — **atenção:** já existe um campo `power` no *descritor visual* (`product_visuals`), que é outra coisa. Este vai em `products.specs`.
  - `psu.pcie_8pin_count` (inteiro) e `psu.has_12vhpwr` (bool) e `psu.atx_version` (ex.: `2.4`, `3.0`, `3.1`).
- **Verificar:** `SELECT name, specs->>'power_connector' FROM products WHERE category='gpu';`

**T-06 · Campos da placa-mãe** ✅ CONCLUÍDO 2026-08-12
- **Resultado:** as 3 placas AM5/LGA1700 com DDR5 (TUF B650-PLUS, Tomahawk WiFi, B760 Gaming X) têm `m2_slots=3, ram_slots=4, max_ram_speed_mts=7600`; a B550 Steel Legend (AM4/DDR4) tem `m2_slots=2, ram_slots=4, max_ram_speed_mts=4733`. Ficha oficial de cada fabricante.
- **Verificado:** query simples, os 4 preenchidos. Commit `d5597a3`.

**T-07 · Folgas medidas de cooler (fonte Noctua)** ✅ CONCLUÍDO 2026-08-12 (parcial, por honestidade)
- **Resultado:** confirmado **medição própria da Noctua** para 2 dos 4 gabinetes — Corsair 4000D Airflow (ficha 170mm → Noctua mede **180mm**, +10mm de folga real) e NZXT H5 Flow (ficha 165mm → Noctua mede **176mm**, +11mm). Gravados `max_cooler_height_measured_mm` **sem sobrescrever** `max_cooler_height_mm`, mais `cooler_height_source='medido_noctua'`.
- **Os outros 2 ficam só com a ficha** (`cooler_height_source='ficha'`): Lian Li Lancool 216 não apareceu na lista de desvio relevante da Noctua e não consegui confirmar um número próprio deles distinto da ficha (180mm em ambos os lugares — pode ser coincidência real, mas não afirmo medição que não vi clara); Montech Air 903 MAX não encontrei evidência de que esteja na base da Noctua (marca menor, banco deles cobre ~100 gabinetes, principalmente marcas maiores). **Não forcei o número** — regra de integridade 2.
- **Restrição respeitada:** consulta pontual (buscas + páginas individuais via `noctua.at`, rate-limited pelo próprio site depois de ~6 requests — sinal de que não é pra automatizar em escala mesmo). Nenhuma extração em massa.
- **Verificado:** `SELECT sku, specs->>'max_cooler_height_mm', specs->>'max_cooler_height_measured_mm', specs->>'cooler_height_source' FROM products WHERE category='case';` — 2 com medição, 2 só ficha, nenhum campo sobrescrito. Commit `d5597a3`.

**T-08 · Tabela de BIOS mínimo** 🔴 (pesquisa pesada)
- **Por quê:** a incompatibilidade **mais oculta** que existe: CPU novo em chipset antigo não dá POST sem atualizar a BIOS antes — e não dá para atualizar sem um CPU que funcione. Nada na ficha indica. Ex.: Ryzen série 9000 em B650 antigo; Zen 3 em chipset série 400.
- **Fazer:** criar tabela nova `cpu_bios_requirements` (`cpu_sku`, `chipset`, `min_bios_version`, `flashback_supported` bool, `note`). Popular para as combinações CPU × placa do catálogo.
- **Saída para o usuário:** aviso do tipo "esta placa pode precisar de atualização de BIOS antes de aceitar este processador — verifique se ela tem BIOS Flashback".
- **Verificar:** para cada par (cpu, motherboard) do catálogo com mesmo soquete, a tabela responde "precisa / não precisa / desconhecido".

---

### GRUPO B — Motor de compatibilidade (🟡/🔴, exige rebuild do container)

**T-10 · Estado "desconhecido"** 🔴 — **PRÉ-REQUISITO DE TODO O GRUPO C**
- **Problema:** `compatibility.py`, `_passes()`: dado ausente ⇒ `return True` ⇒ ✅ verde. A engine afirma compatibilidade que não verificou.
- **Fazer:** introduzir terceiro estado. `status` passa a ser `ok` | `warning` | `error` | `unknown`. Quando faltar `a_val` ou `b_val`, emitir `unknown` com mensagem "não verificado: falta `<campo>` em `<peça>`" em vez de pular a regra.
- **Frontend:** `apps/web/src/components/interior/` e onde os chips de compatibilidade aparecem — `unknown` precisa de tratamento visual distinto (cinza, não verde). **Nunca** pintar de verde.
- **Cuidado:** hoje os 5 campos das regras 1–5 têm 100% de cobertura, então nada vira `unknown` de imediato. O valor aparece quando o catálogo crescer por feed (spec esparsa).
- **Verificar:** apagar temporariamente um campo de uma peça de teste, rodar o `curl`, confirmar `unknown` (e **não** `ok`); restaurar.

**T-11 · Comprimento útil da GPU (não o do gabinete)** 🔴
- **Problema:** a regra 3 compara `gpu.length_mm ≤ case.max_gpu_length_mm` cru. Esse número do fabricante **assume gabinete vazio**. Radiador frontal + ventoinhas comem **30–60mm**; gaiola de HDD, 20–40mm. Uma build com AIO frontal e placa longa **passa e não fecha**.
- **A boa notícia:** o dado já existe. `services/ingestion/routers/interior.py` já modela mounts, radiador (`radiator_mm`, `rad_class`) e obstrução. É o endpoint de compatibilidade que ignora.
- **Fazer:** calcular comprimento efetivo = `max_gpu_length_mm − (espessura do radiador frontal + espessura das ventoinhas)` quando houver radiador montado na frente, e usar esse valor. Expor como `clearances.gpu_effective` com a origem do desconto.
- **Margem:** manter os 10–20mm de folga recomendada (o `TIGHT_MM = 15` atual está nessa faixa — não mexer sem motivo).
- **Verificar:** build com AIO 360 frontal + GPU longa deve acusar aperto que hoje não acusa.

**T-12 · Severidade da potência da fonte** 🟡
- **Problema:** uma CX550 (550W) com RTX 5090 (575W) hoje sai como **aviso**. Essa máquina desliga sob pico transiente — GPUs modernas puxam picos de µs bem acima do TDP, e a proteção da fonte (OCP) corta.
- **Fazer:** escalar para **erro** abaixo de um limiar (sugestão: fonte < 1,0 × consumo estimado = erro; entre 1,0 e 1,25 = aviso; acima = ok). O cálculo de consumo já existe em `compatibility.py`.
- **Verificar:** a build 5090 + CX550 passa a dar erro; 5090 + A1000G continua ok.

**T-13 · Regras novas sobre os dados do Grupo A** 🟡 (depende de A e de T-10)
- **Fazer:** inserir em `compatibility_rules` (e no seed `compatibility_data.py`):
  - `ram.height_mm` ≤ `cooler.ram_clearance_mm` — erro
  - `psu.length_mm` ≤ `case.max_psu_length_mm` — erro
  - radiador do AIO vs mounts que o gabinete aceita (usar `case.mounts[].accepts`) — erro
  - nº de SSDs M.2 ≤ `motherboard.m2_slots` — erro *(pode exigir checagem calculada, não cabe em regra binária)*
  - `gpu.power_connector` vs conectores da fonte — erro *(idem, provavelmente calculada)*
- **Regra de ouro:** se a checagem precisar de mais de dois atributos ou de condição, **não force na tabela** — faça checagem calculada em código, como a da fonte. A tabela é só para comparação binária.
- **Lembre:** adicionar rótulo legível no dict `rule_label` em `compatibility.py`, senão a UI mostra o `rule_type` cru.

**T-14 · Redeploy do `pcb_api`** ✅ CONCLUÍDO 2026-08-12
- **O que foi feito:** merge de `viewer-fase1-forma` → `master` (commit `3b41d35`, 19 arquivos reais — não confundir com uma tentativa de merge anterior que teria trazido 2062 arquivos porque uma virtualenv de teste tinha sido commitada por engano em `f397146`; corrigido antes em `0bafd8c` e o merge foi refeito limpo). `docker compose build pcb_api pcb_web && up -d` a partir de `/opt/pc-builder-br`.
- **Achado no caminho:** havia trabalho não commitado e alheio a esta sessão em `services/ingestion/specs/{aib_adapter,reconcile,url_resolver}.py` (specs de comprimento de GPU por fabricante, de 2026-08-06). Guardado em `git stash` antes do merge e devolvido depois — nada foi perdido, mas como o build do Docker copia o diretório como está no disco (não é git-aware), essas mudanças não commitadas **também foram para a imagem nova**. Vale conferir com quem estava mexendo nisso se estava em ponto publicável.
- **Verificado:** `pcb_api` e `pcb_web` healthy; `curl 127.0.0.1:8100/compatibility/check` em produção confirma T-10 (status `unknown` quando falta dado) e T-12 (CX550+RTX5090 agora dá `error`, antes era só aviso) ao vivo; `curl 127.0.0.1:3100/` responde 200.
- **Rollback, se algo der errado:** em `/opt/pc-builder-br`, primeiro `git stash push -u` (proteger o trabalho não commitado de specs/*, se ainda estiver lá), depois `git reset --hard bcfec1b` (HEAD do `master` antes do merge), `git stash pop` para devolver o trabalho de specs, e por fim `docker compose build pcb_api pcb_web && docker compose up -d pcb_api pcb_web`.

---

### GRUPO C — Viewer (🟡, opcional para lançar)

**T-20 · Linkar o download do modelo 3D** 🟢
- **Contexto:** existe `GET /build/<slug>/modelo.gltf` funcionando (gera glTF 2.0 do motor de geometria), **mas não está linkado em página nenhuma** — `grep 'modelo.gltf'` nos `.tsx` volta vazio. Funcionalidade pronta e invisível.
- **Fazer:** botão/link na página de detalhe da build. Texto sugerido: "baixar modelo 3D do gabinete (.gltf)". Mencionar que abre em Blender / visualizador 3D do Windows.
- **Verificar:** clicar e baixar o arquivo.

**T-21 · Corrigir o eixo da GPU no glTF** 🔴
- **Problema:** `services/ingestion/gltf_builder.py:275` usa `gpu_thick` como extensão **Z** (bandeja→vidro), mas o `h` da placement — que também é `gpu_thick` — já é o **Y**. A GPU sai como barra 360×71×71mm. O real é 360 de comprimento × 71 de espessura (vertical) × ~140 de altura de cartão.
- **Causa raiz:** a altura do cartão **não existe no catálogo**. É a mesma causa do problema já corrigido no 2D.
- **Fazer:** ou (a) adicionar `gpu.card_height_mm` ao catálogo (curadoria, ~20 GPUs) e usar; ou (b) enquanto não houver o dado, **não afirmar** a extensão — usar um valor claramente rotulado como padrão de form factor no `extras.fonte`.
- **Verificar:** baixar o `.gltf`, abrir num visualizador, conferir que a placa tem proporção de placa.

**T-22 · Remover `model_gltf_path`** 🟢
- Coluna definida em `services/ingestion/models.py:424`, **nunca escrita, nunca lida**. Remover (migration) ou documentar por que fica.

---

## PARTE 3 — Sprints até o lançamento

Premissa: o bloqueio real de lançamento **não é técnico** — é entrar nos programas de afiliado e ligar os feeds oficiais (passo humano, do founder). Os sprints abaixo deixam o produto pronto para o momento em que isso destravar.

### Sprint 1 — "O diagnóstico não mente" (fundação)
**Objetivo:** nunca afirmar compatibilidade que não foi verificada.
- ✅ T-10 (estado desconhecido) ← o mais importante do roadmap — commit `ab02c54`
- ✅ T-12 (severidade da fonte) — commit `ab02c54`
- ✅ T-02 (conferir soquetes — valida a regra que acabou de entrar) — verificado, ver Parte 2
- ✅ T-14 (redeploy) — feito e verificado ao vivo em produção, commit `3b41d35`

**Sprint 1 concluído em 2026-08-12.** Pronto quando: nenhuma checagem exibe ✅ sem ter comparado dois valores reais; build com fonte insuficiente dá erro. **Confirmado ao vivo em produção**, não só no backend de teste.

### Sprint 2 — "O que não sabíamos medir" (dados)
**Objetivo:** popular os campos que destravam as incompatibilidades ocultas.
- ✅ T-01, T-03 (RAM × cooler) — commit `d5597a3`
- ✅ T-04 (fonte × baia) — commit `d5597a3`
- ✅ T-06 (placa-mãe) — commit `d5597a3`
- ✅ T-07 (folgas medidas + campo de origem) — commit `d5597a3`, 2/4 gabinetes com medição própria da Noctua confirmada, 2/4 honestamente só com ficha

**Sprint 2 concluído em 2026-08-12.** Pronto quando: todos os campos preenchidos ou explicitamente marcados como ausentes, no seed **e** no banco. **Confirmado nos dois lugares**, e regressão zero no `curl` de compatibilidade. Os dados ficam **inertes** até o Sprint 3 criar regras que os leiam (T-13) — é esperado, não é bug.

### Sprint 3 — "Regras em cima dos dados"
**Objetivo:** transformar os dados do Sprint 2 em diagnóstico.
- T-13 (regras novas)
- T-11 (comprimento útil da GPU) ← maior ganho isolado de acerto
- T-05 (conectores) + a regra correspondente

**Pronto quando:** as builds curadas passam limpas e builds propositalmente quebradas acusam o problema certo. **Criar um conjunto de builds de teste** (boas e ruins) e rodá-lo a cada mudança — hoje não existe.

### Sprint 4 — "Confiança visível"
**Objetivo:** o usuário entende de onde vem cada número.
- Exibir origem do dado (ficha vs medido) onde houver divergência
- T-20 (link do 3D) e T-22 (limpeza)
- T-08 (BIOS) se o Sprint 3 fechar antes

**Pronto quando:** todo número na tela tem procedência rastreável na interface.

### Sprint 5 — Pré-lançamento
- Feeds de afiliado ligados (**humano, founder**) → destrava preço, custo/FPS, ranking
- QA das 3 vistas nos cards e no detalhe, em telas pequenas
- Revisão final: nenhum "TODO" ou número inventado em produção

---

## PARTE 4 — O que NÃO fazer

- **Não** recriar a vista largura×altura do gabinete (removida, fora do escopo).
- **Não** reabrir a forma da GPU no viewer 2D por ajuste manual de coordenadas — 4 tentativas falharam; ver `docs/superpowers/specs/2026-08-07-viewer-2d-camadas-design.md`.
- **Não** usar geração de imagem por IA como referência visual de produto (testado: não suporta referência de produto, gera design plausível e falso).
- **Não** extrair em massa a base de medições da Noctua sem permissão.
- **Não** adicionar three.js/render 3D no navegador agora — não é crítico para lançar.
- **Não** comparar `motherboard.form_factor` com `case.form_factor` por igualdade (reprovaria mATX em gabinete ATX, que cabe).
