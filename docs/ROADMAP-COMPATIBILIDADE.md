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

**T-05 · Conectores de força** ✅ CONCLUÍDO 2026-08-12
- **Resultado — `gpu.power_connector`** (20 GPUs, placa de referência/Founders Edition — AIB varia por modelo, catálogo é representativo por tier como o resto do arquivo): RTX 50/40 topo (5090/5080/5070Ti/5070/4090/4070S) = `12vhpwr`; RTX 50/40 entrada (5060Ti/5060/5050/4060Ti/4060) + RTX 3060 = `8pin`; Radeon 9070XT/9070GRE/7900XTX/7800XT/7700XT = `8x2`; Radeon 9050/7600/6600 = `8pin`.
- **Resultado — fonte:** `pcie_8pin_count`/`has_12vhpwr`/`atx_version` das 5 fontes. CX550=2/false/2.4, RM650=4/false/2.4, RM750e=2/true/3.1, RM850=4/false/2.4, A1000G=4/true/3.1. **Nota de confiança:** o `atx_version` das 3 sem selo explícito (CX550/RM650/RM850) é inferido pela ausência de qualquer fonte anunciando ATX3.0/3.1 pra elas — não é uma ficha que cite o número.
- **Achado à parte, documentado no código, não corrigido:** o catálogo de produção tem **20 GPUs**, mas o seed `catalog_data.py` (antes desta sessão) só tinha **17** — faltam `gpu-rtx-5050`, `gpu-rx-9050`, `gpu-rx-9070-gre`, provavelmente adicionadas direto no banco por um processo de reconciliação de specs que está em andamento (`services/ingestion/specs/aib_adapter.py`, não commitado, achado durante o T-14 anterior). Populei o conector pras 20 via `UPDATE` direto no banco; no seed, o dict `GPU_POWER_CONNECTOR` já cobre as 3 ausentes (fica pronto pra quando alguém completar a lista `GPUS`).
- **Verificado:** `SELECT sku, specs->>'power_connector' FROM products WHERE category='gpu';` — 20 preenchidos. Commit `d6ba166`.

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

**T-11 · Comprimento útil da GPU (não o do gabinete)** ⛔ INVESTIGADO 2026-08-12 — BLOQUEADO PELO MODELO DE DADOS, NÃO IMPLEMENTAR AINDA
- **Problema original:** a regra 3 compara `gpu.length_mm ≤ case.max_gpu_length_mm` cru, que assumiria gabinete vazio, e radiador frontal comeria 30–60mm de clearance.
- **Por que NÃO foi implementado:** conferi os `mounts` dos 4 gabinetes do catálogo (`SELECT sku, specs->'mounts' FROM products WHERE category='case'`) — em **todos os 4**, `kind: "rad_bay"` só existe no mount `top_bay`; nenhum mount `front_*` aceita radiador. Ou seja, neste catálogo o radiador do AIO **sempre monta em cima**, num eixo perpendicular ao comprimento da GPU — fisicamente ele nunca reduz esse clearance (reduz, no máximo, a folga de RAM perto do socket, que é outra checagem). Implementar o desconto de "comprimento efetivo" seria escrever uma checagem que **nunca dispara** com o dado real que existe hoje — o mesmo tipo de código-morto que este roadmap já identificou e evitou antes (`gpu_side` clearance, `FrontalInset.tsx`).
- **O que destravaria isto de verdade:** um gabinete no catálogo cujo mount `front_bottom`/`front_top` (ou um mount novo) tenha `kind: "rad_bay"` e `accepts` incluindo `rad240`/`rad360` — aí sim o desconto de comprimento faz sentido e pode ser testado contra dado real. Até lá, a tarefa fica **fora do Sprint 3**, não é dívida escondida.
- **Se isso mudar:** o cálculo seria `max_gpu_length_mm − radiator_mm` (ou `− height_mm` do cooler, que já é a espessura do radiador) só quando o mount ocupado pelo AIO tiver `id` começando com `front_`; expor como `clearances.gpu_effective` com a origem do desconto, mantendo `TIGHT_MM = 15`.

**T-12 · Severidade da potência da fonte** 🟡
- **Problema:** uma CX550 (550W) com RTX 5090 (575W) hoje sai como **aviso**. Essa máquina desliga sob pico transiente — GPUs modernas puxam picos de µs bem acima do TDP, e a proteção da fonte (OCP) corta.
- **Fazer:** escalar para **erro** abaixo de um limiar (sugestão: fonte < 1,0 × consumo estimado = erro; entre 1,0 e 1,25 = aviso; acima = ok). O cálculo de consumo já existe em `compatibility.py`.
- **Verificar:** a build 5090 + CX550 passa a dar erro; 5090 + A1000G continua ok.

**T-13 · Regras novas sobre os dados do Grupo A** ✅ CONCLUÍDO 2026-08-12 (parcial — item M.2 adiado por falta de escopo no produto)
- **Regra de tabela (`compatibility_rules`, comparação binária):** `psu.length_mm ≤ case.max_psu_length_mm` — erro. Regra `psu_case_fit`, id 8, ativa.
- **Checagens calculadas em `compatibility.py`** (precisam de condição, não cabem em comparação binária — regra de ouro respeitada):
  - `ram.height_mm ≤ cooler.ram_clearance_mm` — erro. AIO e cooler stock são tratados como `ok` **por construção** (não têm torre sobre a RAM), não `unknown` — a checagem genuinamente não se aplica a eles, não é falta de dado.
  - Radiador do AIO vs `case.mounts[].accepts` — erro se `rad_class` do cooler não está em nenhum `accepts` de mount.
  - `gpu.power_connector` vs conectores da fonte — 3 níveis: `ok` (12VHPWR nativo, ou 8-pin suficiente pra GPU 8pin/8x2/8x3), `warning` (GPU pede 12VHPWR mas a fonte só tem 8-pin — funciona com o adaptador que a própria GPU costuma trazer na caixa, mas não é o ideal), `error` (nem native nem 8-pin suficiente pra adaptar).
- **Item adiado (não é dívida, é escopo):** nº de SSDs M.2 ≤ `motherboard.m2_slots` — o modelo de build atual só tem **um** slot de armazenamento (`storage_id` singular no payload de `/compatibility/check`), então essa checagem nunca teria mais de 1 SSD pra contar contra os 2–3 slots que as placas têm — seria sempre `1 ≤ m2_slots`, trivialmente verdadeiro. Só faz sentido quando o builder permitir múltiplos SSDs.
- **Verificado:** build válida sem regressão (11 checks, nenhum erro inesperado); forcei os 3 caminhos de erro (RAM 50mm vs 43mm do AK400, fonte 250mm vs 240mm do Air 903 MAX, CX550 com 0 conectores 8-pin vs RTX 5090) via update temporário no banco + restore — os 3 dispararam corretamente; AIO 360 no H5 Flow deu erro (mount só aceita até `rad240`), no Air 903 MAX deu ok (aceita `rad360`). Commit `d6ba166`.

**T-14 · Redeploy do `pcb_api`** ✅ CONCLUÍDO 2026-08-12
- **O que foi feito:** merge de `viewer-fase1-forma` → `master` (commit `3b41d35`, 19 arquivos reais — não confundir com uma tentativa de merge anterior que teria trazido 2062 arquivos porque uma virtualenv de teste tinha sido commitada por engano em `f397146`; corrigido antes em `0bafd8c` e o merge foi refeito limpo). `docker compose build pcb_api pcb_web && up -d` a partir de `/opt/pc-builder-br`.
- **Achado no caminho:** havia trabalho não commitado e alheio a esta sessão em `services/ingestion/specs/{aib_adapter,reconcile,url_resolver}.py` (specs de comprimento de GPU por fabricante, de 2026-08-06). Guardado em `git stash` antes do merge e devolvido depois — nada foi perdido, mas como o build do Docker copia o diretório como está no disco (não é git-aware), essas mudanças não commitadas **também foram para a imagem nova**. Vale conferir com quem estava mexendo nisso se estava em ponto publicável.
- **Verificado:** `pcb_api` e `pcb_web` healthy; `curl 127.0.0.1:8100/compatibility/check` em produção confirma T-10 (status `unknown` quando falta dado) e T-12 (CX550+RTX5090 agora dá `error`, antes era só aviso) ao vivo; `curl 127.0.0.1:3100/` responde 200.
- **Rollback, se algo der errado:** em `/opt/pc-builder-br`, primeiro `git stash push -u` (proteger o trabalho não commitado de specs/*, se ainda estiver lá), depois `git reset --hard bcfec1b` (HEAD do `master` antes do merge), `git stash pop` para devolver o trabalho de specs, e por fim `docker compose build pcb_api pcb_web && docker compose up -d pcb_api pcb_web`.

---

### GRUPO C — Viewer (🟡, opcional para lançar)

**T-20 · Linkar o download do modelo 3D** ✅ CONCLUÍDO 2026-08-12 (com um susto no caminho — ver nota)
- **Feito:** link "⬇ baixar modelo 3D do gabinete (.gltf) — estimativa, não medição" logo abaixo do gabinete vivo em `build/[slug]/page.tsx`, com `download` e tooltip mencionando Blender/Visualizador 3D do Windows.
- **Nota operacional (achada no QA mobile do Sprint 5):** a edição foi testada certinho contra o dev server do worktree (que lê direto do disco), reportada como pronta, mas o `git add` do commit que devia levá-la (`ac50f08`) não incluiu esse arquivo — ficou como mudança não commitada, nunca chegou no merge pra `master`, nunca entrou no build do `pcb_web` que eu redeployei. Só apareceu ausente quando testei em produção de verdade no Sprint 5. Corrigido em `bcf14ac` + rebuild/redeploy só do `pcb_web`. **Lição:** "testado no dev server" não é o mesmo que "commitado" — checar `git status` no worktree antes de declarar uma tarefa pronta, não só rodar o teste.
- **Verificado (depois da correção):** `curl` em produção real (porta 3100, não o dev server) confirma o link no HTML e o download funcionando (`content-disposition: attachment`); confirmado também no DOM via navegador em viewport mobile, sem overflow.

**T-21 · Corrigir o eixo da GPU no glTF** 🔴
- **Problema:** `services/ingestion/gltf_builder.py:275` usa `gpu_thick` como extensão **Z** (bandeja→vidro), mas o `h` da placement — que também é `gpu_thick` — já é o **Y**. A GPU sai como barra 360×71×71mm. O real é 360 de comprimento × 71 de espessura (vertical) × ~140 de altura de cartão.
- **Causa raiz:** a altura do cartão **não existe no catálogo**. É a mesma causa do problema já corrigido no 2D.
- **Fazer:** ou (a) adicionar `gpu.card_height_mm` ao catálogo (curadoria, ~20 GPUs) e usar; ou (b) enquanto não houver o dado, **não afirmar** a extensão — usar um valor claramente rotulado como padrão de form factor no `extras.fonte`.
- **Verificar:** baixar o `.gltf`, abrir num visualizador, conferir que a placa tem proporção de placa.

**T-22 · Remover `model_gltf_path`** ✅ CONCLUÍDO 2026-08-12
- **Feito:** removida junto a coluna vizinha `model_generated_at` (mesmo par morto — sem caminho de arquivo pra apontar, a data de geração não tinha uso). Migration Alembic `b1f4a9d02c17` (`DROP COLUMN` nas duas), aplicada no banco compartilhado depois de confirmar que as 17 linhas de `component_footprints` tinham as duas colunas 100% `NULL`. `dimensions_source`, vizinha na tabela, **ficou** — essa é usada de verdade em `seed/run_seed.py`.
- **Verificado:** módulo `models.py` importa limpo, backend isolado sobe, `/interior/estimate` e `/compatibility/check` respondem 200 depois do drop.

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
- ✅ T-05 (conectores) + a regra correspondente — commit `d6ba166`
- ✅ T-13 (regras novas) — commit `d6ba166`, 4 dos 5 itens (M.2 adiado, ver T-13)
- ⛔ T-11 (comprimento útil da GPU) — **investigado e bloqueado**, não implementado (ver T-11: nenhum gabinete do catálogo monta radiador na frente, a checagem nunca dispararia)

**Sprint 3 concluído (com uma exceção documentada) e deployado em 2026-08-12** — merge `viewer-fase1-forma` → `master` (fast-forward, sem merge commit já que master não tinha nada novo) e `docker compose build pcb_api && up -d` (só o backend mudou, `pcb_web` não precisou de rebuild). Pronto quando: as builds curadas passam limpas e builds propositalmente quebradas acusam o problema certo — **confirmado ao vivo em produção** (`curl 127.0.0.1:8100`): build válida com as 3 checagens novas presentes (`fonte cabe`, `folga de RAM`, `conector de força`), e o AIO 360 no H5 Flow acusando erro de radiador em produção real, não só no isolado. **Ainda não existe** um conjunto de builds de teste permanente (boas e ruins) — continua pendente, cada sprint até aqui testou manualmente.

### Sprint 4 — "Confiança visível"
**Objetivo:** o usuário entende de onde vem cada número.
- ✅ Origem do dado (ficha vs medido) na folga do cooler — commit `ac50f08`
- ✅ T-20 (link do 3D) — commit incluso em `ac50f08` (upload separado, sem novo commit dedicado)
- ✅ T-22 (limpeza) — commit `c13b03a`
- ⏸️ T-08 (BIOS) — **não entrou neste sprint**, é 🔴 pesquisa pesada (tabela CPU×chipset×versão mínima pra todos os pares do catálogo). Fica pra quando sobrar orçamento de tempo dedicado — ver a tarefa na Parte 2 pra escopo completo.

**Sprint 4 concluído (com T-08 explicitamente adiado) e deployado em 2026-08-12** — merge fast-forward + `docker compose build pcb_api pcb_web && up -d` (os dois, já que essa leva mexeu em backend e frontend; migration Alembic já tinha sido aplicada direto no banco compartilhado antes do build). Pronto quando: todo número na tela tem procedência rastreável na interface — **confirmado ao vivo em produção**: `curl 127.0.0.1:8100` mostra `source: "medido_noctua"` e folga 25mm (não mais 15mm) pro par 4000D+AK400; `curl 127.0.0.1:3100/build/rei-r5k/modelo.gltf` baixa de verdade (`content-disposition: attachment`); home/build/health todos 200. A única divergência ficha-vs-medido que existe hoje no catálogo (folga do cooler, T-07) aparece com selo "· medido" nos 4 lugares onde essa folga é mostrada; os outros números (comprimento de GPU, potência, conectores etc.) não têm uma segunda fonte pra divergir ainda, então não há o que rotular neles.

### Sprint 5 — Pré-lançamento
- ⏸️ Feeds de afiliado ligados (**humano, founder**) → destrava preço, custo/FPS, ranking — **não é tarefa técnica, aguarda o founder**
- ✅ QA das 3 vistas nos cards e no detalhe, em telas pequenas — feito 2026-08-12, ver nota abaixo
- ✅ Revisão final: nenhum "TODO" ou número inventado em produção — feito 2026-08-12, ver nota abaixo

**QA mobile (2026-08-12):** viewport 375×812, produção real via túnel SSH (não dev server, pra evitar repetir o susto do T-20). `document.documentElement.scrollWidth` checado contra `window.innerWidth` na home, na página de detalhe (`rei-r5k`) e na lista de builds — **zero overflow horizontal** nas 3. Os SVGs do viewer (`GabineteVivo` viewBox 720×430, `TopDownInset` viewBox 720×190) escalam corretamente dentro do viewport (`right` do bounding rect ≤ largura da viewport nos 2). O selo "· medido" (Sprint 4) renderiza por inteiro sem cortar. O link do T-20 renderiza e cabe.

**Revisão de TODO/número inventado (2026-08-12):** grep por `TODO|FIXME|XXX` em todo `services/ingestion` e `apps/web/src` não achou nenhum real (só falsos-positivos de "TODOS" em português). Nenhum texto de placeholder (`lorem ipsum`, `coming soon`, `dummy`, etc.) encontrado. `getMockRepository()` ainda existe em 3 páginas (`page.tsx`, `resultados/page.tsx`, `[...slug]/page.tsx`) mas **confirmado como fallback exclusivo de falha de transporte** (`liveResult ?? mock`, com comentário explícito "fall back to mock only if the live engine was unreachable") — não é o caminho ativo enquanto a API estiver de pé, o que está confirmado o sprint inteiro. Não é um número inventado aparecendo em produção; é uma decisão de resiliência de uma sessão anterior, documentada no próprio código — deixei como está, não é escopo deste roadmap mexer na estratégia de fallback.

**Sprint 5 (parte técnica) concluído em 2026-08-12.** O que falta pro lançamento de verdade é só a parte humana: feeds de afiliado.

---

## PARTE 3.5 — Auditoria da fundação (2026-08-12, pedido explícito: "isso precisa ficar perfeito")

Depois do Sprint 5, o Hélio pediu uma auditoria de verdade da tabela de compatibilidade — "a pedra fundamental de todo o projeto". Não foi releitura do que já estava feito; foi caça a lacuna.

### Achado crítico — RESOLVIDO — o wizard tinha motor de compatibilidade próprio

**O problema:** `services/ingestion/routers/wizard.py` (`_complete_build()`) tinha sua **própria lógica de seleção "cheapest compatible X"**, escrita independente de `compatibility.py`/`compatibility_rules`. Os 5 sprints de correção de compatibilidade — as 8 regras, o estado "desconhecido", as 4 checagens calculadas — nunca chegavam no wizard, que é o fluxo principal de recomendação ("Montar minha build").

**Provado com código real, não teoria:** em modo `budget`, `_complete_build(cpu-i5-13400f, ...)` retornava `cooler: cooler-stock-amd` — o cooler stock da AMD (soquete AM4/AM5 apenas) pra um CPU **Intel LGA1700**. Montagem fisicamente impossível. Causa: o Wraith Stealth custa **R$0** na amostra, então é sempre "o mais barato" pra qualquer CPU cujo TDP ele cubra (65W), e o filtro do wizard nunca checava soquete do cooler — só TDP.

**Escopo do estrago:** as 5 builds "Rei" da home (r3k/r5k/r8k/r12k/absoluto) são curadas à mão, não passam pelo wizard — **essas nunca estiveram em risco**. O bug só existia no fluxo interativo "Montar minha build".

**O que mais o wizard nunca verificava** (mesma causa raiz — lógica duplicada, nunca as 8 regras/4 checagens reais): `psu_case_fit`, RAM × folga do cooler, radiador AIO × mounts do gabinete, conector de força × fonte.

**Correção — fonte única de verdade:**
- `services/ingestion/compat_core.py` (novo): toda a lógica de comparação — as 8(+1) regras de tabela e as 4 checagens calculadas — extraída pra um módulo puro, sem SQLAlchemy/DB, via um `Part(name, specs)` mínimo. `evaluate(by_cat, rules) -> {errors, warnings, clearances, checks}`.
- `compatibility.py`: virou casca HTTP fina sobre `compat_core.evaluate()`. **Resposta da API idêntica a antes** — testado.
- `wizard.py`: `_complete_build()` monta o `by_cat` incrementalmente (cpu, gpu, depois cada peça escolhida) e cada peça candidata passa por `_compat_ok()` — roda `evaluate()` contra o que já foi escolhido + o candidato, **rejeita se gerar erro** (avisos não bloqueiam, mesmo critério da tela de detalhe) — antes de aceitar a mais barata.

**Testado (backend isolado 8101, antes de qualquer redeploy):**
- Regressão de `/compatibility/check`: 3 builds reais (válida, radiador incompatível, fonte insuficiente) — saída **idêntica** à de antes do refactor, checks/errors/warnings/clearances linha por linha.
- Bug reproduzido e confirmado corrigido: i5-13400F + RTX 3060 em modo budget agora escolhe `cooler-ak400` (compatível LGA1700), não mais `cooler-stock-amd`.
- Caso válido não quebrou: Ryzen 5 5600 (AM4) continua escolhendo `cooler-stock-amd` normalmente.
- Varredura completa: **7 CPUs × 4 modos = 28 combinações reais, 0 incompatibilidades de soquete**, 1 único `None` esperado (AM4 excluído de `future_proof` por design — não regressão).
- Varredura HTTP no `/wizard/` real: 5 orçamentos × 4 modos, 0 erros/exceções, contagem de candidatos no mesmo padrão de antes.

**Status:** commitado (`71b8225` no branch `viewer-fase1-forma`), **ainda não deployado em produção** — pendente confirmação explícita antes do redeploy (mudança grande demais pra subir sem check-in, mesmo padrão desta sessão inteira).

### Outros achados da auditoria

- **`cooler-lt520` tdp_rating_w corrigido: 260W → 280W** (ficha real da DeepCool, confirmada em múltiplas fontes — nunca tinha sido verificado; só os soquetes foram checados no T-02). Inofensivo no catálogo atual (nenhuma CPU passa de 260W), mas era dado errado numa regra ativa.
- **`cooler-lf3-360` (Arctic Liquid Freezer III 360) tdp_rating_w corrigido: 350W → 300W.** A Arctic **não publica** TDP oficial pra esse modelo (só pro "Pro") — 350W não tinha fonte nenhuma. 300W é apoiado em teste real (GamersNexus: delta térmico saudável a 300W sustentado) em vez de número sem lastro.
- **Nova regra `ram_speed_headroom`** (aviso, não erro): `ram.speed_mts ≤ motherboard.max_ram_speed_mts`. O dado (`max_ram_speed_mts`) existia desde o T-06 e nunca tinha virado checagem — lacuna, não bug (nenhuma combinação do catálogo atual dispara, toda RAM é mais lenta que o máximo de cada placa).
- **Achado, não corrigido — oportunidade:** existe uma tabela `thermal_rules` inteira (5 faixas de TDP → cooler recomendado + mensagem, ex. "251W+: AIO 360 recomendado") já escrita e semeada, **nunca lida por nenhum endpoint**. É recomendação positiva ("o que comprar"), diferente das checagens atuais (só pass/fail) — daria pra alimentar o wizard ou a ficha da peça. Fica como ideia pro próximo ciclo, não é uma correção urgente.
- **Achado, não corrigido — cruft inofensivo:** 4 tabelas do schema (`case_slots`, `build_clearances`, `case_airflow_zones`, `build_airflow_state`) estão **vazias e nunca lidas** — resquício de um desenho anterior (compatibilidade por "slots 3D"), substituído pela abordagem atual (specs JSONB + zone-graph). Não atrapalham nada, só confundem quem olhar o schema achando que tem lógica ali.

---

## PARTE 4 — O que NÃO fazer

- **Não** recriar a vista largura×altura do gabinete (removida, fora do escopo).
- **Não** reabrir a forma da GPU no viewer 2D por ajuste manual de coordenadas — 4 tentativas falharam; ver `docs/superpowers/specs/2026-08-07-viewer-2d-camadas-design.md`.
- **Não** usar geração de imagem por IA como referência visual de produto (testado: não suporta referência de produto, gera design plausível e falso).
- **Não** extrair em massa a base de medições da Noctua sem permissão.
- **Não** adicionar three.js/render 3D no navegador agora — não é crítico para lançar.
- **Não** comparar `motherboard.form_factor` com `case.form_factor` por igualdade (reprovaria mATX em gabinete ATX, que cabe).
