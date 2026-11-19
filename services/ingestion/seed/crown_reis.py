"""Coroação automática: recalcula o Rei de cada faixa a partir do catálogo.

    python -m seed.crown_reis            # mostra o que mudaria (não grava)
    python -m seed.crown_reis --apply    # grava em curated_builds

Regra (ver tiers.py): máximo de FPS médio em 1080p com total ≤ teto da faixa,
sem erro nem aviso de compatibilidade (compat_core — a mesma regra da página),
fluxo de ar ≥ 70 (o mesmo motor do visualizador, via API) e só CPUs com
calibração (CPU_CALIBRATION). Empate de FPS → a mais barata. Sem candidata
válida, a faixa MANTÉM o Rei atual (nunca fica vazia).

Preço = oferta disponível mais barata de cada peça (hoje: amostra; com feed real
de afiliado, rodar depois de cada atualização de preço — há cron na VPS).
Só mexe nas builds `is_rei` de cada faixa; o Rei Absoluto fica como está.

Aviso "o Rei mudou" no Telegram: com --apply, depois de gravar, cada faixa que
trocou de Rei vira uma mensagem no canal — só se TELEGRAM_BOT_TOKEN e
TELEGRAM_CHAT_ID estiverem no ambiente (na VPS: /opt/pc-builder-br/.telegram.env,
lido pelo pcb-crown.sh). Falha no Telegram nunca desfaz a coroação.
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import os
import sys
import time
import urllib.request
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from compat_core import Part, evaluate
from seed.performance_data import CPU_CALIBRATION
from tiers import MIN_AIRFLOW, RANK_GAMES, RANK_RESOLUTION, TIERS, Tier

SLOTS = ["cpu", "gpu", "ram", "motherboard", "storage", "psu", "case", "cooler"]
SITE = "https://reidofps.com.br"
API = os.environ.get("PCB_API_URL", "http://pcb_api:8100")
MAX_AIR_CALLS_PER_PAIR = 60


# ── núcleo puro (testado em tests/test_crown.py) ─────────────────────────────
def _brl(v: float) -> str:
    return "R$ " + f"{v:,.0f}".replace(",", ".")


def telegram_message(tier_label: str, cpu: str, gpu: str, total: float, fps: float, slug: str) -> str:
    """Texto do aviso "o Rei mudou" (pt-BR, sem formatação especial)."""
    per_fps = f"{total / fps:.2f}".replace(".", ",") if fps else "—"
    return (
        f"👑 Novo Rei {tier_label}\n"
        f"{cpu} + {gpu}\n"
        f"{_brl(total)} · {fps:.0f} FPS médios em 1080p · R$ {per_fps}/FPS\n"
        f"{SITE}/build/{slug}?utm_source=telegram&utm_medium=rei-mudou\n"
        "(estimativa — preços do momento)"
    )


def notify_telegram(messages: List[str]) -> None:
    """Envia cada mensagem ao canal. Sem token/canal no ambiente, não faz nada.
    Nunca imprime o token nem a URL (que o contém)."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not messages or not token or not chat:
        return
    sent = 0
    for text in messages:
        body = json.dumps({"chat_id": chat, "text": text, "disable_web_page_preview": False}).encode()
        req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body,
                                     headers={"content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                sent += 1 if r.status == 200 else 0
        except Exception as e:  # noqa: BLE001 — aviso é acessório
            print(f"telegram: falhou ({type(e).__name__})")
    print(f"telegram: {sent}/{len(messages)} aviso(s) enviado(s)")


def pick_rei(
    pairs: Iterable[Tuple[float, Callable[[], Optional[Tuple[float, dict]]]]],
    tier: Tier,
) -> Optional[Tuple[float, float, dict]]:
    """`pairs` = (fps_médio, completar) por par CPU×GPU; `completar()` devolve a
    build válida MAIS BARATA do par (total, peças) ou None. Devolve
    (fps, total, peças) do Rei, ou None.

    Vai do par com mais FPS para baixo e para no primeiro FPS (arredondado) que
    tem build dentro da faixa; entre pares desse mesmo FPS fica a mais barata.
    A completação é cara (fluxo de ar via API), por isso só é pedida quando
    o par ainda pode ganhar.
    """
    best: Optional[Tuple[float, float, dict]] = None
    for fps, complete in sorted(pairs, key=lambda p: -p[0]):
        if best is not None and round(fps) < round(best[0]):
            break
        got = complete()
        if got is None:
            continue
        total, parts = got
        if total <= tier.floor_brl or (tier.cap_brl is not None and total > tier.cap_brl):
            continue
        if best is None or total < best[1]:
            best = (fps, total, parts)
    return best


def geomean(values: List[float]) -> float:
    v = [x for x in values if x > 0]
    return math.exp(sum(math.log(x) for x in v) / len(v)) if v else 0.0


# ── dados ────────────────────────────────────────────────────────────────────
class _Rule:
    def __init__(self, row):
        (self.rule_type, self.category_a, self.attribute_a, self.operator,
         self.category_b, self.attribute_b, self.severity, self.message_template) = row


def _connect():
    import psycopg2  # só aqui: os testes do núcleo puro não precisam do driver

    dsn = os.environ["DATABASE_URL"]
    for pre in ("postgresql+asyncpg://", "postgresql+psycopg2://"):
        dsn = dsn.replace(pre, "postgresql://")
    return psycopg2.connect(dsn)


def _airflow(parts: dict) -> Optional[float]:
    body = json.dumps({"components": {f"{k}_id": v["id"] for k, v in parts.items()}}).encode()
    req = urllib.request.Request(f"{API}/interior/estimate", data=body,
                                 headers={"content-type": "application/json"})
    try:
        return float(json.load(urllib.request.urlopen(req, timeout=20))["airflow"]["score"])
    except Exception:  # noqa: BLE001 — sem estimativa = não pode ser Rei
        return None


# Falha de rede ≠ fluxo de ar baixo. `_airflow` devolve None quando a API não
# responde (ex.: o pcb_api a reiniciar num deploy). Tratar isso como "fluxo
# insuficiente" descartava builds boas e podia coroar um Rei pior (visto em
# 2026-11-19, com o seed.best_by_budget). Por isso: até 3 tentativas e, se
# ainda falhar, o run PARA na hora sem gravar nada — os Reis atuais ficam.
class AirflowUnavailable(RuntimeError):
    """A API de fluxo de ar não respondeu depois das tentativas."""


def _air(parts: dict, sleep: Callable[[float], None] = time.sleep) -> float:
    for wait in (0, 2, 5):
        if wait:
            sleep(wait)
        r = _airflow(parts)
        if r is not None:
            return r
    raise AirflowUnavailable(f"{API}/interior/estimate sem resposta")


def run(apply: bool) -> int:
    try:
        return _run(apply)
    except AirflowUnavailable as e:
        print(f"ABORTADO: {e} — nada gravado, os Reis atuais ficam")
        return 3


def _run(apply: bool) -> int:
    con = _connect()
    cur = con.cursor()
    cur.execute("""SELECT p.id, p.sku, p.name, p.category, p.specs, MIN(o.price_brl)
                   FROM products p JOIN variants v ON v.product_id=p.id
                   JOIN offers o ON o.variant_id=v.id AND o.is_available
                   WHERE p.is_active GROUP BY p.id""")
    prods: Dict[int, dict] = {}
    by_cat: Dict[str, List[dict]] = {}
    for pid, sku, name, cat, specs, price in cur.fetchall():
        d = {"id": pid, "sku": sku, "name": name, "cat": cat, "specs": specs or {}, "price": float(price)}
        prods[pid] = d
        if cat == "cpu" and sku not in CPU_CALIBRATION:
            continue  # FPS desta CPU é palpite — não pode ser Rei
        by_cat.setdefault(cat, []).append(d)

    cur.execute("""SELECT cpu_id, gpu_id, game_slug, fps_estimate FROM fps_estimates
                   WHERE resolution=%s AND preset='high' AND game_slug = ANY(%s)""",
                (RANK_RESOLUTION, RANK_GAMES))
    per_pair: Dict[Tuple[int, int], Dict[str, float]] = {}
    for c, g, game, f in cur.fetchall():
        per_pair.setdefault((c, g), {})[game] = float(f)

    def avg(c: int, g: int) -> Optional[float]:
        d = per_pair.get((c, g), {})
        return geomean(list(d.values())) if len(d) == len(RANK_GAMES) else None

    cur.execute("""SELECT rule_type, category_a, attribute_a, operator, category_b, attribute_b,
                          severity, message_template FROM compatibility_rules WHERE is_active""")
    rules = [_Rule(r) for r in cur.fetchall()]

    def clean(parts: dict) -> bool:
        r = evaluate({k: Part(name=v["name"], specs=v["specs"]) for k, v in parts.items()}, rules)
        return not r["errors"] and not r["warnings"]

    plat = [x for x in itertools.product(by_cat["cpu"], by_cat["motherboard"], by_cat["ram"], by_cat["cooler"])
            if clean(dict(zip(("cpu", "motherboard", "ram", "cooler"), x)))]

    air_cache: Dict[tuple, Optional[float]] = {}
    memo: Dict[Tuple[int, int], Optional[Tuple[float, dict]]] = {}

    def completer(cpu: dict, gpu: dict) -> Callable[[], Optional[Tuple[float, dict]]]:
        def complete():
            k = (cpu["id"], gpu["id"])
            if k in memo:
                return memo[k]
            combos = []
            for (_, mb, ram, cool), psu, case, ssd in itertools.product(
                    [p for p in plat if p[0]["id"] == cpu["id"]], by_cat["psu"], by_cat["case"], by_cat["storage"]):
                parts = {"cpu": cpu, "gpu": gpu, "ram": ram, "motherboard": mb,
                         "storage": ssd, "psu": psu, "case": case, "cooler": cool}
                combos.append((sum(p["price"] for p in parts.values()), parts))
            combos.sort(key=lambda x: x[0])
            calls, found = 0, None
            for total, parts in combos:
                if not clean(parts):
                    continue
                key = (cpu["id"], gpu["id"], parts["case"]["id"], parts["cooler"]["id"], parts["psu"]["id"])
                if key not in air_cache:
                    if calls >= MAX_AIR_CALLS_PER_PAIR:
                        break
                    air_cache[key] = _air(parts)
                    calls += 1
                af = air_cache[key]
                if af is not None and af >= MIN_AIRFLOW:
                    found = (total, parts)
                    break
            memo[k] = found
            return found
        return complete

    pairs = [(a, completer(c, g)) for c in by_cat["cpu"] for g in by_cat["gpu"]
             if (a := avg(c["id"], g["id"])) is not None]

    cur.execute("""SELECT id, slug, budget_tier, cpu_id, gpu_id, ram_id, motherboard_id, storage_id,
                          psu_id, case_id, cooler_id, total_price_brl
                   FROM curated_builds WHERE is_rei AND is_active""")
    current = {r[2]: r for r in cur.fetchall()}

    changed = 0
    announce: List[str] = []
    for tier in TIERS:
        row = current.get(tier.key)
        if row is None:
            print(f"[{tier.key}] sem build Rei ativa — nada a fazer")
            continue
        bid, slug = row[0], row[1]
        cur_ids = dict(zip(SLOTS, row[3:11]))
        cur_fps = avg(cur_ids["cpu"], cur_ids["gpu"]) or 0
        cur_total = float(row[11] or 0)
        best = pick_rei(pairs, tier)
        print(f"[{tier.key}] {tier.label}: atual {prods[cur_ids['cpu']]['name']} + {prods[cur_ids['gpu']]['name']}"
              f" · R$ {cur_total:,.0f} · {cur_fps:.0f} FPS")
        if best is None:
            print("    sem candidata válida nesta faixa — mantém a atual (só o nome é atualizado)")
            if apply:
                cur.execute("UPDATE curated_builds SET name=%s WHERE id=%s", (tier.rei_name, bid))
            continue
        fps, total, parts = best
        new_ids = {k: v["id"] for k, v in parts.items()}
        same = all(new_ids[k] == cur_ids[k] for k in SLOTS)
        print(f"    {'mantém' if same else 'NOVO REI'}: {parts['cpu']['name']} + {parts['gpu']['name']}"
              f" · R$ {total:,.0f} · {fps:.0f} FPS · R$ {total / fps:.2f}/FPS")
        if not same:
            for k in SLOTS:
                if new_ids[k] != cur_ids[k]:
                    print(f"      {k}: {prods[cur_ids[k]]['name'] if cur_ids[k] in prods else cur_ids[k]} → {parts[k]['name']}")
        seo = (f"O máximo de FPS {tier.label} em 1080p: {parts['cpu']['name']} + {parts['gpu']['name']}"
               f" (estimativa).")
        if apply:
            if same:
                cur.execute("UPDATE curated_builds SET name=%s, total_price_brl=%s, fps_per_brl=%s WHERE id=%s",
                            (tier.rei_name, round(total, 2), round(fps / total, 4), bid))
            else:
                changed += 1
                announce.append(telegram_message(tier.label, parts["cpu"]["name"], parts["gpu"]["name"],
                                                 total, fps, slug))
                cur.execute(
                    """UPDATE curated_builds SET name=%s, cpu_id=%s, gpu_id=%s, ram_id=%s, motherboard_id=%s,
                         storage_id=%s, psu_id=%s, case_id=%s, cooler_id=%s, total_price_brl=%s,
                         fps_per_brl=%s, seo_description=%s, crowned_at=NOW() WHERE id=%s""",
                    (tier.rei_name, *[new_ids[k] for k in SLOTS], round(total, 2), round(fps / total, 4), seo, bid))
        elif not same:
            changed += 1
    if apply:
        con.commit()
        print(f"gravado: {changed} faixa(s) com Rei novo")
        notify_telegram(announce)
    else:
        print(f"simulação: {changed} faixa(s) mudariam — rodar com --apply para gravar")
    con.close()
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    sys.exit(run(ap.parse_args().apply))
