"""Testes unitários da extração de JSON do LLMSpecAdapter — sem rede.

Regressão real (2026-08-06): MiniMax-M3 é modelo de raciocínio e devolve o
JSON depois de um bloco ``<think>...</think>`` no MESMO campo de conteúdo —
sem tratar isso, ``json.loads`` falhava com "Expecting value" porque o texto
começa com "<think>", não "{" nem "```".
"""
from __future__ import annotations

from specs.llm_adapter import _strip_fences


def test_strip_fences_handles_think_block_before_fenced_json():
    raw = ('<think>O usuário quer o comprimento máximo. Vou analisar o texto.</think>\n\n'
          '```json\n{\n  "value": 425,\n  "confidence": 0.8\n}\n```\n\n'
          'Baseado no texto da página, o valor é 425mm.')
    import json
    result = json.loads(_strip_fences(raw))
    assert result == {"value": 425, "confidence": 0.8}


def test_strip_fences_handles_think_block_without_fences():
    raw = '<think>Analisando...</think>\n\n{"value": null, "confidence": 0}'
    import json
    assert json.loads(_strip_fences(raw)) == {"value": None, "confidence": 0}


def test_strip_fences_plain_json_still_works_without_think_block():
    raw = '{"value": "DDR5", "confidence": 0.95}'
    import json
    assert json.loads(_strip_fences(raw)) == {"value": "DDR5", "confidence": 0.95}


def test_strip_fences_fenced_json_without_think_block():
    raw = '```json\n{"value": "AM5", "confidence": 0.9}\n```'
    import json
    assert json.loads(_strip_fences(raw)) == {"value": "AM5", "confidence": 0.9}


def test_bare_number_response_parses_as_non_dict_not_crash():
    # achado real: o modelo às vezes devolve só "392" em vez do objeto pedido.
    # É JSON válido (um número), mas quem chama isto espera um dict — o
    # LLMSpecAdapter._call() tem de rejeitar isso, não deixar vazar um float
    # pra .get() explodir mais adiante (AttributeError visto em produção).
    import json
    parsed = json.loads(_strip_fences("392"))
    assert not isinstance(parsed, dict)
