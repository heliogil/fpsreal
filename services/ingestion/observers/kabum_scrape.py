"""KaBuM! price *observation* collector — internal monitoring, NOT store offers.

Deliberately separate from ``adapters/``. The adapter contract in
``adapters/base.py`` says a ``RawOffer`` must name an honest source and
``adapters/kabum.py`` says the KaBuM price source must be the official
affiliate feed, never scraping. That rule stands: nothing here writes to
``offers``.

What this does instead: records what a public search page showed, into
``price_observations``, so the R$/FPS side of the product has real numbers to
reason with while the affiliate feed is not yet approved. An observation is a
note about a public page, not a store offer, and is never rendered as one.

Runs against the browser-agent Playwright service (POST /scrape). The service
needs ``wait_for`` — without it the product grid has not rendered yet and the
selector returns nothing.
"""
from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from decimal import Decimal

BROWSER_AGENT = os.environ.get("BROWSER_AGENT_URL", "http://172.17.0.1:9876")
CARD_SELECTOR = 'a[href*="/produto/"]'
SEARCH_URL = "https://www.kabum.com.br/busca/{query}"

# The main price is the only one where "R$" sits alone on its line and the
# amount follows on the next -- the struck-through "de" price and the
# instalment are both inline. Captured from real cards, see the tests.
_PRICE_MAIN = re.compile(r"R\$\s*\n\s*([\d.]+,\d{2})")
_PRICE_ANY = re.compile(r"R\$\s*([\d.]+,\d{2})")
_INSTALMENT_LINE = re.compile(r"(?:no pix|\d+x de)", re.I)

_NOISE = re.compile(
    r"^(avaliação|de \d|desconto|no pix|r\$|\d+[.,]?\d*$|-?\d+%$|\d+ unid|cupom)",
    re.I,
)
_BRAND_NOISE = {"geforce", "radeon", "nvidia", "amd", "intel"}
_SUFFIXES = ("ti", "xt", "xtx", "super")


@dataclass(frozen=True)
class Observation:
    """What a public listing showed. Not an offer."""
    product_id: int
    observed_name: str
    price_brl: Decimal
    url: str | None


def to_decimal(brl: str) -> Decimal:
    """'5.699,99' -> Decimal('5699.99')"""
    return Decimal(brl.replace(".", "").replace(",", "."))


def parse_price(card_text: str) -> Decimal | None:
    m = _PRICE_MAIN.search(card_text)
    if m:
        return to_decimal(m.group(1))
    # Fallback: every price except the instalment line; the sale price is the
    # lower of what remains (the struck-through "de" is always the higher).
    candidates: list[Decimal] = []
    for line in card_text.splitlines():
        if _INSTALMENT_LINE.search(line):
            continue
        candidates += [to_decimal(p) for p in _PRICE_ANY.findall(line)]
    return min(candidates) if candidates else None


def parse_name(card_text: str) -> str | None:
    for raw in card_text.splitlines():
        line = raw.strip()
        if len(line) < 25 or _NOISE.match(line):
            continue
        return line
    return None


def normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def model_tokens(product_name: str) -> list[str]:
    return [t for t in normalise(product_name).split() if t not in _BRAND_NOISE]


def matches_model(tokens: list[str], listing_name: str) -> bool:
    """True when the listing is this exact model.

    Token containment alone is not enough: "RTX 5070" is a substring of
    "RTX 5070 Ti", so a bare model must reject a suffixed listing.
    """
    listing = normalise(listing_name)
    words = listing.split()
    if not all(t in words for t in tokens):
        return False
    numbers = [t for t in tokens if re.fullmatch(r"\d{3,4}", t)]
    if not numbers:
        return True
    wanted = [t for t in tokens if t in _SUFFIXES]
    m = re.search(rf"\b{numbers[-1]}\b\s+(\w+)", listing)
    following = m.group(1) if m else ""
    if wanted:
        return following == wanted[0]
    return following not in _SUFFIXES


def scrape_cards(query: str, timeout: int = 90) -> list[str]:
    payload = json.dumps({
        "url": SEARCH_URL.format(query=urllib.parse.quote(query)),
        "wait_for": CARD_SELECTOR,
        "selector": CARD_SELECTOR,
    }).encode()
    req = urllib.request.Request(
        f"{BROWSER_AGENT}/scrape", data=payload,
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = json.loads(r.read())
    if "error" in body:
        raise RuntimeError(body["error"])
    return body.get("matches", [])


def observe(product_id: int, product_name: str, cards: list[str]) -> list[Observation]:
    """Turn raw card text into observations for one product."""
    out: list[Observation] = []
    tokens = model_tokens(product_name)
    for card in cards:
        name = parse_name(card)
        if not name or not matches_model(tokens, name):
            continue
        price = parse_price(card)
        if price is None or price <= 0:
            continue
        out.append(Observation(product_id, name, price, None))
    return out
