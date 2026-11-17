"""Parser tests against card text captured live from KaBuM! on 2026-09-03.

The fixtures are verbatim: the newline between "R$" and the amount is the
signal that distinguishes the sale price from the struck-through one and from
the instalment, and it only survives if the fixture is not reflowed.
"""
from decimal import Decimal

from observers.kabum_scrape import (
    matches_model, model_tokens, observe, parse_name, parse_price, to_decimal,
)

CARD_5070 = (
    "\nAvaliação \n4.9\n de 5.0\n\n"
    "Placa de Vídeo Gigabyte RTX 5070 GAMING OC 12G NVIDIA GeForce, 12GB GDDR7,"
    " 192bits, RGB, DLSS, Ray Tracing - 9VN5070GO-00-G10\n"
    "R$ 6.705,87\nR$\n5.699,99\nDesconto: \n-15%\n"
    "No PIX ou 10x de R$ 670,58\n3 Unid."
)
CARD_5070_TI = (
    "\nAvaliação \n4.7\n de 5.0\n\n"
    "Placa de Vídeo ASUS PRIME RTX 5070 Ti OC 16G NVIDIA GeForce, 16GB GDDR7\n"
    "R$ 9.999,99\nR$\n8.499,99\nDesconto: \n-15%\n"
    "No PIX ou 10x de R$ 849,99\n2 Unid."
)
CARD_CUPOM = "\nCUPOM ASUSCOMPREJUNTO\nR$ 11.999,99\n"


def test_price_picks_the_sale_price_not_the_struck_or_instalment():
    # 6.705,87 is struck through, 670,58 is the instalment; 5.699,99 is real.
    assert parse_price(CARD_5070) == Decimal("5699.99")


def test_price_fallback_takes_the_lower_when_there_is_no_split_marker():
    flat = "Placa de Vídeo Qualquer Coisa 12GB\nR$ 6.705,87\nR$ 5.699,99\n"
    assert parse_price(flat) == Decimal("5699.99")


def test_price_fallback_ignores_the_instalment_line():
    flat = "Placa de Vídeo Qualquer Coisa 12GB\nR$ 5.699,99\nNo PIX ou 10x de R$ 670,58\n"
    assert parse_price(flat) == Decimal("5699.99")


def test_to_decimal_handles_brazilian_separators():
    assert to_decimal("15.000,00") == Decimal("15000.00")
    assert to_decimal("670,58") == Decimal("670.58")


def test_name_skips_rating_price_and_discount_noise():
    assert parse_name(CARD_5070).startswith("Placa de Vídeo Gigabyte RTX 5070 GAMING")


def test_bare_model_must_reject_the_suffixed_listing():
    """The whole reason token containment is not enough: 'RTX 5070' is inside
    'RTX 5070 Ti', and pricing a Ti as a 5070 corrupts the R$/FPS table."""
    bare = model_tokens("GeForce RTX 5070")
    assert matches_model(bare, "Placa de Vídeo Gigabyte RTX 5070 GAMING OC 12G")
    assert not matches_model(bare, "Placa de Vídeo ASUS PRIME RTX 5070 Ti OC 16G")


def test_suffixed_model_requires_its_suffix():
    ti = model_tokens("GeForce RTX 5070 Ti")
    assert matches_model(ti, "Placa de Vídeo ASUS PRIME RTX 5070 Ti OC 16G")
    assert not matches_model(ti, "Placa de Vídeo Gigabyte RTX 5070 GAMING OC 12G")


def test_capacity_is_part_of_the_model_when_the_catalogue_says_so():
    tokens = model_tokens("GeForce RTX 5060 Ti 16GB")
    assert matches_model(tokens, "Placa de Vídeo ASUS RTX 5060 Ti 16GB GDDR7")
    assert not matches_model(tokens, "Placa de Vídeo ASUS RTX 5060 Ti 8GB GDDR7")


def test_amd_and_intel_models_survive_brand_noise():
    assert matches_model(model_tokens("Radeon RX 9070 XT"),
                         "Placa de Vídeo ASRock Radeon RX 9070 XT Challenger, AMD, 16GB")
    assert matches_model(model_tokens("Ryzen 7 9800X3D"),
                         "Processador AMD Ryzen 7 9800X3D, 4.7GHz, AM5")
    assert matches_model(model_tokens("Core i5-13400F"),
                         "Processador Intel Core i5-13400F, 2.5GHz, LGA1700")


def test_observe_keeps_the_match_and_drops_coupon_and_wrong_model():
    obs = observe(52, "GeForce RTX 5070", [CARD_5070, CARD_5070_TI, CARD_CUPOM])
    assert len(obs) == 1
    assert obs[0].product_id == 52
    assert obs[0].price_brl == Decimal("5699.99")
    assert "RTX 5070 GAMING" in obs[0].observed_name
